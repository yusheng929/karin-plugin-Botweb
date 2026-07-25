import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BotInfo,
  FriendItem,
  GroupItem,
  GroupMemberItem,
  MessageElement,
  ChatScene,
  ChatMessage
} from '../../core/types'
import * as api from '../api'
import { wsClient } from '../api'
import { toMillis } from '../utils'
import { useUi } from './ui'

export interface Conversation {
  /** 会话 key：`${scene}:${peer}`（不含 selfId，均属于当前选中 bot） */
  key: string
  scene: ChatScene
  peer: string
  name: string
  avatar?: string
  unreadCount: number
  lastMsg?: ChatMessage
}

interface ChatContextType {
  bots: BotInfo[]
  currentBot: BotInfo | null
  selectBot: (selfId: string) => void
  conversations: Conversation[]
  currentKey: string | null
  currentConversation: Conversation | null
  openConversation: (key: string | null) => void
  /** 当前会话的消息（启动时从后端 db 全量拉取 + 页面打开后累积的实时消息 + 自己发送的，只存内存） */
  messages: ChatMessage[]
  groupMembers: GroupMemberItem[]
  refreshGroupMembers: () => void
  /** 当前 bot 在当前群内的角色（非群会话为 null） */
  botGroupRole: 'owner' | 'admin' | 'member' | 'unknown' | null
  /** 各 bot 的未读总数（用于 bot 选择器角标） */
  botUnread: Record<string, number>
  /** 当前 bot 的用户头像（后端协议端 getAvatarUrl 提供并带 db 缓存；未命中返回 undefined，调用方用字母占位兜底） */
  resolveAvatar: (userId: string) => string | undefined
  sendMessage: (elements: MessageElement[]) => Promise<void>
  resendMessage: (messageId: string) => Promise<void>
  recallMessage: (msg: ChatMessage) => Promise<void>
  /** 面板戳一戳成功后的本地乐观上屏（系统灰条） */
  appendLocalPoke: (scene: ChatScene, peer: string, targetId: string) => void
  handleFiles: (files: FileList | File[] | null) => Promise<void>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

/** 消息在 messageMap 中的完整 key：`${selfId}:${scene}:${peer}`（消息属于哪个 bot 就入哪个 bot 的库） */
const fullKey = (selfId: string, scene: ChatScene, peer: string) => `${selfId}:${scene}:${peer}`

/** 发送文件的大小上限（base64 内联发送，过大会撑爆请求） */
const MAX_FILE_SIZE = 20 * 1024 * 1024

// ---------- messageMap reducer ----------

type MessageMapState = Record<string, ChatMessage[]>

type MessageMapAction =
  /** 启动时合并后端拉取的历史消息（按 key 合并 + messageId 去重 + 时间升序，不覆盖已到达的实时消息） */
  | { type: 'merge', entries: MessageMapState }
  /** WS 推送的消息：幂等去重 + 合并到仍在 sending 的本地乐观消息 */
  | { type: 'receive', msg: ChatMessage }
  /** 直接追加（戳一戳灰条 / 本地乐观消息） */
  | { type: 'append', key: string, msg: ChatMessage }
  /** 按 messageId 局部更新（发送状态推进等） */
  | { type: 'update', key: string, messageId: string, updates: Partial<ChatMessage> }
  /** 给指定消息打已撤回标记（气泡红框 + 「消息已撤回」，幂等） */
  | { type: 'recall', key: string, messageId: string }

const messageMapReducer = (state: MessageMapState, action: MessageMapAction): MessageMapState => {
  switch (action.type) {
    case 'merge': {
      const next = { ...state }
      for (const key of Object.keys(action.entries)) {
        const seen = new Set<string>()
        next[key] = [...(next[key] || []), ...action.entries[key]]
          .filter(m => {
            if (seen.has(m.messageId)) return false
            seen.add(m.messageId)
            return true
          })
          .sort((a, b) => toMillis(a.time) - toMillis(b.time))
      }
      return next
    }
    case 'receive': {
      const { msg } = action
      const key = fullKey(msg.selfId, msg.scene, msg.peer)
      const list = state[key] || []
      // 幂等：同 messageId 不重复入库（自己发送的消息会被后端再广播一次）
      if (list.some(m => m.messageId === msg.messageId)) return state
      // 广播先于 REST 响应到达时，合并到仍在 sending 的本地乐观消息上
      if (msg.senderId === msg.selfId) {
        const pending = list.find(m => m.status === 'sending' && JSON.stringify(m.elements) === JSON.stringify(msg.elements))
        if (pending) {
          return { ...state, [key]: list.map(m => (m === pending ? { ...msg, status: undefined } : m)) }
        }
      }
      return { ...state, [key]: [...list, msg] }
    }
    case 'append':
      return { ...state, [action.key]: [...(state[action.key] || []), action.msg] }
    case 'update': {
      const list = state[action.key]
      if (!list) return state
      return { ...state, [action.key]: list.map(m => (m.messageId === action.messageId ? { ...m, ...action.updates } : m)) }
    }
    case 'recall': {
      const list = state[action.key]
      if (!list) return state
      const idx = list.findIndex(m => m.messageId === action.messageId)
      if (idx === -1) return state
      const msg = list[idx]
      if (msg.recalled || msg.system) return state
      const next = [...list]
      next[idx] = { ...msg, recalled: true, status: undefined }
      return { ...state, [action.key]: next }
    }
    default:
      return state
  }
}

// ---------- unreadByBot reducer ----------

/** 各 bot 的未读：selfId -> 会话 key（`${scene}:${peer}`）-> 未读数 */
type UnreadState = Record<string, Record<string, number>>

type UnreadAction =
  | { type: 'merge', entries: UnreadState }
  | { type: 'increment', selfId: string, key: string }
  | { type: 'clear', selfId: string, key: string }

const unreadReducer = (state: UnreadState, action: UnreadAction): UnreadState => {
  switch (action.type) {
    case 'merge':
      return { ...state, ...action.entries }
    case 'increment':
      return {
        ...state,
        [action.selfId]: {
          ...state[action.selfId],
          [action.key]: (state[action.selfId]?.[action.key] || 0) + 1
        }
      }
    case 'clear':
      return state[action.selfId]?.[action.key]
        ? { ...state, [action.selfId]: { ...state[action.selfId], [action.key]: 0 } }
        : state
    default:
      return state
  }
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    setToast, setReplyTo, setContextMenu, setShowSettings
  } = useUi()

