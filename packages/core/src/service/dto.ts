import type { AdapterType, GroupInfo, GroupMemberInfo, KarinButton, Message, MessageResponse, SendElement, UserInfo } from 'node-karin'
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

/** 联系人/群组统计模式（与 template/src/core/types.ts 保持一致） */
export type ProfileCacheMode = 'all' | 'non-qq' | 'off'

/** 插件设置（与 template/src/core/types.ts 保持一致） */
export interface BotWebSettings {
  /**
   * 联系人/群组/群成员本地统计开关：
   * all=统计全部 Bot；non-qq（默认）=仅统计非 QQ 协议 Bot；off=关闭统计
   */
  profileCacheMode: ProfileCacheMode
  /** 全局消息存储总开关：关闭时所有 bot 都不存消息（即使单独开启的 bot 也不存） */
  messageStore: boolean
  /** 单独开启消息存储的 bot selfId 列表（仅在全局开关打开时生效，默认空=都不存） */
  messageStoreBots: string[]
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
  /** 合并转发：id 为 resId，内容按需经 GET /bots/:selfId/forward 拉取 */
  | { type: 'forward', id: string }
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

/** 合并转发内容项（bot.getForwardMsg 拉取，与 template/src/core/types.ts 保持一致） */
export interface ForwardMessageItem {
  senderId: string
  senderName: string
  /** 秒级时间戳 */
  time: number
  elements: MessageElement[]
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

/** 会话摘要（前端启动时按 bot 拉取：每个有本地消息的会话的最后一条，与 template/src/core/types.ts 保持一致） */
export interface ConversationSummary {
  scene: ChatScene
  peer: string
  lastMessage: ChatMessage
}

/** 分页拉取历史消息的响应（与 template/src/core/types.ts 保持一致） */
export interface MessagePage {
  /** 本页消息（时间升序） */
  messages: ChatMessage[]
  /** 是否还有更早的消息 */
  hasMore: boolean
  /** 下一页游标（本页最旧一条的 sqlite rowid），无更多时为 null */
  cursor: number | null
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

/**
 * OneBot 原始消息段识别：karin 的 OneBot 适配器对未知消息段（如合并转发、markdown、
 * mface 商城表情）会序列化成 `{"type":"forward","data":{"id":"..."}}` 等的文本元素，
 * 这里还原为对应元素。无法识别时返回 null
 */
const parseRawSegment = (text: string): MessageElement | null => {
  const t = text.trim()
  if (!t.startsWith('{')) return null
  try {
    const raw = JSON.parse(t)
    if (raw?.type === 'forward' && typeof raw.data?.id === 'string' && raw.data.id) {
      return { type: 'forward', id: raw.data.id }
    }
    if (raw?.type === 'markdown' && typeof raw.data?.content === 'string') {
      return { type: 'markdown', content: raw.data.content }
    }
    // mface：QQ 商城表情/动态贴纸（NapCat、LLOneBot 等直接给 gif url），映射为图片；
    // 无 url 的协议端（gocq 等）降级为摘要文本
    if (raw?.type === 'mface') {
      const url = raw.data?.url
      if (typeof url === 'string' && url) return { type: 'image', file: url }
      const summary = raw.data?.summary
      return { type: 'other', text: typeof summary === 'string' && summary ? summary : '[动画表情]' }
    }
    // 魔法表情：骰子/猜拳只展示占位（结果点数协议端一般不下发）
    if (raw?.type === 'dice') return { type: 'other', text: '[骰子]' }
    if (raw?.type === 'rps') return { type: 'other', text: '[猜拳]' }
  } catch {}
  return null
}

/** karin 按钮 -> ButtonItem（只保留展示所需字段） */
const toButtonItem = (btn: KarinButton): ButtonItem => ({
  text: btn.text,
  link: btn.link,
  data: btn.data,
  show: btn.show,
  style: btn.style
})

/** 去重比较用文本归一：折叠所有空白（兼容 \r\n/\n、全角空格与首尾差异） */
const normalizeDupText = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * markdown -> 纯文本近似：去掉常见语法标记。
 * 用于识别 NapCat/milky 等协议端随 markdown 段一起下发的「渲染后纯文本」副本
 * （如 `# 你好` 的副本是 `你好`）；只需覆盖 QQ 常用语法，
 * 覆盖不到时退化为原文比较，不影响正常消息
 */
const markdownToPlain = (md: string): string => md
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 图片 -> alt 文本
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接 -> 链接文本
  .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 标题
  .replace(/^\s{0,3}>\s?/gm, '') // 引用块
  .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '') // 无序/有序列表
  .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
  .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
  .replace(/~~?(.*?)~~?/g, '$1') // 删除线
  .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // 行内代码

/** karin 消息元素 -> 前端 DTO（toChatMessage 与合并转发内容共用） */
export const convertElements = (list: Message['elements']): MessageElement[] => {
  const converted = list.map((el): MessageElement => {
    switch (el.type) {
      case 'text':
        return parseRawSegment(el.text) ?? { type: 'text', text: el.text }
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
      case 'longMsg':
        return { type: 'forward', id: el.id }
      case 'markdown':
        // karin 标准 markdown 元素：保留原文，前端按协议族渲染
        return { type: 'markdown', content: el.markdown }
      case 'button':
        // 单行按钮视作一行键盘
        return { type: 'buttons', rows: [el.data.map(toButtonItem)] }
      case 'keyboard':
        return { type: 'buttons', rows: el.rows.map(row => row.map(toButtonItem)) }
      default:
        return { type: 'other', text: `[${el.type}]` }
    }
  })

  // 部分协议端（NapCat/milky 等）会在同一条消息里同时下发 markdown 段和它的文本副本，
  // 副本可能是 markdown 原文、也可能是去掉语法后的纯文本（如 `# 你好` -> `你好`），
  // 两种形态都识别并去掉，防止前端渲染两遍
  const mdKeys = new Set<string>()
  for (const el of converted) {
    if (el.type !== 'markdown') continue
    mdKeys.add(normalizeDupText(el.content))
    mdKeys.add(normalizeDupText(markdownToPlain(el.content)))
  }
  mdKeys.delete('')
  if (mdKeys.size === 0) return converted
  return converted.filter(el => !(el.type === 'text' && mdKeys.has(normalizeDupText(el.text))))
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

/** getForwardMsg 返回项 -> ForwardMessageItem */
export const toForwardMessageItem = (item: MessageResponse): ForwardMessageItem => ({
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
      case 'forward':
        return segment.text('[合并转发]')
      case 'markdown':
        // 面板不构造 markdown 发送，收到后转发/重发场景降级为原文文本
        return segment.text(el.content)
      case 'buttons':
        return segment.text('[按钮]')
      default:
        return segment.text(el.text || '[不支持的消息]')
    }
  })
}
