import React, { useState } from 'react'
import {
  MessageCircle,
  Users,
  Settings,
  Sun,
  Moon,
  Monitor,
  Check
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { cn } from '../utils'
import { Avatar } from './Avatar'

const THEME_OPTIONS = [
  { value: 'light', label: '白天模式', icon: Sun },
  { value: 'dark', label: '黑夜模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
] as const

type PopupKind = 'account' | 'theme'

/**
 * QQ NT 桌面版式固定导航栏：
 * 顶部头像 + 昵称（点击头像弹出账号切换列表），
 * 中部「聊天 / 联系人」，底部「主题 / 设置」
 */
export const NavRail: React.FC = () => {
  const { bots, currentBot, selectBot, botUnread, conversations } = useChat()
  const { theme, setTheme, actualTheme, navView, setNavView } = useUi()
  const [popup, setPopup] = useState<PopupKind | null>(null)

  /** 聊天导航上的总未读角标 */
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  const togglePopup = (kind: PopupKind) => setPopup(prev => (prev === kind ? null : kind))

  const navItem = (
    view: 'chats' | 'contacts' | 'settings',
    icon: React.ReactNode,
    label: string,
    badge = 0
  ) => {
    const active = navView === view
    return (
      <button
        onClick={() => {
          setNavView(view)
          setPopup(null)
        }}
        className={cn(
          'relative w-14 py-2 rounded-xl flex flex-col items-center gap-1 transition-colors',
          active ? 'bg-tg-hover text-tg-blue' : 'text-tg-text-secondary hover:bg-tg-hover'
        )}
        title={label}
      >
        {icon}
        <span className='text-[10px] leading-none'>{label}</span>
        {badge > 0 && (
          <span className='absolute top-0.5 right-0.5 bg-tg-badge text-white text-[10px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 font-medium'>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  const ThemeIcon = actualTheme === 'dark' ? Moon : Sun

  return (
    <nav className='w-[72px] flex flex-col items-center py-3 gap-1 border-r border-tg-border bg-tg-rail shrink-0 relative z-40'>
      {/* 头像 + 昵称：点击头像弹出账号切换列表 */}
      <button
        onClick={() => togglePopup('account')}
        className='rounded-full transition-transform hover:scale-105 active:scale-95'
        title='切换账号'
      >
        <Avatar
          url={currentBot?.avatar}
          name={currentBot?.name || '?'}
          className={cn('w-11 h-11 text-base', popup === 'account' && 'ring-2 ring-tg-blue')}
        />
      </button>
      <span className='w-full px-1 text-center text-[10px] text-tg-text-secondary truncate select-none'>
        {currentBot?.name || '未连接'}
      </span>

      {/* 中部导航 */}
      <div className='mt-3 flex flex-col items-center gap-1'>
        {navItem('chats', <MessageCircle className='w-5 h-5' />, '聊天', totalUnread)}
        {navItem('contacts', <Users className='w-5 h-5' />, '联系人')}
      </div>

      {/* 底部：主题 / 设置 */}
      <div className='mt-auto flex flex-col items-center gap-1'>
        <button
          onClick={() => togglePopup('theme')}
          className={cn(
            'w-14 py-2 rounded-xl flex flex-col items-center gap-1 transition-colors',
            popup === 'theme' ? 'bg-tg-hover text-tg-blue' : 'text-tg-text-secondary hover:bg-tg-hover'
          )}
          title='主题'
        >
          <ThemeIcon className='w-5 h-5' />
          <span className='text-[10px] leading-none'>主题</span>
        </button>
        {navItem('settings', <Settings className='w-5 h-5' />, '设置')}
      </div>

      {/* 弹层通用遮罩：点击空白处关闭 */}
      {popup && <div className='fixed inset-0 z-40' onClick={() => setPopup(null)} />}

      {/* 账号切换弹层 */}
      <AnimatePresence>
        {popup === 'account' && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className='absolute left-full top-2 ml-2 z-50 w-60 bg-tg-bg border border-tg-border rounded-xl shadow-xl py-1.5 overflow-hidden'
          >
            <div className='px-4 pt-1.5 pb-2 border-b border-tg-border mb-1'>
              <div className='text-sm font-medium truncate'>{currentBot?.name || '未连接 Bot'}</div>
              <div className='text-xs text-tg-text-secondary truncate'>{currentBot?.selfId}</div>
            </div>
            {bots.length === 0 && (
              <div className='px-4 py-6 text-center text-sm text-tg-text-secondary'>暂无在线 Bot</div>
            )}
            {bots.map((b) => {
              const isCurrent = b.selfId === currentBot?.selfId
              const unread = !isCurrent ? (botUnread[b.selfId] || 0) : 0
              return (
                <button
                  key={b.selfId}
                  onClick={() => {
                    if (!isCurrent) selectBot(b.selfId)
                    setPopup(null)
                  }}
                  className='w-full flex items-center gap-3 px-4 py-2.5 hover:bg-tg-hover transition-colors'
                >
                  <Avatar url={b.avatar} name={b.name} className='w-9 h-9 text-sm' />
                  <span className='flex-1 min-w-0 text-left'>
                    <span className='block text-sm truncate'>{b.name}</span>
                    <span className='block text-xs text-tg-text-secondary truncate'>{b.selfId}</span>
                  </span>
                  {unread > 0 && (
                    <span className='bg-tg-badge text-white text-[11px] min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 font-medium'>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {isCurrent && <Check className='w-4 h-4 text-tg-blue shrink-0' />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主题切换弹层 */}
      <AnimatePresence>
        {popup === 'theme' && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className='absolute left-full bottom-2 ml-2 z-50 w-44 bg-tg-bg border border-tg-border rounded-xl shadow-xl py-1.5 overflow-hidden'
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => {
                  setTheme(value)
                  setPopup(null)
                }}
                className='w-full flex items-center gap-3 px-4 py-2.5 hover:bg-tg-hover transition-colors text-sm'
              >
                <Icon className='w-4 h-4 text-tg-text-secondary' />
                <span className='flex-1 text-left'>{label}</span>
                {theme === value && <Check className='w-4 h-4 text-tg-blue' />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
