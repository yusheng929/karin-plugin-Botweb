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
  /** 当前会话的消息（本地缓存 + 页面打开后累积的实时消息 + 自己发送的） */
  messages: ChatMessage[]
  groupMembers: GroupMemberItem[]
  refreshGroupMembers: () => void
  /** 当前 bot 在当前群内的角色（非群会话为 null） */
  botGroupRole: 'owner' | 'admin' | 'member' | 'unknown' | null
  /** 各 bot 的未读总数（用于 bot 选择器角标） */
  botUnread: Record<string, number>
  sendMessage: (elements: MessageElement[]) => Promise<void>
  resendMessage: (messageId: string) => Promise<void>
  recallMessage: (msg: ChatMessage) => Promise<void>
  /** 面板戳一戳成功后的本地乐观上屏（系统灰条） */
  appendLocalPoke: (scene: ChatScene, peer: string, targetId: string) => void
  handleFiles: (files: FileList | null) => Promise<void>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

/** 消息在 messageMap 中的完整 key：`${selfId}:${scene}:${peer}`（消息属于哪个 bot 就入哪个 bot 的库） */
const fullKey = (selfId: string, scene: ChatScene, peer: string) => `${selfId}:${scene}:${peer}`

/** 每个会话最多缓存的消息条数 */
const MAX_CACHED_MESSAGES = 100

/** 发送文件的大小上限（base64 内联发送，过大会撑爆请求） */
const MAX_FILE_SIZE = 20 * 1024 * 1024

const MEDIA_PLACEHOLDER: Record<string, string> = {
  image: '[图片]',
  file: '[文件]',
  video: '[视频]',
  record: '[语音]'
}

/**
 * 写入缓存前瘦身：本地 base64 媒体（data: 开头）体积太大，
 * 替换为占位元素，避免撑爆 localStorage 配额；网络 url 原样保留
 */
const sanitizeForCache = (msgs: ChatMessage[]): ChatMessage[] =>
  msgs.slice(-MAX_CACHED_MESSAGES).map(m => ({
    ...m,
    elements: m.elements.map(el =>
      'file' in el && el.file.startsWith('data:') && MEDIA_PLACEHOLDER[el.type]
        ? { type: 'other' as const, text: MEDIA_PLACEHOLDER[el.type] }
        : el
    )
  }))

const loadMessageCache = (selfId: string): Record<string, ChatMessage[]> => {
  try {
    const saved = localStorage.getItem(`botweb:msgs:${selfId}`)
    return saved ? JSON.parse(saved) : {}
  } catch (e) {
    return {}
  }
}

// ---------- messageMap reducer ----------

type MessageMapState = Record<string, ChatMessage[]>

type MessageMapAction =
  /** 启动时合并 localStorage 缓存 */
  | { type: 'merge', entries: MessageMapState }
  /** WS 推送的消息：幂等去重 + 合并到仍在 sending 的本地乐观消息 */
  | { type: 'receive', msg: ChatMessage }
  /** 直接追加（戳一戳灰条 / 本地乐观消息） */
  | { type: 'append', key: string, msg: ChatMessage }
  /** 按 messageId 局部更新（发送状态推进等） */
  | { type: 'update', key: string, messageId: string, updates: Partial<ChatMessage> }
  /** 把指定消息替换为「xx 撤回了一条消息」系统灰条（幂等） */
  | { type: 'recall', key: string, messageId: string, operatorId: string, operatorName: string }

