import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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

interface UiContextType {
  // 主题
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  actualTheme: 'light' | 'dark'

  // 全局浮层
  toast: Toast | null
  setToast: (toast: string | Toast | null) => void
  alertDialog: { title: string, message: string } | null
  setAlertDialog: (v: { title: string, message: string } | null) => void
  confirmDialog: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null
  setConfirmDialog: (v: { title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null) => void
  contextMenu: ContextMenuState | null
  setContextMenu: (v: ContextMenuState | null) => void

  // 回复 / @ 草稿 / 跳转高亮
  replyTo: ChatMessage | null
  setReplyTo: (v: ChatMessage | null) => void
  /** 待插入输入框的 @ 目标 userId，由 InputArea 消费后清空 */
  pendingMention: string | null
  setPendingMention: (v: string | null) => void
  flashMessageId: string | null
  flashMessage: (messageId: string) => void

  // 输入区
  stagedImages: string[]
  setStagedImages: React.Dispatch<React.SetStateAction<string[]>>
  showSettings: boolean
  setShowSettings: (v: boolean) => void
}

const UiContext = createContext<UiContextType | undefined>(undefined)

export const UiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
  })
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light')
  const actualTheme = theme === 'system' ? systemTheme : theme

  const [toast, _setToast] = useState<Toast | null>(null)
  const [alertDialog, setAlertDialog] = useState<{ title: string, message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string, message: string, onConfirm: () => void, confirmText?: string, cancelText?: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [pendingMention, setPendingMention] = useState<string | null>(null)
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null)

  const [stagedImages, setStagedImages] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setToast = useCallback((val: string | Toast | null) => {
    if (typeof val === 'string') {
      _setToast({ message: val, type: 'info' })
    } else {
      _setToast(val)
    }
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => _setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

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

  // 根元素挂 .dark class，组件用 tailwind 的 dark: 变体 + tg-* 变量配色
  useEffect(() => {
    document.documentElement.classList.toggle('dark', actualTheme === 'dark')
  }, [actualTheme])

  /** 回复跳转后的短暂高亮 */
  const flashMessage = useCallback((messageId: string) => {
    setFlashMessageId(messageId)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashMessageId(null), 1600)
  }, [])

  return (
    <UiContext.Provider value={{
      theme,
      setTheme,
      actualTheme,
      toast,
      setToast,
      alertDialog,
      setAlertDialog,
      confirmDialog,
      setConfirmDialog,
      contextMenu,
      setContextMenu,
      replyTo,
      setReplyTo,
      pendingMention,
      setPendingMention,
      flashMessageId,
      flashMessage,
      stagedImages,
      setStagedImages,
      showSettings,
      setShowSettings
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
