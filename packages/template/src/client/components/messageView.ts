import { createContext, useContext } from 'react'
import { BotInfo, ChatMessage, GroupMemberItem } from '../../core/types'
import { ContextMenuState, Toast } from '../state/ui'

/**
 * 消息列表专用的供数 context（由 MessageList 提供，MessageItem/MessageMarkdown 等消费）。
 * 与 useChat/useUi 区分开：chat/ui 的 context value 随消息流与全局 UI 状态高频变化，
 * 消息项直接订阅会导致每条新消息、每次 toast/右键菜单都全量重渲染（长记录下卡死）。
 * 这里的 value 经 useMemo 固定，只在 bot/会话切换、头像表或群成员表变化时才更新。
 */
export interface MessageViewContextType {
  /** 当前 bot（头像、protocol 判定、合并转发拉取用） */
  currentBot: BotInfo | null
  /** 私聊对方的会话头像（群会话为 undefined） */
  conversationAvatar?: string
  /** 群成员查找（名片/角色徽章），MessageList 侧用 Map 保证 O(1) */
  getMember: (userId: string) => GroupMemberItem | undefined
  /** 用户头像（后端 getAvatarUrl 缓存），未命中返回 undefined 由调用方字母占位 */
  getAvatar: (userId: string) => string | undefined
  /** 按 messageId 查本会话消息（引用块预览用） */
  getMessage: (messageId: string) => ChatMessage | undefined
  resendMessage: (messageId: string) => Promise<void>
  reactMessage: (msg: ChatMessage, faceId: number) => Promise<void>
  hasReacted: (msg: ChatMessage, faceId: number) => boolean
  // 以下为 ui 的稳定回调（setState 包装，identity 不变）
  setToast: (toast: string | Toast | null) => void
  setConfirmDialog: (v: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null) => void
  setContextMenu: (v: ContextMenuState | null) => void
  setPendingInlineCmd: (v: { command: string, enter: boolean, reply: boolean, message: ChatMessage } | null) => void
  /** 回复跳转后的短暂高亮 */
  flashMessage: (messageId: string) => void
}

const MessageViewContext = createContext<MessageViewContextType | undefined>(undefined)

export const MessageViewProvider = MessageViewContext.Provider

export const useMessageView = () => {
  const context = useContext(MessageViewContext)
  if (context === undefined) {
    throw new Error('useMessageView must be used within a MessageViewProvider')
  }
  return context
}
