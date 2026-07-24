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
