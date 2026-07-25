/**
 * 消息相关接口
 * 历史消息由 GET /bots/:selfId/messages 提供（本地 sqlite 持久化，见 service/db.ts 的 messageDb）
 */
import { MessageService } from '@/service'
import express, { type Router } from 'node-karin/express'

const router: Router = express.Router()

/** 发送消息 */
router.post('/send', async (req, res) => {
  res.json(await MessageService.send(req.body))
})

/** 撤回消息 */
router.post('/recall', async (req, res) => {
  res.json(await MessageService.recall(req.body))
})

export default router