  const [bots, setBots] = useState<BotInfo[]>([])
  const [currentBotId, setCurrentBotId] = useState<string | null>(null)
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [groups, setGroups] = useState<GroupItem[]>([])
  /** 所有 bot 的消息，key 为 `${selfId}:${scene}:${peer}` */
  const [messageMap, dispatchMessages] = useReducer(messageMapReducer, {})
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [unreadByBot, dispatchUnread] = useReducer(unreadReducer, {})
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([])
  /** 用户头像表：`${selfId}:${userId}` -> url（来源：profiles 推送增量 + avatars 接口补拉，均为后端协议端 getAvatarUrl） */
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({})

  const currentBot = useMemo(() => bots.find(b => b.selfId === currentBotId) || null, [bots, currentBotId])

  // WS 回调里需要读到最新的状态，使用 ref 避免重复订阅
  const currentBotRef = useRef<BotInfo | null>(null)
  currentBotRef.current = currentBot
  const currentKeyRef = useRef<string | null>(null)
  currentKeyRef.current = currentKey
  // 头像补拉 effect 里读最新 avatarMap，避免把它列为依赖造成循环
  const avatarMapRef = useRef(avatarMap)
  avatarMapRef.current = avatarMap
  /** 已请求过头像的 key：后端拿不到 url 的 ID 不重复打接口 */
  const requestedAvatarsRef = useRef(new Set<string>())

