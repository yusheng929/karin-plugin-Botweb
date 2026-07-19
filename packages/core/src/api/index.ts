import express, { type NextFunction, type Request, type Response, type Router } from 'node-karin/express'
import botRouter from './bot'
import messageRouter from './message'

const router: Router = express.Router()

// 图片以 base64 随 JSON 发送，体积较大，放宽请求体限制（默认 100kb 远远不够）
router.use(express.json({ limit: '50mb' }))
router.use(botRouter)
router.use('/message', messageRouter)

// 统一 JSON 错误返回（默认错误处理器会返回 HTML 错误页，前端 fetch 无法解析）
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ code: -1, message: err.message || '请求解析失败', data: null })
})

export default router
