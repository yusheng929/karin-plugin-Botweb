import { BotService } from '@/service'
import { messageDb } from '@/service/db'
import { ok } from '@/service/response'
import express, { type Router } from 'node-karin/express'

const router: Router = express.Router()

/** Bot 列表 */
router.get('/bots', (_req, res) => {
  res.json(BotService.list())
})

/** 该 bot 的全部本地存储消息（时间升序，前端启动时全量拉取后只存内存） */
router.get('/bots/:selfId/messages', async (req, res) => {
  res.json(ok(await messageDb.listByBot(req.params.selfId)))
})

/** 好友列表 */
router.get('/bots/:selfId/friends', async (req, res) => {
  res.json(await BotService.friends(req.params.selfId))
})

/** 群列表 */
router.get('/bots/:selfId/groups', async (req, res) => {
  res.json(await BotService.groups(req.params.selfId))
})

/** 群成员列表 */
router.get('/bots/:selfId/groups/:groupId/members', async (req, res) => {
  res.json(await BotService.members(req.params.selfId, req.params.groupId))
})

/** 批量获取用户头像（统一走协议端 getAvatarUrl + db 缓存，前端不得直拼 qlogo） */
router.get('/bots/:selfId/avatars', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean)
  res.json(await BotService.avatars(req.params.selfId, ids))
})

/** 合并转发消息内容（resId 来自 forward 元素） */
router.get('/bots/:selfId/forward', async (req, res) => {
  res.json(await BotService.forward(req.params.selfId, String(req.query.resId || '')))
})

/** 戳一戳群成员 */
router.post('/bots/:selfId/groups/:groupId/poke', async (req, res) => {
  res.json(await BotService.poke(req.params.selfId, req.params.groupId, String(req.body?.targetId ?? '')))
})

/** 戳一戳好友 */
router.post('/bots/:selfId/friends/:userId/poke', async (req, res) => {
  res.json(await BotService.pokeFriend(req.params.selfId, req.params.userId))
})

/** 踢出群成员 */
router.post('/bots/:selfId/groups/:groupId/kick', async (req, res) => {
  res.json(await BotService.kick(req.params.selfId, req.params.groupId, String(req.body?.targetId ?? '')))
})

export default router
