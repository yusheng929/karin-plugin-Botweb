import type { FriendItem, GroupItem, GroupMemberItem } from './dto'
import { profileDb, memberDb, type ProfileRow, type MemberRow } from './db'

/**
 * 好友/群资料 + 用户头像缓存（插件私有 sqlite，表结构见 db.ts 的 profiles 表）。
 * 用途：qqbot 等协议端没有好友/群列表接口，收到消息时把会话资料异步落库，
 * 列表接口在协议端返回空或报错时回退到本缓存，保证面板会话有名称和头像。
 */

const toFriendItem = (row: ProfileRow): FriendItem => ({
  userId: row.target_id,
  nick: row.name || row.target_id,
  remark: row.remark || undefined,
  avatar: row.avatar || undefined
})

const toGroupItem = (row: ProfileRow): GroupItem => ({
  groupId: row.target_id,
  groupName: row.name || undefined,
  memberCount: row.member_count ?? undefined,
  avatar: row.avatar || undefined
})

const toMemberItem = (row: MemberRow): GroupMemberItem => ({
  userId: row.user_id,
  nick: row.nick || undefined,
  card: row.card || undefined,
  role: row.role === 'owner' || row.role === 'admin' ? row.role : 'member',
  title: row.title || undefined
})

export const ProfileCache = {
  async getFriend (selfId: string, userId: string): Promise<FriendItem | null> {
    const row = await profileDb.get('friend', selfId, userId).catch(() => null)
    return row ? toFriendItem(row) : null
  },

  async setFriend (selfId: string, item: FriendItem): Promise<void> {
    await profileDb.upsert({
      self_id: selfId,
      kind: 'friend',
      target_id: item.userId,
      name: item.nick || '',
      remark: item.remark || '',
      avatar: item.avatar || '',
      member_count: null
    }).catch(() => {})
  },

  async getGroup (selfId: string, groupId: string): Promise<GroupItem | null> {
    const row = await profileDb.get('group', selfId, groupId).catch(() => null)
    return row ? toGroupItem(row) : null
  },

  async setGroup (selfId: string, item: GroupItem): Promise<void> {
    await profileDb.upsert({
      self_id: selfId,
      kind: 'group',
      target_id: item.groupId,
      name: item.groupName || '',
      remark: '',
      avatar: item.avatar || '',
      member_count: item.memberCount ?? null
    }).catch(() => {})
  },

  /** 用户头像 url 缓存（统一走协议端 getAvatarUrl，未命中返回空串） */
  async getAvatar (selfId: string, userId: string): Promise<string> {
    const row = await profileDb.get('avatar', selfId, userId).catch(() => null)
    return row?.avatar || ''
  },

  async setAvatar (selfId: string, userId: string, url: string): Promise<void> {
    if (!url) return
    await profileDb.upsert({
      self_id: selfId,
      kind: 'avatar',
      target_id: userId,
      name: '',
      remark: '',
      avatar: url,
      member_count: null
    }).catch(() => {})
  },

  /** 某 bot 的全部缓存好友 */
  async friends (selfId: string): Promise<FriendItem[]> {
    const rows = await profileDb.list('friend', selfId).catch(() => [] as ProfileRow[])
    return rows.map(toFriendItem)
  },

  /** 某 bot 的全部缓存群 */
  async groups (selfId: string): Promise<GroupItem[]> {
    const rows = await profileDb.list('group', selfId).catch(() => [] as ProfileRow[])
    return rows.map(toGroupItem)
  },

  /** 单个群成员缓存（未命中返回 null） */
  async getMember (selfId: string, groupId: string, userId: string): Promise<GroupMemberItem | null> {
    const row = await memberDb.get(selfId, groupId, userId).catch(() => null)
    return row ? toMemberItem(row) : null
  },

  async setMember (selfId: string, groupId: string, item: GroupMemberItem): Promise<void> {
    await memberDb.upsert({
      self_id: selfId,
      group_id: groupId,
      user_id: item.userId,
      nick: item.nick || '',
      card: item.card || '',
      role: item.role,
      title: item.title || ''
    }).catch(() => {})
  },

  /** 某群的全部缓存成员 */
  async members (selfId: string, groupId: string): Promise<GroupMemberItem[]> {
    const rows = await memberDb.list(selfId, groupId).catch(() => [])
    return rows.map(toMemberItem)
  }
}
