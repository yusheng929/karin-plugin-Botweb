import karin, { logger } from 'node-karin'
import type { Message } from 'node-karin'
import type { FriendItem, GroupItem, UserAvatarItem } from './dto'
import { ProfileCache } from './cache'
import { SettingsService } from './settings'

/** 会话资料增量（WS profiles 推送载荷，契约见 template/src/core/types.ts） */
export interface ProfileUpdates {
  selfId: string
  friends: FriendItem[]
  groups: GroupItem[]
  /** 群消息发送者头像（前端进 avatarMap 用于气泡头像，不进好友列表） */
  users: UserAvatarItem[]
}

/** 正在补全中的资料 key，防止同一会话的连续消息并发打爆协议端接口 */
const pending = new Set<string>()

/** 统计关闭时的进程内去重：不落库，但同一会话每次启动最多补一次协议端调用 */
const synced = new Set<string>()

const run = async (key: string, task: () => Promise<void>): Promise<boolean> => {
  if (pending.has(key)) return false
  pending.add(key)
  try {
    await task()
    return true
  } finally {
    pending.delete(key)
  }
}

/**
 * 收到消息后异步补全会话资料（头像/名称）：
 * 缓存未命中才调协议端接口，命中后写入 db 缓存并返回增量，由调用方广播给前端。
 * 持久化受设置门控（联系人/群组统计，默认仅非 QQ 协议，见 settings.ts）：
 * 统计关闭的 bot 仍实时补全并推送（进程内去重），只是不落库。
 * 仅供 hooks 里 fire-and-forget 调用，内部不抛异常。
 */
export const ProfileService = {
  async syncMessage (e: Message): Promise<ProfileUpdates | null> {
    try {
      const scene = e.contact.scene
      if (scene !== 'friend' && scene !== 'group') return null
      const bot = karin.getBot(e.selfId)
      if (!bot) return null
      const cacheEnabled = SettingsService.shouldCacheProfiles(bot.adapter.protocol)

      const friends: FriendItem[] = []
      const groups: GroupItem[] = []
      const users: UserAvatarItem[] = []

      if (scene === 'group') {
        const groupId = String(e.contact.peer)
        const groupKey = `group:${e.selfId}:${groupId}`
        const cached = cacheEnabled ? !!await ProfileCache.getGroup(e.selfId, groupId) : synced.has(groupKey)
        if (!cached) {
          await run(groupKey, async () => {
            // qqbot 等不支持 getGroupInfo 的协议端返回空字段而不抛错，两者都要兜底
            const info = await bot.getGroupInfo(groupId).catch(() => null)
            const avatar = info?.avatar || await bot.getGroupAvatarUrl(groupId).catch(() => '')
            const item: GroupItem = {
              groupId,
              groupName: info?.groupName || info?.groupRemark || '',
              memberCount: info?.memberCount || undefined,
              avatar
            }
            if (cacheEnabled) await ProfileCache.setGroup(e.selfId, item)
            else synced.add(groupKey)
            groups.push(item)
          })
        }

        const senderId = String(e.sender.userId)

        // 群消息发送者头像：统一走协议端 getAvatarUrl（前端禁止直拼 qlogo，非 QQ 协议会裂图）。
        // 只进头像缓存/avatarMap，不进好友缓存，避免群成员变成好友会话
        if (senderId && senderId !== e.selfId && !await ProfileCache.getAvatar(e.selfId, senderId)) {
          await run(`avatar:${e.selfId}:${senderId}`, async () => {
            const avatar = await bot.getAvatarUrl(senderId).catch(() => '')
            if (avatar) {
              await ProfileCache.setAvatar(e.selfId, senderId, avatar)
              users.push({ userId: senderId, avatar })
            }
          })
        }

        // 群成员统计：把发言者累积进 members 表（qqbot 等没有成员列表接口的协议端靠它攒成员名册）。
        // GroupSender 携带群名片/角色/专属头衔时一并入册（OneBot 群消息发送者字段）
        if (cacheEnabled && senderId && senderId !== e.selfId) {
          const memberKey = `member:${e.selfId}:${groupId}:${senderId}`
          if (!synced.has(memberKey) && !await ProfileCache.getMember(e.selfId, groupId, senderId)) {
            await run(memberKey, async () => {
              const sender = e.sender as { nick?: string, card?: string, role?: string, title?: string }
              await ProfileCache.setMember(e.selfId, groupId, {
                userId: senderId,
                nick: e.sender.nick || '',
                card: sender.card || undefined,
                role: sender.role === 'owner' || sender.role === 'admin' ? sender.role : 'member',
                title: sender.title || undefined
              })
              synced.add(memberKey)
            })
          }
        }
      }

      // 私聊：peer 即对方（自己发出的消息 peer 也是对方），缓存好友资料（含头像）。
      // 群聊发送者已在上面补进 users 头像增量，不进好友缓存，否则前端会把每个群成员都当成好友会话
      if (scene === 'friend') {
        const userId = String(e.contact.peer)
        if (userId && userId !== e.selfId) {
          const friendKey = `friend:${e.selfId}:${userId}`
          const cached = cacheEnabled ? !!await ProfileCache.getFriend(e.selfId, userId) : synced.has(friendKey)
          if (!cached) {
            await run(friendKey, async () => {
              const avatar = await bot.getAvatarUrl(userId).catch(() => '')
              const item: FriendItem = {
                userId,
                nick: e.sender.userId === userId ? (e.sender.nick || userId) : userId,
                avatar
              }
              if (cacheEnabled) await ProfileCache.setFriend(e.selfId, item)
              else synced.add(friendKey)
              friends.push(item)
            })
          }
        }
      }

      if (friends.length === 0 && groups.length === 0 && users.length === 0) return null
      return { selfId: e.selfId, friends, groups, users }
    } catch (err) {
      logger.debug(`[BotWeb] 补全会话资料失败: ${err instanceof Error ? err.message : err}`)
      return null
    }
  }
}
