import {
  ApiResult,
  BotInfo,
  FriendItem,
  GroupItem,
  GroupMemberItem,
  MessageElement,
  ChatScene,
  ChatMessage,
  WsPush
} from '../core/types'
import { authHeaders, getAccessToken, getUserId, logout, refresh } from './auth'

/** 后端挂载路径，由 render(basePath) 注入到 window.BOTWEB_BASE */
export const BASE: string = (window as any).BOTWEB_BASE || '/botweb'

/**
 * 注意：历史消息接口本期不实现（各协议端的历史消息格式/分页差异大，
 * 后端暂无统一抽象）。聊天窗口只展示页面打开后累积的实时消息与自己发送的消息。
 */

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

export const getGroupMembers = (selfId: string, groupId: string) =>
  request<GroupMemberItem[]>(`/api/bots/${encodeURIComponent(selfId)}/groups/${encodeURIComponent(groupId)}/members`)

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

type MessageHandler = (msg: ChatMessage) => void
type RecallHandler = (data: { selfId: string, messageId: string, scene: ChatScene, peer: string, operatorId?: string, targetId?: string }) => void
type PokeHandler = (data: { selfId: string, scene: ChatScene, peer: string, operatorId: string, targetId: string, action: string, suffix: string }) => void

/**
 * WebSocket 客户端：连接后端推送通道（服务端只推不收，帧格式为 WsPush）。
 * 断线后自动重连；后端广播所有 bot 的消息，由调用方按 selfId 过滤。
 */
export class WsClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private recallHandlers = new Set<RecallHandler>()
  private pokeHandlers = new Set<PokeHandler>()
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
}

export const wsClient = new WsClient()
