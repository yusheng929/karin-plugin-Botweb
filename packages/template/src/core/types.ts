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
  | { type: 'other', text: string }

/** 会话场景 */
export type ChatScene = 'friend' | 'group'

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
  /** 系统提示消息（戳一戳/撤回等小灰条），前端居中灰色渲染 */
  system?: boolean
  /** 前端本地状态：发送中/失败/已撤回 */
  status?: 'sending' | 'failed'
  recalled?: boolean
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
