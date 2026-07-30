import type { AdapterType, GroupInfo, GroupMemberInfo, KarinButton, Message, MessageResponse, SendElement, UserInfo } from 'node-karin'
import { segment } from 'node-karin'

/**
 * 前后端共享 DTO（与 packages/template/src/core/types.ts 保持一致）
 */

export interface BotInfo {
  selfId: string
  name: string
  avatar: string
  /** 适配器协议实现（icqq/napcat/llonebot 等；milky 为实现名如 Yogurt，不可枚举） */
  protocol: string
  /** 适配器平台（qq/guild/custom 等，前端据此做 QQ 平台能力判定） */
  platform: string
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
  /** 群内专属头衔（含自定义头衔，uniqueTitle；为空则不显示头衔徽章） */
  title?: string
}

/** 用户头像增量项（profiles 推送的 users 字段，与 template/src/core/types.ts 保持一致） */
export interface UserAvatarItem {
  userId: string
  /** 协议端 getAvatarUrl 拿到的头像 url */
  avatar: string
}

/** 联系人/群组统计模式（与 template/src/core/types.ts 保持一致） */
export type ProfileCacheMode = 'all' | 'non-qq' | 'off'

/** 插件设置（与 template/src/core/types.ts 保持一致） */
export interface BotWebSettings {
  /**
   * 联系人/群组/群成员本地统计开关：
   * all=统计全部 Bot；non-qq（默认）=仅统计非 QQ 协议 Bot；off=关闭统计
   */
  profileCacheMode: ProfileCacheMode
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
  /** JSON 卡片消息（小程序/分享卡片等，data 为原始 JSON 字符串，前端美化展示） */
  | { type: 'json', data: string }
  /** markdown 原文（前端按 bot 协议族渲染：QQ/Telegram/Discord 语法各异） */
  | { type: 'markdown', content: string }
  /** 按钮/键盘（QQ 按钮，link 可跳转，其余仅展示不可触发） */
  | { type: 'buttons', rows: ButtonItem[][] }
  | { type: 'other', text: string }

/** 按钮项（与 template/src/core/types.ts 保持一致） */
export interface ButtonItem {
  text: string
  /** 跳转链接（有则可点击打开） */
  link?: string
  /** 操作相关数据 */
  data?: string
  /** 点击后显示的文字 */
  show?: string
  /** QQ 按钮样式（0 灰线框 / 1 蓝线框 / 3 红字等） */
  style?: number
}

/** 消息表情回应（QQ 贴表情，faceId 为 QQ 小黄脸 id，与 template/src/core/types.ts 保持一致） */
export interface ReactionItem {
  faceId: number
  count: number
}

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
  /** 表情回应聚合（faceId -> 次数），随 reaction 推送增量更新 */
  reactions?: ReactionItem[]
  /** 已撤回（前端给原气泡打红框标记，与 template/src/core/types.ts 保持一致） */
  recalled?: boolean
}

/** 分页拉取历史消息的响应（与 template/src/core/types.ts 保持一致） */
export interface MessagePage {
  /** 本页消息（时间升序） */
  messages: ChatMessage[]
  /** 是否还有更早的消息 */
  hasMore: boolean
  /** 下一页游标：协议端历史页为 messageId，本地 db 页为 sqlite rowid 字符串；无更多时为 null */
  cursor: string | null
}

/** Bot 适配器 -> BotInfo */
export const toBotInfo = (bot: AdapterType): BotInfo => ({
  selfId: bot.selfId,
  name: bot.account?.name || bot.selfName || bot.selfId,
  avatar: bot.account?.avatar || '',
  protocol: bot.adapter.protocol,
  platform: bot.adapter.platform
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
  role: member.role === 'owner' || member.role === 'admin' ? member.role : 'member',
  title: member.uniqueTitle || undefined
})

/**
 * karin 消息元素 -> 前端 DTO。
 * 底线：**只做类型打标，内容字段原样透传，不增删改任何数据**——
 * 自行重组消息体会导致用户查看原始数据时被误导。
 * 渲染智能（QQ 卡片、markdown、按钮样式）全部在前端基于原始数据完成。
 */
export const convertElements = (list: Message['elements']): MessageElement[] => {
  return list.map((el): MessageElement => {
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
      case 'json':
        return { type: 'json', data: el.data }
      case 'markdown':
        return { type: 'markdown', content: el.markdown }
      case 'button':
        // 单行按钮视作一行键盘，按钮对象原样透传（不裁剪字段）
        return { type: 'buttons', rows: [el.data] }
      case 'keyboard':
        return { type: 'buttons', rows: el.rows }
      default:
        // 未知元素：原样序列化，不生成占位文本
        return { type: 'other', text: JSON.stringify(el) }
    }
  })
}

/** karin 消息事件 -> ChatMessage（仅 friend/group 场景） */
export const toChatMessage = (e: Message): ChatMessage | null => {
  const scene = e.contact.scene
  if (scene !== 'friend' && scene !== 'group') return null

  return {
    messageId: e.messageId,
    seq: e.messageSeq || 0,
    selfId: e.selfId,
    scene,
    peer: String(e.contact.peer),
    senderId: String(e.sender.userId),
    senderName: e.sender.nick || String(e.sender.userId),
    time: e.time,
    elements: convertElements(e.elements)
  }
}

/** getHistoryMsg 返回项 -> ChatMessage（selfId/scene/peer 由调用方上下文补齐，MessageResponse 不带 bot 归属） */
export const toHistoryChatMessage = (item: MessageResponse, selfId: string, scene: ChatScene, peer: string): ChatMessage => ({
  messageId: String(item.messageId),
  seq: Number(item.messageSeq) || 0,
  selfId,
  scene,
  peer,
  senderId: String(item.sender.userId),
  senderName: item.sender.nick || String(item.sender.userId),
  time: item.time,
  elements: convertElements(item.elements)
})

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
      case 'json':
        return segment.json(el.data)
      case 'markdown':
        // 面板不构造 markdown 发送，收到后转发/重发场景降级为原文文本（内容即原始数据，无占位）
        return segment.text(el.content)
      case 'buttons':
        // ButtonItem 与 karin KarinButton 字段一致，原样回发为真按钮而不是占位文本
        return segment.keyboard(el.rows)
      default:
        // other 有 text 直接用；历史数据里的未知元素（如已废弃的 forward）原样序列化
        return segment.text(el.text ?? JSON.stringify(el))
    }
  })
}