  /** 合并头像增量进 avatarMap */
  const mergeAvatars = useCallback((selfId: string, entries: Array<[string, string]>) => {
    setAvatarMap(prev => {
      const next = { ...prev }
      for (const [userId, avatar] of entries) {
        if (avatar) next[`${selfId}:${userId}`] = avatar
      }
      return next
    })
  }, [])

  /** 当前 bot 的用户头像（未命中返回 undefined，组件用字母占位兜底） */
  const resolveAvatar = useCallback((userId: string): string | undefined => {
    const bot = currentBotRef.current
    return bot ? avatarMap[`${bot.selfId}:${userId}`] : undefined
  }, [avatarMap])

  /** 解析用户显示名：bot 自己为「你」，其次好友备注/昵称、群名片/昵称，兜底 ID */
  const resolveName = useCallback((selfId: string, userId: string): string => {
    if (userId === selfId) return '你'
    const friend = friends.find(f => String(f.userId) === String(userId))
    if (friend) return friend.remark || friend.nick || userId
    const member = groupMembers.find(m => String(m.userId) === String(userId))
    if (member) return member.card || member.nick || userId
    const bot = bots.find(b => b.selfId === userId)
    if (bot) return bot.name
    return userId
  }, [friends, groupMembers, bots])

  const resolveNameRef = useRef(resolveName)
  resolveNameRef.current = resolveName

  // ---------- 数据加载 ----------

  useEffect(() => {
    api.getBots()
      .then(list => {
        setBots(list)
        if (list.length > 0) setCurrentBotId(list[0].selfId)
        // 恢复所有 bot 的未读缓存（消息本身走后端 db 持久化，见下方 getMessages 拉取）
        const unreadEntries: UnreadState = {}
        for (const bot of list) {
          try {
            const saved = localStorage.getItem(`botweb:unread:${bot.selfId}`)
            unreadEntries[bot.selfId] = saved ? JSON.parse(saved) : {}
          } catch (e) {
            unreadEntries[bot.selfId] = {}
          }
        }
        dispatchUnread({ type: 'merge', entries: unreadEntries })
        // 拉取各 bot 的本地存储消息（只存内存，关闭/刷新后重新拉取）；单个 bot 失败不影响其他
        for (const bot of list) {
          api.getMessages(bot.selfId)
            .then(msgs => {
              const entries: MessageMapState = {}
              for (const msg of msgs) {
                const key = fullKey(msg.selfId, msg.scene, msg.peer)
                if (!entries[key]) entries[key] = []
                entries[key].push(msg)
              }
              dispatchMessages({ type: 'merge', entries })
            })
            .catch(err => setToast({ message: `拉取历史消息失败: ${err.message}`, type: 'error' }))
        }
      })
      .catch(err => setToast({ message: `获取 Bot 列表失败: ${err.message}`, type: 'error' }))
  }, [setToast])

  const selectBot = useCallback((selfId: string) => {
    setCurrentBotId(selfId)
  }, [])

  // 切换 bot：重置会话相关状态，重新拉取好友/群列表（消息全 bot 常驻内存，无需切换）
  useEffect(() => {
    if (!currentBotId) return
    setCurrentKey(null)
    setGroupMembers([])
    setReplyTo(null)
    setContextMenu(null)
    setShowSettings(false)
    Promise.all([api.getFriends(currentBotId), api.getGroups(currentBotId)])
      .then(([friendList, groupList]) => {
        setFriends(friendList)
        setGroups(groupList)
      })
      .catch(err => setToast({ message: `获取联系人失败: ${err.message}`, type: 'error' }))
  }, [currentBotId, setToast, setReplyTo, setContextMenu, setShowSettings])

  // 未读持久化（按 bot 存到 localStorage）
  useEffect(() => {
    for (const selfId of Object.keys(unreadByBot)) {
      try {
        localStorage.setItem(`botweb:unread:${selfId}`, JSON.stringify(unreadByBot[selfId]))
      } catch (e) { /* ignore */ }
    }
  }, [unreadByBot])

