import {
  ApiResult,
  BotInfo,
  ForwardMessageItem,
  FriendItem,
  GroupItem,
  GroupMemberItem,
  MessageElement,
  ChatScene,
  ChatMessage,
  ConversationSummary,
  MessagePage,
  UserAvatarItem,
  BotWebSettings,
  WsPush
} from '../core/types'
import { authHeaders, getAccessToken, getUserId, logout, refresh } from './auth'

/** 后端挂载路径，由 render(basePath) 注入到 window.BOTWEB_BASE */
export const BASE: string = (window as any).BOTWEB_BASE || '/botweb'

async function request<T> (path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...init
  })
  // accessToken 过期/失效（karin：401 未授权，419 令牌过期）：先用 refreshToken 换新并重放一次，仍失败则登出
  if (res.status === 401 || res.status === 419) {
    if (!retried && await refresh()) return request(path, init, true)
    logout()
    throw new Error('登录信息已过期，请重新登录')
  }
  const result = await res.json() as ApiResult<T>
  if (result.code !== 0) {
    throw new Error(result.message || `请求失败 (code: ${result.code})`)
  }
  return result.data
}

export const getBots = () => request<BotInfo[]>('/api/bots')

export const getFriends = (selfId: string) =>
  request<FriendItem[]>(`/api/bots/${encodeURIComponent(selfId)}/friends`)

export const getGroups = (selfId: string) =>
  request<GroupItem[]>(`/api/bots/${encodeURIComponent(selfId)}/groups`)

/** 拉取该 bot 的会话摘要（每个有本地消息的会话的最后一条，用于会话列表预览/排序；历史消息进会话后分页拉取） */
export const getConversations = (selfId: string) =>
  request<ConversationSummary[]>(`/api/bots/${encodeURIComponent(selfId)}/conversations`)

/** 分页拉取协议端历史消息（懒加载主数据源，后端叠加本地防撤回标记；before 传上一页 cursor 即最旧一条的 messageId） */
export const getHistory = (selfId: string, scene: ChatScene, peer: string, before: string | null, limit = 100) => {
  const params = new URLSearchParams({ scene, peer, limit: String(limit) })
  if (before !== null) params.set('before', before)
  return request<MessagePage>(`/api/bots/${encodeURIComponent(selfId)}/history?${params}`)
}

/** 分页拉取指定会话的本地 db 历史消息（协议端历史不可用时的降级兜底源，before 传上一页 cursor 即 sqlite rowid 字符串，时间升序） */
export const getMessages = (selfId: string, scene: ChatScene, peer: string, before: string | null, limit = 100) => {
  const params = new URLSearchParams({ scene, peer, limit: String(limit) })
  if (before !== null) params.set('before', before)
  return request<MessagePage>(`/api/bots/${encodeURIComponent(selfId)}/messages?${params}`)
}

export const getGroupMembers = (selfId: string, groupId: string) =>
  request<GroupMemberItem[]>(`/api/bots/${encodeURIComponent(selfId)}/groups/${encodeURIComponent(groupId)}/members`)

/** 批量获取用户头像（后端走协议端 getAvatarUrl + db 缓存，返回 userId -> url） */
export const getAvatars = (selfId: string, ids: string[]) =>
  request<Record<string, string>>(`/api/bots/${encodeURIComponent(selfId)}/avatars?ids=${ids.map(encodeURIComponent).join(',')}`)

/** 拉取合并转发消息内容（resId 来自 forward 元素，点击卡片时按需调用） */
export const getForward = (selfId: string, resId: string) =>
  request<ForwardMessageItem[]>(`/api/bots/${encodeURIComponent(selfId)}/forward?resId=${encodeURIComponent(resId)}`)

export interface SendMessagePayload {
  selfId: string
  scene: ChatScene
  peer: string
  elements: MessageElement[]
}

