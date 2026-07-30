import { SettingsService } from '@/service'
import { ok } from '@/service/response'
import type { BotWebSettings } from '@/service'
import express, { type Router } from 'node-karin/express'

const router: Router = express.Router()

/** 获取插件设置 */
router.get('/settings', (_req, res) => {
  res.json(ok(SettingsService.get()))
})

/** 更新插件设置（部分字段归并，非法值忽略，返回更新后的完整设置） */
router.post('/settings', (req, res) => {
  const body = (req.body ?? {}) as Partial<BotWebSettings>
  res.json(ok(SettingsService.update({
    profileCacheMode: body.profileCacheMode
  })))
})

export default router