  // 打开会话：清零未读；群会话拉取成员列表（供 @ 菜单与成员侧栏使用）
  useEffect(() => {
    if (!currentKey || !currentBotId) {
      setGroupMembers([])
      return
    }
    dispatchUnread({ type: 'clear', selfId: currentBotId, key: currentKey })
    const [scene, peer] = currentKey.split(':') as [ChatScene, string]
    if (scene === 'group') {
      api.getGroupMembers(currentBotId, peer)
        .then(setGroupMembers)
        .catch(() => setGroupMembers([]))
    } else {
      setGroupMembers([])
    }
  }, [currentKey, currentBotId])

  const refreshGroupMembers = useCallback(() => {
    if (!currentKey || !currentBotId) return
    const [scene, peer] = currentKey.split(':') as [ChatScene, string]
    if (scene !== 'group') return
    api.getGroupMembers(currentBotId, peer)
      .then(setGroupMembers)
      .catch(() => { /* ignore */ })
  }, [currentKey, currentBotId])

  /** 当前 bot 在当前群内的角色 */
  const botGroupRole = useMemo(() => {
    if (!currentBot) return null
    return groupMembers.find(m => String(m.userId) === String(currentBot.selfId))?.role ?? null
  }, [groupMembers, currentBot])

  /** 各 bot 未读总数 */
  const botUnread = useMemo(() => {
    const out: Record<string, number> = {}
    for (const selfId of Object.keys(unreadByBot)) {
      out[selfId] = Object.values(unreadByBot[selfId]).reduce((a, b) => a + b, 0)
    }
    return out
  }, [unreadByBot])

  // ---------- 撤回标记 / 戳一戳灰条 ----------

  /** 给指定消息打已撤回标记（气泡红框 + 「消息已撤回」，幂等） */
  const applyRecall = useCallback((selfId: string, scene: ChatScene, peer: string, messageId: string) => {
    dispatchMessages({ type: 'recall', key: fullKey(selfId, scene, peer), messageId })
  }, [])

  /** 面板发起戳一戳的待回显计数（key: selfId:scene:peer:operatorId:targetId），协议端回显自己的戳一戳时按此去重 */
  const pendingPokeRef = useRef(new Map<string, { count: number, time: number }>())