export const sendMessage = (payload: SendMessagePayload) =>
  request<{ messageId: string, time: number }>('/api/message/send', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

export const recallMessage = (payload: { selfId: string, scene: ChatScene, peer: string, messageId: string }) =>
  request<null>('/api/message/recall', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

/** 表情回应（QQ 贴表情，仅 NapCat/Lagrange 等 OneBot 协议端支持） */
export const reactMessage = (payload: { selfId: string, scene: ChatScene, peer: string, messageId: string, faceId: number, isSet?: boolean }) =>
  request<null>('/api/message/reaction', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

/** 戳一戳群成员 */
export const pokeGroupMember = (selfId: string, groupId: string, targetId: string) =>
  request<boolean>(`/api/bots/${encodeURIComponent(selfId)}/groups/${encodeURIComponent(groupId)}/poke`, {
    method: 'POST',
    body: JSON.stringify({ targetId })
  })

/** 戳一戳好友 */
export const pokeFriend = (selfId: string, userId: string) =>
  request<boolean>(`/api/bots/${encodeURIComponent(selfId)}/friends/${encodeURIComponent(userId)}/poke`, {
    method: 'POST'
  })

/** 踢出群成员（需 bot 为管理员/群主） */
export const kickGroupMember = (selfId: string, groupId: string, targetId: string) =>
  request<null>(`/api/bots/${encodeURIComponent(selfId)}/groups/${encodeURIComponent(groupId)}/kick`, {
    method: 'POST',
    body: JSON.stringify({ targetId })
  })

/** 获取插件设置 */
export const getSettings = () => request<BotWebSettings>('/api/settings')

/** 更新插件设置（部分字段归并，返回更新后的完整设置） */
export const saveSettings = (patch: Partial<BotWebSettings>) =>
  request<BotWebSettings>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(patch)
  })

type MessageHandler = (msg: ChatMessage) => void
type RecallHandler = (data: { selfId: string, messageId: string, scene: ChatScene, peer: string, operatorId?: string, targetId?: string }) => void
type PokeHandler = (data: { selfId: string, scene: ChatScene, peer: string, operatorId: string, targetId: string, action: string, suffix: string }) => void
type ProfilesHandler = (data: { selfId: string, friends: FriendItem[], groups: GroupItem[], users: UserAvatarItem[] }) => void
type ReactionHandler = (data: { selfId: string, scene: ChatScene, peer: string, messageId: string, operatorId: string, faceId: number, count: number, isSet: boolean }) => void

/**
 * WebSocket 客户端：连接后端推送通道（服务端只推不收，帧格式为 WsPush）。
 * 断线后自动重连；后端广播所有 bot 的消息，由调用方按 selfId 过滤。
 */
export class WsClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private recallHandlers = new Set<RecallHandler>()
  private pokeHandlers = new Set<PokeHandler>()
  private profilesHandlers = new Set<ProfilesHandler>()
  private reactionHandlers = new Set<ReactionHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private started = false

  /** 建立连接（幂等），断线后 3s 自动重连 */
  connect () {
    if (this.started) return
    this.started = true
    this.open()
  }

  private open () {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // 浏览器 WebSocket 无法自定义 header，凭据走 query（后端校验 karin JWT 或明文 key）
    const params = new URLSearchParams()
    const token = getAccessToken()
    const userId = getUserId()
    if (token) params.set('token', token)
    if (userId) params.set('user_id', userId)
    const url = `${protocol}//${window.location.host}${BASE}/ws?${params}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log(`[WS] Connected to ${url}`)
    }

    this.ws.onmessage = (event) => {
      try {
        const push = JSON.parse(event.data) as WsPush
        if (push.type === 'message') {
          this.messageHandlers.forEach(h => h(push.data))
        } else if (push.type === 'recall') {
          this.recallHandlers.forEach(h => h(push.data))
        } else if (push.type === 'poke') {
          this.pokeHandlers.forEach(h => h(push.data))
        } else if (push.type === 'profiles') {
          this.profilesHandlers.forEach(h => h(push.data))
        } else if (push.type === 'reaction') {
          this.reactionHandlers.forEach(h => h(push.data))
        }
      } catch (err) {
        console.error('[WS] Parse error', err)
      }
    }

    this.ws.onclose = (event) => {
      // 4401：后端鉴权拒绝，不再重连，登出回登录页
      if (event.code === 4401) {
        this.started = false
        logout()
        return
      }
      console.log('[WS] Disconnected, retrying in 3s...')
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      console.error('[WS] Error', err)
      this.ws?.close()
    }
  }

  private scheduleReconnect () {
    if (this.reconnectTimer || !this.started) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, 3000)
  }

  /** 订阅新消息推送，返回取消订阅函数 */
  onMessage (cb: MessageHandler) {
    this.messageHandlers.add(cb)
    return () => { this.messageHandlers.delete(cb) }
  }

  /** 订阅撤回推送，返回取消订阅函数 */
  onRecall (cb: RecallHandler) {
    this.recallHandlers.add(cb)
    return () => { this.recallHandlers.delete(cb) }
  }

  /** 订阅戳一戳推送，返回取消订阅函数 */
  onPoke (cb: PokeHandler) {
    this.pokeHandlers.add(cb)
    return () => { this.pokeHandlers.delete(cb) }
  }

  /** 订阅会话资料增量推送（头像/名称补全），返回取消订阅函数 */
  onProfiles (cb: ProfilesHandler) {
    this.profilesHandlers.add(cb)
    return () => { this.profilesHandlers.delete(cb) }
  }

  /** 订阅表情回应推送（QQ 贴表情），返回取消订阅函数 */
  onReaction (cb: ReactionHandler) {
    this.reactionHandlers.add(cb)
    return () => { this.reactionHandlers.delete(cb) }
  }
}

export const wsClient = new WsClient()
