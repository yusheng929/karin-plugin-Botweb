import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BotInfo,
  FriendItem,
  GroupItem,
  GroupMemberItem,
  MessageElement,
  ChatScene,
  ChatMessage
} from '../core/types'
import * as api from './api'
import { wsClient } from './api'
import { toMillis } from './utils'

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

export interface ContextMenuState {
  x: number
  y: number
  /** avatar：群消息发送者头像菜单；message：消息菜单；image：图片（lightbox）菜单 */
  kind: 'avatar' | 'message' | 'image'
  msg?: ChatMessage
  /** kind 为 image 时的图片地址 */
  file?: string
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
  handleFiles: (files: FileList | null) => Promise<void>

  // 回复 / 右键菜单 / @ 草稿 / 跳转高亮
  replyTo: ChatMessage | null
  setReplyTo: (v: ChatMessage | null) => void
  contextMenu: ContextMenuState | null
  setContextMenu: (v: ContextMenuState | null) => void
  /** 待插入输入框的 @ 目标 userId，由 InputArea 消费后清空 */
  pendingMention: string | null
  setPendingMention: (v: string | null) => void
  flashMessageId: string | null
  flashMessage: (messageId: string) => void

  // UI States
  stagedImages: string[]
  setStagedImages: (v: string[]) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void
  toast: { message: string, type: 'success' | 'error' | 'info' } | null
  setToast: (toast: string | { message: string, type: 'success' | 'error' | 'info' } | null) => void
  alertDialog: { title: string, message: string } | null
  setAlertDialog: (v: { title: string, message: string } | null) => void
  confirmDialog: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null
  setConfirmDialog: (v: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null) => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  actualTheme: 'light' | 'dark'
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

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bots, setBots] = useState<BotInfo[]>([])
  const [currentBotId, setCurrentBotId] = useState<string | null>(null)
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [groups, setGroups] = useState<GroupItem[]>([])
  /** 所有 bot 的消息，key 为 `${selfId}:${scene}:${peer}` */
  const [messageMap, setMessageMap] = useState<Record<string, ChatMessage[]>>({})
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  /** 各 bot 的未读：selfId -> 会话 key（`${scene}:${peer}`） -> 未读数 */
  const [unreadByBot, setUnreadByBot] = useState<Record<string, Record<string, number>>>({})
  const [groupMembers, setGroupMembers] = useState<GroupMemberItem[]>([])

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingMention, setPendingMention] = useState<string | null>(null)
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null)

  const [stagedImages, setStagedImages] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [alertDialog, setAlertDialog] = useState<{ title: string, message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null>(null)
  const [toast, _setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null)

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light')
  const actualTheme = theme === 'system' ? systemTheme : theme

  const currentBot = useMemo(() => bots.find(b => b.selfId === currentBotId) || null, [bots, currentBotId])

  // WS 回调里需要读到最新的状态，使用 ref 避免重复订阅
  const currentBotRef = useRef<BotInfo | null>(null)
  currentBotRef.current = currentBot
  const currentBotIdRef = useRef<string | null>(null)
  currentBotIdRef.current = currentBotId
  const currentKeyRef = useRef<string | null>(null)
  currentKeyRef.current = currentKey
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setToast = useCallback((val: string | { message: string, type: 'success' | 'error' | 'info' } | null) => {
    if (typeof val === 'string') {
      _setToast({ message: val, type: 'info' })
    } else {
      _setToast(val)
    }
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => _setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  useEffect(() => {
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  /** 回复跳转后的短暂高亮 */
  const flashMessage = useCallback((messageId: string) => {
    setFlashMessageId(messageId)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashMessageId(null), 1600)
  }, [])

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
        setMessageMap(prev => {
          const merged = { ...prev }
          for (const bot of list) {
            const cache = loadMessageCache(bot.selfId)
            for (const key of Object.keys(cache)) {
              merged[`${bot.selfId}:${key}`] = cache[key]
            }
          }
          return merged
        })
        // 恢复所有 bot 的未读
        setUnreadByBot(prev => {
          const merged = { ...prev }
          for (const bot of list) {
            try {
              const saved = localStorage.getItem(`botweb:unread:${bot.selfId}`)
              merged[bot.selfId] = saved ? JSON.parse(saved) : {}
            } catch (e) {
              merged[bot.selfId] = {}
            }
          }
          return merged
        })
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
  }, [currentBotId, setToast])

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
    setUnreadByBot(prev => prev[currentBotId]?.[currentKey]
      ? { ...prev, [currentBotId]: { ...prev[currentBotId], [currentKey]: 0 } }
      : prev)
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

  // ---------- 撤回灰条 ----------

  /** 把指定消息替换为「xx 撤回了一条消息」系统灰条（幂等） */
  const applyRecall = useCallback((selfId: string, scene: ChatScene, peer: string, messageId: string, operatorId?: string) => {
    const key = fullKey(selfId, scene, peer)
    setMessageMap(prev => {
      const list = prev[key]
      if (!list) return prev
      const idx = list.findIndex(m => m.messageId === messageId)
      if (idx === -1) return prev
      const msg = list[idx]
      if (msg.system) return prev
      const operator = operatorId || msg.senderId
      const name = resolveNameRef.current(selfId, operator)
      const sysMsg: ChatMessage = {
        ...msg,
        senderId: operator,
        senderName: name,
        elements: [{ type: 'text', text: `${name} 撤回了一条消息` }],
        system: true,
        recalled: true,
        status: undefined
      }
      const next = [...list]
      next[idx] = sysMsg
      return { ...prev, [key]: next }
    })
  }, [])

  // ---------- WS 推送 ----------

  useEffect(() => {
    wsClient.connect()

    const unbindMessage = wsClient.onMessage((msg) => {
      // 后端广播所有 bot 的消息，按各自 selfId 入库
      const key = fullKey(msg.selfId, msg.scene, msg.peer)

      setMessageMap(prev => {
        const list = prev[key] || []
        // 幂等：同 messageId 不重复入库（自己发送的消息会被后端再广播一次）
        if (list.some(m => m.messageId === msg.messageId)) return prev
        // 广播先于 REST 响应到达时，合并到仍在 sending 的本地乐观消息上
        if (msg.senderId === msg.selfId) {
          const pending = list.find(m => m.status === 'sending' && JSON.stringify(m.elements) === JSON.stringify(msg.elements))
          if (pending) {
            return {
              ...prev,
              [key]: list.map(m => m === pending ? { ...msg, status: undefined } : m)
            }
          }
        }
        return { ...prev, [key]: [...list, msg] }
      })

      // 未读记到消息所属 bot 头上；正在看该会话（同 bot 同会话）则不计
      const shortKey = `${msg.scene}:${msg.peer}`
      const isViewing = msg.selfId === currentBotIdRef.current && currentKeyRef.current === shortKey
      if (msg.senderId !== msg.selfId && !isViewing) {
        setUnreadByBot(prev => ({
          ...prev,
          [msg.selfId]: {
            ...prev[msg.selfId],
            [shortKey]: (prev[msg.selfId]?.[shortKey] || 0) + 1
          }
        }))
      }
    })

    const unbindRecall = wsClient.onRecall(({ selfId, messageId, scene, peer, operatorId }) => {
      applyRecall(selfId, scene, peer, messageId, operatorId)
    })

    const unbindPoke = wsClient.onPoke(({ selfId, scene, peer, operatorId, targetId, action, suffix }) => {
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
      const key = fullKey(selfId, scene, peer)
      setMessageMap(prev => ({ ...prev, [key]: [...(prev[key] || []), sysMsg] }))
    })

    return () => {
      unbindMessage()
      unbindRecall()
      unbindPoke()
    }
  }, [applyRecall])

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
  }, [])

  // ---------- 发送 / 撤回 ----------

  const updateMessage = useCallback((key: string, messageId: string, updates: Partial<ChatMessage>) => {
    setMessageMap(prev => {
      const list = prev[key]
      if (!list) return prev
      return { ...prev, [key]: list.map(m => m.messageId === messageId ? { ...m, ...updates } : m) }
    })
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
      setMessageMap(prev => ({ ...prev, [key]: [...(prev[key] || []), optimistic] }))
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
      sendMessage,
      resendMessage,
      recallMessage,
      handleFiles,
      replyTo,
      setReplyTo,
      contextMenu,
      setContextMenu,
      pendingMention,
      setPendingMention,
      flashMessageId,
      flashMessage,
      stagedImages,
      setStagedImages,
      showSettings,
      setShowSettings,
      toast,
      setToast,
      alertDialog,
      setAlertDialog,
      confirmDialog,
      setConfirmDialog,
      theme,
      setTheme,
      actualTheme
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
