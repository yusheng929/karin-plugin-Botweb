/**
 * BotWeb 面板入口（Karin 会自动加载本文件）
 * - 页面托管：GET /botweb（HTML 由 sandbox-template 的 render() 内联提供）
 * - REST 接口：/botweb/api/*
 * - 实时推送：复用 Karin 内置 WebSocket 服务，接管路径 /botweb/ws
 */
import karin, { app, authMiddleware, hooks, logger } from 'node-karin'
import { WebSocket } from 'node-karin/ws'
import type { Request, Response } from 'node-karin/express'
import path from 'node:path'
import fs from 'node:fs'
import { render } from 'sandbox-template'
import apiRouter from '@/api'
import { toChatMessage, verifyWsToken } from '@/service'
import { dir } from '@/dir'

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
// 复用 karin 官方鉴权中间件：凭据为 Authorization: Bearer <HTTP_AUTH_KEY 或 karin JWT>
// （JWT 需配合 x-user-id header；GET 还支持 ?token= 明文 key）
app.use(`${BASE}/api`, authMiddleware, apiRouter)

// -------------------- QQ 小黄脸静态资源（本地化，见 scripts/download-faces.mjs） --------------------
// 远程 jsDelivr 图床慢且易超时，表情文件下载到插件 resources/faces 下由本路由托管
const FACES_DIR = path.join(dir.pluginDir, 'resources', 'faces')

app.get(`${BASE}/faces/manifest.json`, (_req: Request, res: Response) => {
  const file = path.join(FACES_DIR, 'manifest.json')
  if (!fs.existsSync(file)) {
    res.status(404).json({ code: 404, message: 'faces not downloaded', data: null })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(file)
})

app.get(`${BASE}/faces/:type/:name`, (req: Request, res: Response) => {
  // express v5 params 类型为 string | string[]，统一转字符串（数组形态随后会被正则挡下）
  const type = String(req.params.type)
  const name = String(req.params.name)
  // 只允许 gif/static 目录下的 s{id}.(gif|png)，防路径穿越
  if ((type !== 'gif' && type !== 'static') || !/^s\d+\.(gif|png)$/.test(name)) {
    res.status(404).json({ code: 404, message: 'not found', data: null })
    return
  }
  const file = path.join(FACES_DIR, type, name)
  if (!fs.existsSync(file)) {
    res.status(404).json({ code: 404, message: 'not found', data: null })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
  res.sendFile(file)
})

// -------------------- 页面托管 --------------------
const pageHandler = (_req: Request, res: Response) => {
  res.type('html').send(render(BASE))
}
app.get(BASE, pageHandler)
// SPA 兜底（express v5 通配符写法）
app.get(`${BASE}/*splat`, pageHandler)

// -------------------- WebSocket（复用 karin 内置 wss，按路径接管） --------------------
// karin 握手不鉴权，浏览器 WS 只能走 query 传凭据（?token=&user_id=），由插件自行校验
karin.on(`ws:connection:${WS_PATH}`, (socket: WebSocket, req: { url?: string }, call: () => void) => {
  // 必须在 3 秒内调用，否则 karin 会自动断开连接
  call()
  const query = new URL(req.url || '', 'http://localhost').searchParams
  if (!verifyWsToken(query.get('token') || undefined, query.get('user_id') || undefined)) {
    logger.warn('[BotWeb] 面板 WS 鉴权失败，已断开')
    socket.close(4401, 'unauthorized')
    return
  }
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

/**
 * node-karin@1.15 类型声明里私聊戳一戳/撤回的 accept key 是 notice.privatePoke / notice.privateRecall，
 * 但运行时事件的 subEvent 实际是 friendPoke / friendRecall，accept 按 `${event}.${subEvent}` 匹配，
 * 按声明的 key 注册永远收不到事件，这里按运行时 key 注册（断言绕过声明与运行时不一致的问题）。
 */
const PRIVATE_RECALL_EVENT = 'notice.friendRecall' as unknown as 'notice.privateRecall'
const PRIVATE_POKE_EVENT = 'notice.friendPoke' as unknown as 'notice.privatePoke'

/**
 * 撤回 / 戳一戳推送（前端渲染为小灰条）。
 * 注意：karin.accept() 只是创建插件对象，karin 扫描 apps 模块的**具名导出**完成注册
 * （default 导出会被跳过），不导出就是死代码，所以这里集中导出为数组。
 */
export const noticeHandlers = [
  // -------------------- 撤回推送 --------------------
  karin.accept(PRIVATE_RECALL_EVENT, (e, next) => {
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
  }),

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
  }),

  // -------------------- 戳一戳推送 --------------------
  karin.accept(PRIVATE_POKE_EVENT, (e, next) => {
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
  }),

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
]

logger.info(`[BotWeb] 面板已挂载：http://127.0.0.1:7777${BASE}（接口已接入 karin 鉴权）`)
