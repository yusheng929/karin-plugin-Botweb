import type { AdapterType, GroupInfo, GroupMemberInfo, Message, SendElement, UserInfo } from 'node-karin'
import { segment } from 'node-karin'

/**
 * 前后端共享 DTO（与 packages/template/src/core/types.ts 保持一致）
 */

export interface BotInfo {
  selfId: string
  name: string
  avatar: string
  /** 适配器协议实现（icqq/napcat/llonebot 等，前端据此做 QQ 平台适配） */
  protocol: string
}

export interface FriendItem {
  userId: string
  nick: string
  remark?: string
  avatar?: string
}

export interface GroupItem {
  groupId: string
  groupName?: string
  memberCount?: number
  avatar?: string
}

export interface GroupMemberItem {
  userId: string
  nick?: string
  card?: string
  role: 'owner' | 'admin' | 'member' | 'unknown'
}

/** 用户头像增量项（profiles 推送的 users 字段，与 template/src/core/types.ts 保持一致） */
export interface UserAvatarItem {
  userId: string
  /** 协议端 getAvatarUrl 拿到的头像 url */
  avatar: string
}

export type ChatScene = 'friend' | 'group'

export type MessageElement =
  | { type: 'text', text: string }
  | { type: 'image', file: string }
  | { type: 'at', targetId: string, name?: string }
  | { type: 'face', id: number }
  | { type: 'reply', messageId: string }
  | { type: 'file', file: string, name?: string, size?: number }
  | { type: 'video', file: string, name?: string }
  | { type: 'record', file: string, name?: string }
  | { type: 'other', text: string }

export interface ChatMessage {
  messageId: string
  seq: number
  selfId: string
  scene: ChatScene
  peer: string
  senderId: string
  senderName: string
  /** 秒级时间戳 */
  time: number
  elements: MessageElement[]
  /** 已撤回（前端给原气泡打红框标记，与 template/src/core/types.ts 保持一致） */
  recalled?: boolean
}

/** Bot 适配器 -> BotInfo */
export const toBotInfo = (bot: AdapterType): BotInfo => ({
  selfId: bot.selfId,
  name: bot.account?.name || bot.selfName || bot.selfId,
  avatar: bot.account?.avatar || '',
  protocol: bot.adapter.protocol
})

/** 好友信息 -> FriendItem */
export const toFriendItem = (user: UserInfo, avatar = ''): FriendItem => ({
  userId: String(user.userId),
  nick: user.nick || String(user.userId),
  remark: user.remark,
  avatar
})

/** 群信息 -> GroupItem */
export const toGroupItem = (group: GroupInfo): GroupItem => ({
  groupId: String(group.groupId),
  groupName: group.groupName || group.groupRemark || String(group.groupId),
  memberCount: group.memberCount,
  avatar: group.avatar
})

/** 群成员 -> GroupMemberItem */
export const toMemberItem = (member: GroupMemberInfo): GroupMemberItem => ({
  userId: String(member.userId),
  nick: member.nick,
  card: member.card,
  role: member.role === 'owner' || member.role === 'admin' ? member.role : 'member'
})

/** karin 消息事件 -> ChatMessage（仅 friend/group 场景） */
export const toChatMessage = (e: Message): ChatMessage | null => {
  const scene = e.contact.scene
  if (scene !== 'friend' && scene !== 'group') return null

  const elements: MessageElement[] = e.elements.map((el) => {
    switch (el.type) {
      case 'text':
        return { type: 'text', text: el.text }
      case 'image':
        return { type: 'image', file: el.file }
      case 'at':
        return { type: 'at', targetId: String(el.targetId), name: el.name }
      case 'face':
        return { type: 'face', id: el.id }
      case 'reply':
        return { type: 'reply', messageId: el.messageId }
      case 'file':
        return { type: 'file', file: el.file, name: el.name, size: el.size }
      case 'video':
        return { type: 'video', file: el.file, name: el.name }
      case 'record':
        return { type: 'record', file: el.file, name: el.name }
      default:
        return { type: 'other', text: `[${el.type}]` }
    }
  })

  return {
    messageId: e.messageId,
    seq: e.messageSeq || 0,
    selfId: e.selfId,
    scene,
    peer: String(e.contact.peer),
    senderId: String(e.sender.userId),
    senderName: e.sender.nick || String(e.sender.userId),
    time: e.time,
    elements
  }
}

/** 客户端 DTO 元素 -> karin SendElement */
export const toSendElements = (elements: MessageElement[]): SendElement[] => {
  return elements.map((el) => {
    switch (el.type) {
      case 'text':
        return segment.text(el.text)
      case 'image':
        return segment.image(el.file)
      case 'at':
        return segment.at(el.targetId, el.name)
      case 'face':
        return segment.face(el.id)
      case 'reply':
        return segment.reply(el.messageId)
      case 'file':
        return segment.file(el.file, { name: el.name, size: el.size })
      case 'video':
        return segment.video(el.file, { name: el.name })
      case 'record':
        return segment.record(el.file, false, { name: el.name })
      default:
        return segment.text(el.text || '[不支持的消息]')
    }
  })
}