  /** 追加戳一戳系统灰条（WS 推送与本地乐观上屏共用） */
  const appendPoke = useCallback((selfId: string, scene: ChatScene, peer: string, operatorId: string, targetId: string, action: string, suffix: string) => {
    const opName = resolveNameRef.current(selfId, operatorId)
    const targetName = resolveNameRef.current(selfId, targetId)
    const text = `${opName} ${action} ${targetName} ${suffix}`.replace(/\s+/g, ' ').trim()
    const sysMsg: ChatMessage = {
      messageId: `poke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seq: 0,
      selfId,
      scene,
      peer,
      senderId: operatorId,
      senderName: opName,
      time: Math.floor(Date.now() / 1000),
      elements: [{ type: 'text', text }],
      system: true
    }
    dispatchMessages({ type: 'append', key: fullKey(selfId, scene, peer), msg: sysMsg })
  }, [])

  /** 面板戳一戳成功后的本地乐观上屏（多数协议端不回显自己的戳一戳 notice，收不到 WS 推送） */
  const appendLocalPoke = useCallback((scene: ChatScene, peer: string, targetId: string) => {
    const bot = currentBotRef.current
    if (!bot) return
    const dedupKey = `${bot.selfId}:${scene}:${peer}:${bot.selfId}:${targetId}`
    const entry = pendingPokeRef.current.get(dedupKey)
    pendingPokeRef.current.set(dedupKey, { count: (entry?.count || 0) + 1, time: Date.now() })
    appendPoke(bot.selfId, scene, peer, bot.selfId, targetId, '戳了戳', '')
  }, [appendPoke])

  // ---------- WS 推送 ----------

  useEffect(() => {
    wsClient.connect()

    const unbindMessage = wsClient.onMessage((msg) => {
      // 后端广播所有 bot 的消息，按各自 selfId 入库
      dispatchMessages({ type: 'receive', msg })

      // 未读记到消息所属 bot 头上；正在看该会话（同 bot 同会话）则不计
      const shortKey = `${msg.scene}:${msg.peer}`
      const isViewing = msg.selfId === currentBotRef.current?.selfId && currentKeyRef.current === shortKey
      if (msg.senderId !== msg.selfId && !isViewing) {
        dispatchUnread({ type: 'increment', selfId: msg.selfId, key: shortKey })
      }
    })

    const unbindRecall = wsClient.onRecall(({ selfId, messageId, scene, peer }) => {
      applyRecall(selfId, scene, peer, messageId)
    })

    const unbindPoke = wsClient.onPoke(({ selfId, scene, peer, operatorId, targetId, action, suffix }) => {
      // 协议端若回显面板自己发起的戳一戳（10 秒窗口内），按计数去重，避免灰条双条
      const dedupKey = `${selfId}:${scene}:${peer}:${operatorId}:${targetId}`
      const entry = pendingPokeRef.current.get(dedupKey)
      if (entry) {
        if (entry.count > 0 && Date.now() - entry.time < 10_000) {
          pendingPokeRef.current.set(dedupKey, { count: entry.count - 1, time: entry.time })
          return
        }
        pendingPokeRef.current.delete(dedupKey)
      }
      appendPoke(selfId, scene, peer, operatorId, targetId, action, suffix)
    })

    // 会话资料增量（无列表接口的协议端收消息后补全头像/名称）：
    // friends/groups upsert 进当前 bot 状态（只填空缺字段），users 头像增量进 avatarMap（全 bot）
    const unbindProfiles = wsClient.onProfiles(({ selfId, friends: newFriends, groups: newGroups, users }) => {
      if (users && users.length > 0) {
        mergeAvatars(selfId, users.map(u => [u.userId, u.avatar]))
      }
      // friends/groups 状态只挂当前选中 bot；其他 bot 的资料由后端 db 缓存兜底，切 bot 重拉时带回
      if (selfId !== currentBotRef.current?.selfId) return
      if (newFriends.length > 0) {
        setFriends(prev => {
          const map = new Map(prev.map(f => [String(f.userId), f]))
          for (const f of newFriends) {
            const old = map.get(String(f.userId))
            map.set(String(f.userId), old
              ? { ...old, nick: old.nick || f.nick, avatar: old.avatar || f.avatar, remark: old.remark || f.remark }
              : f)
          }
          return [...map.values()]
        })
      }
      if (newGroups.length > 0) {
        setGroups(prev => {
          const map = new Map(prev.map(g => [String(g.groupId), g]))
          for (const g of newGroups) {
            const old = map.get(String(g.groupId))
            map.set(String(g.groupId), old
              ? { ...old, groupName: old.groupName || g.groupName, avatar: old.avatar || g.avatar, memberCount: old.memberCount || g.memberCount }
              : g)
          }
          return [...map.values()]
        })
      }
    })

    return () => {
      unbindMessage()
      unbindRecall()
      unbindPoke()
      unbindProfiles()
    }
  }, [applyRecall, appendPoke, mergeAvatars])

  // ---------- 会话列表 ----------

  const conversations = useMemo<Conversation[]>(() => {
    if (!currentBotId) return []
    const prefix = `${currentBotId}:`
    const shortMap: Record<string, ChatMessage[]> = {}
    for (const key of Object.keys(messageMap)) {
      if (key.startsWith(prefix)) shortMap[key.slice(prefix.length)] = messageMap[key]
    }

    const list: Conversation[] = [
      ...friends.map(f => {
        const key = `friend:${f.userId}`
        const msgs = shortMap[key]
        return {
          key,
          scene: 'friend' as ChatScene,
          peer: f.userId,
          name: f.remark || f.nick || f.userId,
          avatar: f.avatar,
          unreadCount: unreadByBot[currentBotId]?.[key] || 0,
          lastMsg: msgs && msgs.length > 0 ? msgs[msgs.length - 1] : undefined
        }
      }),
      ...groups.map(g => {
        const key = `group:${g.groupId}`
        const msgs = shortMap[key]
        return {
          key,
          scene: 'group' as ChatScene,
          peer: g.groupId,
          name: g.groupName || g.groupId,
          avatar: g.avatar,
          unreadCount: unreadByBot[currentBotId]?.[key] || 0,
          lastMsg: msgs && msgs.length > 0 ? msgs[msgs.length - 1] : undefined
        }
      })
    ]
    // 收到陌生人/未知群消息时，补充一个临时会话入口
    for (const key of Object.keys(shortMap)) {
      if (list.some(c => c.key === key)) continue
      const [scene, peer] = key.split(':') as [ChatScene, string]
      const msgs = shortMap[key]
      list.push({
        key,
        scene,
        peer,
        name: peer,
        unreadCount: unreadByBot[currentBotId]?.[key] || 0,
        lastMsg: msgs.length > 0 ? msgs[msgs.length - 1] : undefined
      })
    }
    // 按最后消息时间倒序（兼容秒/毫秒时间戳）
    return list.sort((a, b) => toMillis(b.lastMsg?.time || 0) - toMillis(a.lastMsg?.time || 0))
  }, [currentBotId, friends, groups, messageMap, unreadByBot])

  const currentConversation = useMemo(
    () => conversations.find(c => c.key === currentKey) || null,
    [conversations, currentKey]
  )

  const currentConversationRef = useRef<Conversation | null>(null)
  currentConversationRef.current = currentConversation

  const messages = useMemo(
    () => (currentBotId && currentKey ? messageMap[fullKey(currentBotId, currentKey.split(':')[0] as ChatScene, currentKey.split(':')[1])] || [] : []),
    [messageMap, currentBotId, currentKey]
  )

  // 头像补拉：当前群会话的消息发送者与成员列表里缺头像的 ID，批量走后端 getAvatarUrl（结果带 db 缓存）。
  // 覆盖 db 拉取的历史消息发送者，以及无成员列表接口协议端的成员/发言人头像
  useEffect(() => {
    if (!currentBotId || !currentKey) return
    if (currentKey.split(':')[0] !== 'group') return
    const missing = new Set<string>()
    const collect = (userId?: string) => {
      if (!userId || userId === currentBotId) return
      const key = `${currentBotId}:${userId}`
      if (!avatarMapRef.current[key] && !requestedAvatarsRef.current.has(key)) missing.add(userId)
    }
    for (const m of messages) collect(m.senderId)
    for (const m of groupMembers) collect(m.userId)
    if (missing.size === 0) return
    const ids = [...missing].slice(0, 50)
    for (const id of ids) requestedAvatarsRef.current.add(`${currentBotId}:${id}`)
    api.getAvatars(currentBotId, ids)
      .then(map => mergeAvatars(currentBotId, Object.entries(map)))
      .catch(() => { /* 静默失败：组件用字母占位兜底 */ })
  }, [currentBotId, currentKey, messages, groupMembers, mergeAvatars])

  const openConversation = useCallback((key: string | null) => {
    setCurrentKey(key)
    setReplyTo(null)
    setContextMenu(null)
    setShowSettings(false)
  }, [setReplyTo, setContextMenu, setShowSettings])

  // ---------- 发送 / 撤回 ----------

  const updateMessage = useCallback((key: string, messageId: string, updates: Partial<ChatMessage>) => {
    dispatchMessages({ type: 'update', key, messageId, updates })
  }, [])

  const doSend = useCallback(async (scene: ChatScene, peer: string, elements: MessageElement[], localId?: string) => {
    const bot = currentBotRef.current
    if (!bot) return
    const key = fullKey(bot.selfId, scene, peer)
    const tempId = localId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    if (!localId) {
      // 乐观上屏
      const optimistic: ChatMessage = {
        messageId: tempId,
        seq: 0,
        selfId: bot.selfId,
        scene,
        peer,
        senderId: bot.selfId,
        senderName: bot.name,
        time: Math.floor(Date.now() / 1000),
        elements,
        status: 'sending'
      }
      dispatchMessages({ type: 'append', key, msg: optimistic })
    } else {
      updateMessage(key, tempId, { status: 'sending' })
    }

    try {
      const res = await api.sendMessage({ selfId: bot.selfId, scene, peer, elements })
      updateMessage(key, tempId, { messageId: res.messageId, time: res.time, status: undefined })
    } catch (err) {
      updateMessage(key, tempId, { status: 'failed' })
      throw err
    }
  }, [updateMessage])

  const sendMessage = useCallback(async (elements: MessageElement[]) => {
    const conv = currentConversation
    if (!conv) return
    try {
      await doSend(conv.scene, conv.peer, elements)
    } catch (err) {
      setToast({ message: `发送失败: ${(err as Error).message}`, type: 'error' })
    }
  }, [currentConversation, doSend, setToast])

  const resendMessage = useCallback(async (messageId: string) => {
    const conv = currentConversation
    const bot = currentBotRef.current
    if (!conv || !bot) return
    const key = fullKey(bot.selfId, conv.scene, conv.peer)
    const msg = (messageMap[key] || []).find(m => m.messageId === messageId)
    if (!msg) return
    try {
      await doSend(conv.scene, conv.peer, msg.elements, messageId)
    } catch (err) {
      setToast({ message: `发送失败: ${(err as Error).message}`, type: 'error' })
    }
  }, [currentConversation, messageMap, doSend, setToast])

  const recallMessage = useCallback(async (msg: ChatMessage) => {
    const bot = currentBotRef.current
    if (!bot) return
    try {
      await api.recallMessage({ selfId: bot.selfId, scene: msg.scene, peer: msg.peer, messageId: msg.messageId })
      // 本地立即打撤回标记，WS recall 推送到达时幂等跳过
      applyRecall(bot.selfId, msg.scene, msg.peer, msg.messageId)
    } catch (err) {
      setToast({ message: `撤回失败: ${(err as Error).message}`, type: 'error' })
    }
  }, [applyRecall, setToast])

  // 文件直发（附件菜单「文件」/拖拽/粘贴的非图片文件）：按类型映射元素逐个发送，图片走附件菜单「图片」内联进输入框
  const handleFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setToast({ message: `文件「${file.name}」超过 20MB，无法发送`, type: 'error' })
        continue
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      }).catch(() => null)
      if (!base64) continue

      const conv = currentConversationRef.current
      if (!conv) continue
      const element: MessageElement = file.type.startsWith('video/')
        ? { type: 'video', file: base64, name: file.name }
        : file.type.startsWith('audio/')
          ? { type: 'record', file: base64, name: file.name }
          : file.type.startsWith('image/')
            ? { type: 'image', file: base64 }
            : { type: 'file', file: base64, name: file.name, size: file.size }
      try {
        await doSend(conv.scene, conv.peer, [element])
      } catch (err) {
        setToast({ message: `发送失败: ${(err as Error).message}`, type: 'error' })
      }
    }
  }, [doSend, setToast])

  return (
    <ChatContext.Provider value={{
      bots,
      currentBot,
      selectBot,
      conversations,
      currentKey,
      currentConversation,
      openConversation,
      messages,
      groupMembers,
      refreshGroupMembers,
      botGroupRole,
      botUnread,
      resolveAvatar,
      sendMessage,
      resendMessage,
      recallMessage,
      appendLocalPoke,
      handleFiles
    }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export const useChat = () => {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
