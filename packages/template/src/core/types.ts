/**
 * BotWeb 前后端共享 DTO（与 packages/core 的 service/dto.ts 保持一致）。
 * 字段统一 camelCase，ID 均为字符串（karin 标准层返回 string）。
 */

/** Bot 信息 */
export interface BotInfo {
  selfId: string
  name: string
  avatar: string
  /** 适配器协议实现（icqq/napcat/llonebot 等，据此做 QQ 平台适配） */
  protocol: string
}

/** 好友列表项 */
export interface FriendItem {
  userId: string
  nick: string
  remark?: string
  avatar?: string
}

/** 群列表项 */
export interface GroupItem {
  groupId: string
  groupName?: string
  memberCount?: number
  avatar?: string
}

/** 群成员列表项 */
export interface GroupMemberItem {
  userId: string
  nick?: string
  card?: string
  role: 'owner' | 'admin' | 'member' | 'unknown'
  /** 群内专属头衔（含自定义头衔，与 core/src/service/dto.ts 保持一致） */
  title?: string
}

/** 用户头像增量项（profiles 推送的 users 字段，头像统一由后端协议端 getAvatarUrl 提供） */
export interface UserAvatarItem {
  userId: string
  avatar: string
}

/** 联系人/群组统计模式（与 core 的 service/dto.ts 保持一致） */
export type ProfileCacheMode = 'all' | 'non-qq' | 'off'

/** 插件设置（与 core 的 service/dto.ts 保持一致） */
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

/** 消息元素（客户端与后端 DTO 共用，未知类型降级为 other） */
export type MessageElement =
  | { type: 'text', text: string }
  /** file 为 url 或 base64 */
  | { type: 'image', file: string }
  | { type: 'at', targetId: string, name?: string }
  | { type: 'face', id: number }
  | { type: 'reply', messageId: string }
  /** 文件：file 为 url 或 base64，name/size 用于展示 */
  | { type: 'file', file: string, name?: string, size?: number }
  /** 视频：file 为 url 或 base64 */
  | { type: 'video', file: string, name?: string }
  /** 语音：file 为 url 或 base64 */
  | { type: 'record', file: string, name?: string }
  /** 合并转发：id 为 resId，内容点击后经 GET /bots/:selfId/forward 拉取 */
  | { type: 'forward', id: string }
  /** markdown 原文（前端按 bot 协议族渲染：QQ/Telegram/Discord 语法各异） */
  | { type: 'markdown', content: string }
  /** 按钮/键盘（QQ 按钮，link 可跳转，其余仅展示不可触发） */
  | { type: 'buttons', rows: ButtonItem[][] }
  | { type: 'other', text: string }

/** 按钮项（与 core 的 service/dto.ts 保持一致） */
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

/** 合并转发内容项（与 core 的 service/dto.ts 保持一致） */
export interface ForwardMessageItem {
  senderId: string
  senderName: string
  /** 秒级时间戳 */
  time: number
  elements: MessageElement[]
}

/** 会话场景 */
export type ChatScene = 'friend' | 'group'

/** 消息表情回应（QQ 贴表情，faceId 为 QQ 小黄脸 id） */
export interface ReactionItem {
  faceId: number
  count: number
}

/** 聊天消息 */
export interface ChatMessage {
  messageId: string
  /** 消息序号（karin messageSeq，无则为 0） */
  seq: number
  /** 所属 Bot */
  selfId: string
  scene: ChatScene
  /** 好友 userId 或群 groupId */
  peer: string
  senderId: string
  senderName: string
  /** 秒级时间戳 */
  time: number
  elements: MessageElement[]
  /** 表情回应聚合（faceId -> 次数），随 reaction 推送增量更新 */
  reactions?: ReactionItem[]
  /** 系统提示消息（戳一戳/撤回等小灰条），前端居中灰色渲染 */
  system?: boolean
  /** 前端本地状态：发送中/失败/已撤回 */
  status?: 'sending' | 'failed'
  recalled?: boolean
}

/** 会话摘要（后端按 bot 聚合：每个有本地消息的会话的最后一条） */
export interface ConversationSummary {
  scene: ChatScene
  peer: string
  lastMessage: ChatMessage
}

/** 分页拉取历史消息的响应 */
export interface MessagePage {
  /** 本页消息（时间升序） */
  messages: ChatMessage[]
  /** 是否还有更早的消息 */
  hasMore: boolean
  /** 下一页游标：协议端历史页为 messageId，本地 db 页为 sqlite rowid 字符串；无更多时为 null */
  cursor: string | null
}

/** 后端统一响应包装 */
export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}

/** WS 推送帧（server -> client） */
export type WsPush =
  | { type: 'message', data: ChatMessage }
  | {
    type: 'recall', data: {
      selfId: string
      messageId: string
      scene: ChatScene
      peer: string
      /** 操作者（撤回人） */
      operatorId?: string
      /** 被撤回消息的发送者 */
      targetId?: string
    }
  }
  /** 戳一戳通知（渲染为小灰条） */
  | {
    type: 'poke', data: {
      selfId: string
      scene: ChatScene
      peer: string
      operatorId: string
      targetId: string
      /** 操作名称，如“戳了戳” */
      action: string
      /** 后缀文案 */
      suffix: string
    }
  }
  /** 表情回应（QQ 贴表情）：isSet=true 添加、false 取消，count 为本次次数（缺省按 1） */
  | {
    type: 'reaction', data: {
      selfId: string
      scene: ChatScene
      peer: string
      messageId: string
      /** 操作者（贴表情的人） */
      operatorId: string
      faceId: number
      count: number
      isSet: boolean
    }
  }
  /**
   * 会话资料增量（收到消息时后端异步补全的头像/名称）。
   * 主要服务 qqbot 等没有好友/群列表接口的协议端：前端 upsert 进
   * friends/groups 状态后，临时会话即可显示真实名称与头像
   */
  | {
    type: 'profiles', data: {
      selfId: string
      friends: FriendItem[]
      groups: GroupItem[]
      /** 群消息发送者头像增量（进 avatarMap 用于气泡头像，不进好友列表） */
      users: UserAvatarItem[]
    }
  }