const messageMapReducer = (state: MessageMapState, action: MessageMapAction): MessageMapState => {
  switch (action.type) {
    case 'merge':
      return { ...state, ...action.entries }
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
      if (msg.system) return state
      const sysMsg: ChatMessage = {
        ...msg,
        senderId: action.operatorId,
        senderName: action.operatorName,
        elements: [{ type: 'text', text: `${action.operatorName} 撤回了一条消息` }],
        system: true,
        recalled: true,
        status: undefined
      }
      const next = [...list]
      next[idx] = sysMsg
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
    setToast, setReplyTo, setContextMenu, setShowSettings, setStagedImages
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

  const currentBot = useMemo(() => bots.find(b => b.selfId === currentBotId) || null, [bots, currentBotId])

  // WS 回调里需要读到最新的状态，使用 ref 避免重复订阅
  const currentBotRef = useRef<BotInfo | null>(null)
  currentBotRef.current = currentBot
  const currentKeyRef = useRef<string | null>(null)
  currentKeyRef.current = currentKey
  // applyRecall 需要 messageMap 快照（解析操作者昵称时找原消息发送者）
  const messageMapRef = useRef(messageMap)
  messageMapRef.current = messageMap

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
        // 恢复所有 bot 的本地消息缓存
        const msgEntries: MessageMapState = {}
        const unreadEntries: UnreadState = {}
        for (const bot of list) {
          const cache = loadMessageCache(bot.selfId)
          for (const key of Object.keys(cache)) {
            msgEntries[`${bot.selfId}:${key}`] = cache[key]
          }
          try {
            const saved = localStorage.getItem(`botweb:unread:${bot.selfId}`)
            unreadEntries[bot.selfId] = saved ? JSON.parse(saved) : {}
          } catch (e) {
            unreadEntries[bot.selfId] = {}
          }
        }
        dispatchMessages({ type: 'merge', entries: msgEntries })
        dispatchUnread({ type: 'merge', entries: unreadEntries })
      })
      .catch(err => setToast({ message: `获取 Bot 列表失败: ${err.message}`, type: 'error' }))
  }, [setToast])

  const selectBot = useCallback((selfId: string) => {
    setCurrentBotId(selfId)
  }, [])

  // 切换 bot：重置会话相关状态，重新拉取好友/群列表（消息缓存全 bot 常驻内存，无需切换）
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

  // 消息缓存持久化：按消息所属 bot 分键写入（不管当前选中谁），配额满等异常静默失败
  useEffect(() => {
    const byBot: Record<string, Record<string, ChatMessage[]>> = {}
    for (const key of Object.keys(messageMap)) {
      const sep = key.indexOf(':')
      if (sep === -1 || !messageMap[key]?.length) continue
      const selfId = key.slice(0, sep)
      const shortKey = key.slice(sep + 1)
      if (!byBot[selfId]) byBot[selfId] = {}
      byBot[selfId][shortKey] = messageMap[key]
    }
    for (const selfId of Object.keys(byBot)) {
      try {
        const out: Record<string, ChatMessage[]> = {}
        for (const shortKey of Object.keys(byBot[selfId])) {
          out[shortKey] = sanitizeForCache(byBot[selfId][shortKey])
        }
        localStorage.setItem(`botweb:msgs:${selfId}`, JSON.stringify(out))
      } catch (e) { /* ignore */ }
    }
  }, [messageMap])

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

  // ---------- 撤回 / 戳一戳灰条 ----------

  /** 把指定消息替换为「xx 撤回了一条消息」系统灰条（幂等） */
  const applyRecall = useCallback((selfId: string, scene: ChatScene, peer: string, messageId: string, operatorId?: string) => {
    const key = fullKey(selfId, scene, peer)
    // 操作者昵称需要当前快照解析，先按原消息发送者兜底（reducer 内再取不到列表则整体跳过）
    const list = messageMapRef.current[key]
    const msg = list?.find(m => m.messageId === messageId)
    const operator = operatorId || msg?.senderId || ''
    const name = resolveNameRef.current(selfId, operator)
    dispatchMessages({ type: 'recall', key, messageId, operatorId: operator, operatorName: name })
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
      const isViewing = msg.selfId === currentBotIdRef.current && currentKeyRef.current === shortKey
      if (msg.senderId !== msg.selfId && !isViewing) {
        dispatchUnread({ type: 'increment', selfId: msg.selfId, key: shortKey })
      }
    })

    const unbindRecall = wsClient.onRecall(({ selfId, messageId, scene, peer, operatorId }) => {
      applyRecall(selfId, scene, peer, messageId, operatorId)
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

    return () => {
      unbindMessage()
      unbindRecall()
      unbindPoke()
    }
  }, [applyRecall, appendPoke])

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
      // 本地立即替换为灰条，WS recall 推送到达时幂等跳过
      applyRecall(bot.selfId, msg.scene, msg.peer, msg.messageId, bot.selfId)
    } catch (err) {
      setToast({ message: `撤回失败: ${(err as Error).message}`, type: 'error' })
    }
  }, [applyRecall, setToast])

  // 文件选择：图片进入待发送区；视频/音频/其他文件 readAsDataURL 后直接作为元素发送
  const handleFiles = useCallback(async (files: FileList | null) => {
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

      if (file.type.startsWith('image/')) {
        setStagedImages(prev => [...prev, base64])
        continue
      }

      const conv = currentConversationRef.current
      if (!conv) continue
      const element: MessageElement = file.type.startsWith('video/')
        ? { type: 'video', file: base64, name: file.name }
        : file.type.startsWith('audio/')
          ? { type: 'record', file: base64, name: file.name }
          : { type: 'file', file: base64, name: file.name, size: file.size }
      try {
        await doSend(conv.scene, conv.peer, [element])
      } catch (err) {
        setToast({ message: `发送失败: ${(err as Error).message}`, type: 'error' })
      }
    }
  }, [doSend, setToast, setStagedImages])

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
