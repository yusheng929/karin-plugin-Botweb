/**
 * 消息相关接口
 * 注意：本期不提供历史消息接口（各协议端 getHistoryMsg 差异大，见 service/message.ts 注释）
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
