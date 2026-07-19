import { BotService } from '@/service'
import express, { type Router } from 'node-karin/express'

const router: Router = express.Router()

/** Bot 列表 */
router.get('/bots', (_req, res) => {
  res.json(BotService.list())
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

/** 戳一戳群成员 */
router.post('/bots/:selfId/groups/:groupId/poke', async (req, res) => {
  res.json(await BotService.poke(req.params.selfId, req.params.groupId, String(req.body?.targetId ?? '')))
})

/** 踢出群成员 */
router.post('/bots/:selfId/groups/:groupId/kick', async (req, res) => {
  res.json(await BotService.kick(req.params.selfId, req.params.groupId, String(req.body?.targetId ?? '')))
})

export default router
