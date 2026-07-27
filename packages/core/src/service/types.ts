import type { ChatScene, MessageElement } from './dto'

/** 发送消息请求体 */
export interface SendMessageType {
  /** Bot自身ID */
  selfId: string
  /** 场景：好友/群 */
  scene: ChatScene
  /** 好友 userId 或群 groupId */
  peer: string
  /** 消息元素列表 */
  elements: MessageElement[]
}

/** 撤回消息请求体 */
export interface RecallMessageType {
  /** Bot自身ID */
  selfId: string
  /** 场景：好友/群 */
  scene: ChatScene
  /** 好友 userId 或群 groupId */
  peer: string
  /** 消息ID */
  messageId: string
}

/** 表情回应（贴表情）请求体 */
export interface ReactionMessageType {
  /** Bot自身ID */
  selfId: string
  /** 场景：好友/群 */
  scene: ChatScene
  /** 好友 userId 或群 groupId */
  peer: string
  /** 消息ID */
  messageId: string
  /** QQ 小黄脸 id */
  faceId: number
  /** true 贴（默认）/ false 取消 */
  isSet?: boolean
}
