import karin from 'node-karin'
import { ApiResult } from '@/types'
import { fail, ok } from './response'
import { toBotInfo, toForwardMessageItem, toFriendItem, toGroupItem, toMemberItem } from './dto'
import type { BotInfo, ForwardMessageItem, FriendItem, GroupItem, GroupMemberItem } from './dto'
import { ProfileCache } from './cache'
import { SettingsService } from './settings'

export const BotService = {
  get (Id: string) {
    return karin.getBot(Id)
  },

  /** 获取所有已登录 Bot 列表 */
  list (): ApiResult<BotInfo[]> {
    return ok(karin.getAllBotList().map(({ bot }) => toBotInfo(bot)))
  },

  /**
   * 获取好友列表（并发获取头像，失败降级为空字符串）。
   * qqbot 等协议端没有好友列表接口（返回空数组而不是抛错），
   * 拿到空列表或接口报错时回退到 db 资料缓存；拿到真实列表时顺手刷新缓存。
   * 缓存刷新受设置门控（联系人/群组统计，默认仅非 QQ 协议，见 settings.ts）。
   */
  async friends (selfId: string): Promise<ApiResult<FriendItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getFriendList()
      if (list.length === 0) return ok(await ProfileCache.friends(selfId))
      const data = await Promise.all(list.map(async (user) => {
        const avatar = await bot.getAvatarUrl(String(user.userId)).catch(() => '')
        return toFriendItem(user, avatar)
      }))
      // 异步刷新缓存，不阻塞接口返回
      if (SettingsService.shouldCacheProfiles(bot.adapter.protocol)) {
        void Promise.all(data.map(item => ProfileCache.setFriend(selfId, item))).catch(() => {})
      }
      return ok(data)
    } catch (err) {
      const cached = await ProfileCache.friends(selfId)
      return cached.length > 0 ? ok(cached) : fail(err instanceof Error ? err.message : '获取好友列表失败')
    }
  },

  /** 获取群列表（空列表/报错回退 db 缓存，缓存刷新按设置门控，逻辑同好友列表） */
  async groups (selfId: string): Promise<ApiResult<GroupItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getGroupList()
      if (list.length === 0) return ok(await ProfileCache.groups(selfId))
      const data = list.map(toGroupItem)
      if (SettingsService.shouldCacheProfiles(bot.adapter.protocol)) {
        void Promise.all(data.map(item => ProfileCache.setGroup(selfId, item))).catch(() => {})
      }
      return ok(data)
    } catch (err) {
      const cached = await ProfileCache.groups(selfId)
      return cached.length > 0 ? ok(cached) : fail(err instanceof Error ? err.message : '获取群列表失败')
    }
  },

  /**
   * 获取群成员列表。
   * qqbot 等协议端没有成员列表接口（返回空数组而不是抛错），空列表/报错时回退 db 成员缓存
   * （由列表刷新与 ProfileService 的群消息发送者统计累积）；拿到真实列表时按设置门控刷新缓存。
   */
  async members (selfId: string, groupId: string): Promise<ApiResult<GroupMemberItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getGroupMemberList(groupId)
      if (list.length === 0) return ok(await ProfileCache.members(selfId, groupId))
      const data = list.map(toMemberItem)
      if (SettingsService.shouldCacheProfiles(bot.adapter.protocol)) {
        void Promise.all(data.map(item => ProfileCache.setMember(selfId, groupId, item))).catch(() => {})
      }
      return ok(data)
    } catch (err) {
      const cached = await ProfileCache.members(selfId, groupId)
      return cached.length > 0 ? ok(cached) : fail(err instanceof Error ? err.message : '获取群成员列表失败')
    }
  },

  /**
   * 批量获取用户头像 url（userId -> url）。
   * 统一走协议端 getAvatarUrl（qlogo 只对 QQ 有效，前端不得自行拼地址），
   * 结果写 db 头像缓存；单次最多 50 个，防止协议端接口被打爆
   */
  async avatars (selfId: string, ids: string[]): Promise<ApiResult<Record<string, string>>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    const out: Record<string, string> = {}
    await Promise.all(ids.slice(0, 50).map(async (userId) => {
      const cached = await ProfileCache.getAvatar(selfId, userId)
      if (cached) {
        out[userId] = cached
        return
      }
      const url = await bot.getAvatarUrl(userId).catch(() => '')
      if (url) {
        out[userId] = url
        await ProfileCache.setAvatar(selfId, userId, url)
      }
    }))
    return ok(out)
  },

  /** 戳一戳群成员 */
  async poke (selfId: string, groupId: string, targetId: string): Promise<ApiResult<boolean>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      return ok(await bot.pokeUser(karin.contactGroup(groupId), targetId))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '戳一戳失败')
    }
  },

  /** 戳一戳好友 */
  async pokeFriend (selfId: string, targetId: string): Promise<ApiResult<boolean>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      return ok(await bot.pokeUser(karin.contactFriend(targetId), targetId))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '戳一戳失败')
    }
  },

  /** 踢出群成员（需要 Bot 是管理员及以上） */
  async kick (selfId: string, groupId: string, targetId: string): Promise<ApiResult<null>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      await bot.groupKickMember(groupId, targetId)
      return ok(null)
    } catch (err) {
      return fail(err instanceof Error ? err.message : '踢出成员失败')
    }
  },

  /** 拉取合并转发消息内容（resId 来自 forward 元素，协议端不支持时返回 fail） */
  async forward (selfId: string, resId: string): Promise<ApiResult<ForwardMessageItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    if (!resId) return fail('缺少 resId')
    try {
      const list = await bot.getForwardMsg(resId)
      return ok(list.map(toForwardMessageItem))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '获取合并转发消息失败')
    }
  }
}
