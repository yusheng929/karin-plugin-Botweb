import { sha256hex } from './sha256'

/**
 * 登录态模块：完全复用 karin 的鉴权体系。
 * - 登录/刷新走 karin 的 /api/v1/login 与 /api/v1/refresh
 * - localStorage 键名与 karin WebUI 相同（同 origin 下双向共享登录态：
 *   任一边登录过，另一边免登录）
 */

/** karin WebUI 的 localStorage 键名（不可改，改了就不互通了） */
const KEYS = { userId: 'userId', accessToken: 'accessToken', refreshToken: 'refreshToken' } as const

export const getAccessToken = () => localStorage.getItem(KEYS.accessToken)
export const getUserId = () => localStorage.getItem(KEYS.userId)
export const isLoggedIn = () => !!getAccessToken()

/** karin 接口要求的请求头（authMiddleware 同时校验二者） */
export const authHeaders = (): Record<string, string> => {
  const token = getAccessToken()
  const userId = getUserId()
  if (!token) return {}
  return {
    Authorization: `Bearer ${token}`,
    ...(userId ? { 'x-user-id': userId } : {})
  }
}

// ---------- 登录状态变化通知（供入口在登录/登出时切换界面） ----------

type Listener = () => void
const listeners = new Set<Listener>()

export const onAuthChange = (cb: Listener) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

const notify = () => listeners.forEach(cb => cb())

/** 登出：清空 karin 登录态并通知（karin 的登出响应由调用方按状态码处理） */
export const logout = () => {
  localStorage.removeItem(KEYS.userId)
  localStorage.removeItem(KEYS.accessToken)
  localStorage.removeItem(KEYS.refreshToken)
  notify()
}

interface KarinResp<T> { code: number, message: string, data: T }

/** 登录：key 为 HTTP_AUTH_KEY，sha256 后调 karin 的 /api/v1/login（karin 有 IP 限流：5 次/5 分钟） */
export const login = async (key: string): Promise<void> => {
  const authorization = await sha256hex(key)
  const res = await fetch('/api/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization })
  })
  const result = await res.json() as KarinResp<{ userId: string, accessToken: string, refreshToken: string }>
  if (result.code !== 200) {
    throw new Error(res.status === 403 ? '尝试次数过多，请稍后再试' : (result.message || '登录失败'))
  }
  localStorage.setItem(KEYS.userId, result.data.userId)
  localStorage.setItem(KEYS.accessToken, result.data.accessToken)
  localStorage.setItem(KEYS.refreshToken, result.data.refreshToken)
  notify()
}

// ---------- accessToken 刷新（并发请求共享同一次刷新） ----------

let refreshing: Promise<boolean> | null = null

const doRefresh = async (): Promise<boolean> => {
  const accessToken = getAccessToken()
  const refreshToken = localStorage.getItem(KEYS.refreshToken)
  if (!accessToken || !refreshToken) return false
  try {
    const res = await fetch('/api/v1/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, refreshToken })
    })
    const result = await res.json() as KarinResp<{ accessToken: string }>
    if (result.code !== 200) return false
    localStorage.setItem(KEYS.accessToken, result.data.accessToken)
    return true
  } catch {
    return false
  }
}

/** 刷新 accessToken，成功返回 true（多次并发调用只发一次请求） */
export const refresh = (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null })
  }
  return refreshing
}
