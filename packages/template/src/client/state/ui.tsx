import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toast as heroToast } from '@heroui/react'
import { ChatMessage } from '../../core/types'

export interface ContextMenuState {
  x: number
  y: number
  /** avatar：消息发送者头像菜单；message：消息菜单；image：图片（lightbox）菜单；member：群资料页成员列表菜单 */
  kind: 'avatar' | 'message' | 'image' | 'member'
  msg?: ChatMessage
  /** kind 为 image 时的图片地址 */
  file?: string
  /** kind 为 member 时的目标成员 */
  member?: { userId: string, name: string }
}

export interface Toast {
  message: string
  type: 'success' | 'error' | 'info'
}

/** 面板 toast 类型 -> HeroUI toast variant（info 用 accent 蓝） */
const TOAST_VARIANT = { success: 'success', error: 'danger', info: 'accent' } as const

interface UiContextType {
  // 主题
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  actualTheme: 'light' | 'dark'

  // 导航栏当前视图（QQ NT 式固定侧边栏：聊天 / 联系人 / 设置）
  navView: 'chats' | 'contacts' | 'settings'
  setNavView: (v: 'chats' | 'contacts' | 'settings') => void

  // 全局浮层
  setToast: (toast: string | Toast | null) => void
  alertDialog: { title: string, message: string } | null
  setAlertDialog: (v: { title: string, message: string } | null) => void
  confirmDialog: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null
  setConfirmDialog: (v: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null) => void
  contextMenu: ContextMenuState | null
  setContextMenu: (v: ContextMenuState | null) => void
  /** 「原始事件」浮层：右键菜单触发后按 msgid 拉取协议端原始消息（data 到位前为加载态） */
  rawMessage: { data?: unknown, error?: string } | null
  setRawMessage: (v: { data?: unknown, error?: string } | null) => void
  /** 「贴表情」选择器（右键菜单触发）：坐标 + 目标消息，由 Overlays 渲染 ReactionPicker */
  reactionPicker: { x: number, y: number, msg: ChatMessage } | null
  setReactionPicker: (v: { x: number, y: number, msg: ChatMessage } | null) => void

  // 回复 / @ 草稿 / 跳转高亮
  replyTo: ChatMessage | null
  setReplyTo: (v: ChatMessage | null) => void
  /** 待插入输入框的 @ 目标 userId，由 InputArea 消费后清空 */
  pendingMention: string | null
  setPendingMention: (v: string | null) => void
  /** 待填入输入框的内联指令（mqqapi://aio/inlinecmd 链接点击触发），由 InputArea 消费后清空 */
  pendingInlineCmd: { command: string, enter: boolean, reply: boolean, message: ChatMessage } | null
  setPendingInlineCmd: (v: { command: string, enter: boolean, reply: boolean, message: ChatMessage } | null) => void
  /** 待内联进输入框的图片文件（拖拽进窗口的图片），由 InputArea 消费后清空 */
  pendingImages: File[] | null
  setPendingImages: (v: File[] | null) => void
  flashMessageId: string | null
  flashMessage: (messageId: string) => void

  // 输入区
  /** 群资料面板（docked 右侧栏）开关，仅群聊会话显示 */
  groupPanelOpen: boolean
  setGroupPanelOpen: (v: boolean) => void
}

const UiContext = createContext<UiContextType | undefined>(undefined)

export const UiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light')
  const actualTheme = theme === 'system' ? systemTheme : theme

  const [alertDialog, setAlertDialog] = useState<{ title: string, message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rawMessage, setRawMessage] = useState<{ data?: unknown, error?: string } | null>(null)
  const [reactionPicker, setReactionPicker] = useState<{ x: number, y: number, msg: ChatMessage } | null>(null)

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [pendingMention, setPendingMention] = useState<string | null>(null)
  const [pendingInlineCmd, setPendingInlineCmd] = useState<{ command: string, enter: boolean, reply: boolean, message: ChatMessage } | null>(null)
  const [pendingImages, setPendingImages] = useState<File[] | null>(null)
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null)

  const [groupPanelOpen, setGroupPanelOpen] = useState(true)

  const [navView, setNavView] = useState<'chats' | 'contacts' | 'settings'>('chats')

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** HeroUI toast：状态由 ToastQueue 管理（5 秒自动关闭），setToast(null) 清空全部 */
  const setToast = useCallback((val: string | Toast | null) => {
    if (val === null) {
      heroToast.clear()
      return
    }
    const t = typeof val === 'string' ? { message: val, type: 'info' as const } : val
    heroToast(t.message, { variant: TOAST_VARIANT[t.type], timeout: 5000 })
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // 根元素挂 .dark class，组件配色走 qq-* CSS 变量（.dark 下自动切换）
  useEffect(() => {
    document.documentElement.classList.toggle('dark', actualTheme === 'dark')
  }, [actualTheme])

  /** 回复跳转后的短暂高亮（与 index.css 的 qq-highlight 动画时长一致） */
  const flashMessage = useCallback((messageId: string) => {
    setFlashMessageId(messageId)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashMessageId(null), 2000)
  }, [])

  return (
    <UiContext.Provider value={{
      theme,
      setTheme,
      actualTheme,
      navView,
      setNavView,
      setToast,
      alertDialog,
      setAlertDialog,
      confirmDialog,
      setConfirmDialog,
      contextMenu,
      setContextMenu,
      rawMessage,
      setRawMessage,
      reactionPicker,
      setReactionPicker,
      replyTo,
      setReplyTo,
      pendingMention,
      setPendingMention,
      pendingInlineCmd,
      setPendingInlineCmd,
      pendingImages,
      setPendingImages,
      flashMessageId,
      flashMessage,
      groupPanelOpen,
      setGroupPanelOpen
    }}
    >
      {children}
    </UiContext.Provider>
  )
}

export const useUi = () => {
  const context = useContext(UiContext)
  if (context === undefined) {
    throw new Error('useUi must be used within a UiProvider')
  }
  return context
}
