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
