/**
 * BotWeb 面板入口（Karin 会自动加载本文件）
 * - 页面托管：GET /botweb（HTML 由 sandbox-template 的 render() 内联提供）
 * - REST 接口：/botweb/api/*
 * - 实时推送：复用 Karin 内置 WebSocket 服务，接管路径 /botweb/ws
 */
import karin, { app, hooks, logger } from 'node-karin'
import { WebSocket } from 'node-karin/ws'
import type { Request, Response } from 'node-karin/express'
import { render } from 'sandbox-template'
import apiRouter from '@/api'
import { toChatMessage } from '@/service'

/** 面板挂载路径 */
const BASE = '/botweb'
/** WS 推送路径 */
const WS_PATH = `${BASE}/ws`

/** 已连接的面板客户端 */
const clients = new Set<WebSocket>()

/** 广播消息给所有在线客户端 */
const broadcast = (payload: unknown) => {
  if (clients.size === 0) return
  const data = JSON.stringify(payload)
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data)
  }
}

// -------------------- REST 接口（必须先于页面兜底注册） --------------------
app.use(`${BASE}/api`, apiRouter)

// -------------------- 页面托管 --------------------
const pageHandler = (_req: Request, res: Response) => {
  res.type('html').send(render(BASE))
}
app.get(BASE, pageHandler)
// SPA 兜底（express v5 通配符写法）
app.get(`${BASE}/*splat`, pageHandler)

// -------------------- WebSocket（复用 karin 内置 wss，按路径接管） --------------------
karin.on(`ws:connection:${WS_PATH}`, (socket: WebSocket, _req: unknown, call: () => void) => {
  // 必须在 3 秒内调用，否则 karin 会自动断开连接
  call()
  clients.add(socket)
  logger.debug(`[BotWeb] 面板客户端已连接，当前 ${clients.size} 个`)
  const remove = () => {
    clients.delete(socket)
  }
  socket.on('close', remove)
  socket.on('error', remove)
})

// -------------------- 消息推送（全量广播，前端按当前选中的 Bot 过滤） --------------------
hooks.message((e, next) => {
  const message = toChatMessage(e)
  if (message) broadcast({ type: 'message', data: message })
  // 必须调用 next()，否则事件会被吞掉，下游插件收不到
  next()
})

// -------------------- 撤回推送 --------------------
karin.accept('notice.privateRecall', (e, next) => {
  broadcast({
    type: 'recall',
    data: {
      selfId: e.selfId,
      messageId: e.content.messageId,
      scene: 'friend',
      peer: String(e.contact.peer),
      operatorId: String(e.content.operatorId),
      targetId: String(e.content.operatorId)
    }
  })
  next()
})

karin.accept('notice.groupRecall', (e, next) => {
  broadcast({
    type: 'recall',
    data: {
      selfId: e.selfId,
      messageId: e.content.messageId,
      scene: 'group',
      peer: String(e.groupId),
      operatorId: String(e.content.operatorId),
      targetId: String(e.content.targetId)
    }
  })
  next()
})

// -------------------- 戳一戳推送（前端渲染为小灰条） --------------------
karin.accept('notice.privatePoke', (e, next) => {
  broadcast({
    type: 'poke',
    data: {
      selfId: e.selfId,
      scene: 'friend',
      peer: String(e.contact.peer),
      operatorId: String(e.content.operatorId),
      targetId: String(e.content.targetId),
      action: e.content.action || '戳了戳',
      suffix: e.content.suffix || ''
    }
  })
  next()
})

karin.accept('notice.groupPoke', (e, next) => {
  broadcast({
    type: 'poke',
    data: {
      selfId: e.selfId,
      scene: 'group',
      peer: String(e.groupId),
      operatorId: String(e.content.operatorId),
      targetId: String(e.content.targetId),
      action: e.content.action || '戳了戳',
      suffix: e.content.suffix || ''
    }
  })
  next()
})

logger.info(`[BotWeb] 面板已挂载：http://127.0.0.1:7777${BASE}（仅限内网/本地访问，接口未加鉴权）`)
