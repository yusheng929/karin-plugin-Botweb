import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { config } from 'node-karin'

/**
 * WS 握手阶段的鉴权（karin 内置 wss 不做鉴权，需插件自行校验）。
 * 浏览器 WebSocket 无法自定义 header，凭据只能走 query（参照 karin terminal 的做法）。
 *
 * 接受两种凭据（与 karin 的 verifyToken 行为一致）：
 * 1. 明文 HTTP_AUTH_KEY 兜底
 * 2. karin 签发的 accessToken（HS256 JWT，secret = sha256hex(authKey)），
 *    要求 payload.type === 'access'、未过期，且 user_id 与 payload.userId 匹配
 *
 * karin 未导出 verifyJwt，这里用 node:crypto 手写 HS256 校验，不加依赖。
 */

const base64urlDecode = (input: string) =>
  Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/** 手写 HS256 JWT 校验，返回 payload（非法/过期返回 null） */
const verifyJwt = (token: string, userId?: string): Record<string, any> | null => {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const secret = createHash('sha256').update(config.authKey()).digest('hex')
  const expect = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
  const actual = base64urlDecode(parts[2])
  if (expect.length !== actual.length || !timingSafeEqual(expect, actual)) return null

  let payload: Record<string, any>
  try {
    payload = JSON.parse(base64urlDecode(parts[1]).toString())
  } catch {
    return null
  }

  // 必须与 karin 签发的 accessToken 结构一致
  if (payload.type !== 'access') return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
  if (!userId || payload.userId !== userId) return null
  return payload
}

/** 校验 WS 连接的 query 凭据（token + user_id） */
export const verifyWsToken = (token?: string, userId?: string): boolean => {
  if (!token) return false
  // 明文 key 兜底（karin 的 verifyToken 始终保留这条路径）
  if (token === config.authKey()) return true
  return verifyJwt(token, userId) !== null
}
