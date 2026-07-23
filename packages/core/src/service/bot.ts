import karin from 'node-karin'
import { ApiResult } from '@/types'
import { fail, ok } from './response'
import { toBotInfo, toFriendItem, toGroupItem, toMemberItem } from './dto'
import type { BotInfo, FriendItem, GroupItem, GroupMemberItem } from './dto'

export const BotService = {
  get (Id: string) {
    return karin.getBot(Id)
  },

  /** 获取所有已登录 Bot 列表 */
  list (): ApiResult<BotInfo[]> {
    return ok(karin.getAllBotList().map(({ bot }) => toBotInfo(bot)))
  },

  /** 获取好友列表（并发获取头像，失败降级为空字符串） */
  async friends (selfId: string): Promise<ApiResult<FriendItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getFriendList()
      const data = await Promise.all(list.map(async (user) => {
        const avatar = await bot.getAvatarUrl(String(user.userId)).catch(() => '')
        return toFriendItem(user, avatar)
      }))
      return ok(data)
    } catch (err) {
      return fail(err instanceof Error ? err.message : '获取好友列表失败')
    }
  },

  /** 获取群列表 */
  async groups (selfId: string): Promise<ApiResult<GroupItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getGroupList()
      return ok(list.map(toGroupItem))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '获取群列表失败')
    }
  },

  /** 获取群成员列表 */
  async members (selfId: string, groupId: string): Promise<ApiResult<GroupMemberItem[]>> {
    const bot = this.get(selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const list = await bot.getGroupMemberList(groupId)
      return ok(list.map(toMemberItem))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '获取群成员列表失败')
    }
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
  }
}
