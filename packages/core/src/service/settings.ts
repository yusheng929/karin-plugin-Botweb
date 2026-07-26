import path from 'node:path'
import fs from 'node:fs'
import { logger } from 'node-karin'
import { dir } from '@/dir'
import type { BotWebSettings, ProfileCacheMode } from './dto'

/**
 * 插件设置（JSON 持久化，位于 karin 运行时目录 @karinjs/karin-plugin-botweb/data/settings.json）。
 * 与 profiles/messages 的 sqlite 不同：设置是低频读写的用户配置，JSON 便于手改和排查。
 */

/** QQ 协议实现（onebot 系协议端自带好友/群/群成员列表，无需本地统计；与 template utils.ts 的 QQ_FACE_PROTOCOLS 保持一致） */
const QQ_PROTOCOLS = ['icqq', 'gocq-http', 'napcat', 'oicq', 'llonebot', 'lagrange']

const PROFILE_CACHE_MODES: ProfileCacheMode[] = ['all', 'non-qq', 'off']

const DEFAULT_SETTINGS: BotWebSettings = {
  profileCacheMode: 'non-qq',
  messageStore: true,
  messageStoreBots: []
}

const file = () => path.join(dir.dataDir, 'settings.json')

let cache: BotWebSettings | null = null

/** 读盘（带默认值归并，文件损坏时回退默认） */
const load = (): BotWebSettings => {
  if (cache) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf-8')) as Partial<BotWebSettings>
    cache = {
      profileCacheMode: PROFILE_CACHE_MODES.includes(raw.profileCacheMode as ProfileCacheMode)
        ? raw.profileCacheMode as ProfileCacheMode
        : DEFAULT_SETTINGS.profileCacheMode,
      messageStore: typeof raw.messageStore === 'boolean' ? raw.messageStore : DEFAULT_SETTINGS.messageStore,
      messageStoreBots: Array.isArray(raw.messageStoreBots)
        ? raw.messageStoreBots.filter(id => typeof id === 'string')
        : [...DEFAULT_SETTINGS.messageStoreBots]
    }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export const SettingsService = {
  get (): BotWebSettings {
    const current = load()
    return { ...current, messageStoreBots: [...current.messageStoreBots] }
  },

  /** 更新并落盘（部分字段归并，非法值忽略） */
  update (patch: Partial<BotWebSettings>): BotWebSettings {
    const current = load()
    if (patch.profileCacheMode && PROFILE_CACHE_MODES.includes(patch.profileCacheMode)) {
      current.profileCacheMode = patch.profileCacheMode
    }
    if (typeof patch.messageStore === 'boolean') {
      current.messageStore = patch.messageStore
    }
    if (Array.isArray(patch.messageStoreBots)) {
      current.messageStoreBots = patch.messageStoreBots.filter(id => typeof id === 'string')
    }
    try {
      fs.mkdirSync(dir.dataDir, { recursive: true })
      fs.writeFileSync(file(), JSON.stringify(current, null, 2))
    } catch (err) {
      logger.error(`[BotWeb] 保存设置失败: ${err instanceof Error ? err.message : err}`)
    }
    return this.get()
  },

  /**
   * 该协议的 bot 是否需要本地统计联系人/群组/群成员：
   * all=全部统计；off=全部不统计；non-qq（默认）=QQ 协议有 getFriendList/getGroupList，不统计
   */
  shouldCacheProfiles (protocol: string): boolean {
    const mode = load().profileCacheMode
    if (mode === 'all') return true
    if (mode === 'off') return false
    return !QQ_PROTOCOLS.includes(protocol)
  },

  /**
   * 该 bot 的消息是否落库（messages 表）：
   * 全局开关关闭时所有 bot 都不存（即使单独开启）；全局开启时也仅存单独开启的 bot
   */
  shouldStoreMessage (selfId: string): boolean {
    const current = load()
    return current.messageStore && current.messageStoreBots.includes(selfId)
  }
}
