import { BotService } from '@/service'
import { fail } from '@/service/response'
import type { ChatScene } from '@/service/dto'
import express, { type Router } from 'node-karin/express'

const router: Router = express.Router()

/** Bot 列表 */
router.get('/bots', (_req, res) => {
  res.json(BotService.list())
})

/** 该 bot 指定会话的协议端历史消息（懒加载：before 传上一页 cursor 即 messageId，limit 默认 100、上限 500，时间升序） */
router.get('/bots/:selfId/history', async (req, res) => {
  const scene = String(req.query.scene || '')
  const peer = String(req.query.peer || '')
  if ((scene !== 'friend' && scene !== 'group') || !peer) {
    res.json(fail('scene（friend/group）与 peer 参数必填'))
    return
  }
  const before = String(req.query.before || '') || null
  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 100
  res.json(await BotService.history(req.params.selfId, scene as ChatScene, peer, before, limit))
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

/** 按 messageId 拉取协议端原始消息（前端「原始事件」调试用，返回不经过 DTO 转换） */
router.get('/bots/:selfId/message', async (req, res) => {
  const { scene, peer, messageId } = req.query
  res.json(await BotService.rawMessage(req.params.selfId, scene as 'friend' | 'group', String(peer || ''), String(messageId || '')))
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
