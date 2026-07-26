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
  { value: 'light', label: '浅色模式', icon: Sun },
  { value: 'dark', label: '深色模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
] as const

type PopupKind = 'account' | 'theme'

/**
 * Mac 版 QQ 功能栏（icon-only）：
 * 顶部 macOS 红绿灯装饰，其下头像（点击弹出账号切换列表），
 * 中部「消息 / 联系人」图标，底部「主题 / 设置」图标，均无文字标签（悬停 tooltip）
 */
export const NavRail: React.FC = () => {
  const { bots, currentBot, selectBot, botUnread, conversations } = useChat()
  const { theme, setTheme, actualTheme, navView, setNavView } = useUi()
  const [popup, setPopup] = useState<PopupKind | null>(null)

  /** 消息导航上的总未读角标 */
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
          'relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
          active ? 'text-qq-blue bg-qq-blue/12' : 'text-qq-text-secondary hover:bg-qq-hover'
        )}
        title={label}
      >
        {icon}
        {badge > 0 && (
          <span className='absolute -top-0.5 -right-1 bg-qq-badge text-white text-[10px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 font-medium shadow-sm'>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  const ThemeIcon = actualTheme === 'dark' ? Moon : Sun

  return (
    <nav className='w-[64px] flex flex-col items-center pt-3 pb-4 gap-2 bg-qq-rail shrink-0 relative z-40'>
      {/* macOS 红绿灯（纯装饰，无行为） */}
      <div className='traffic-lights mb-3 self-stretch justify-center'>
        <span className='tl-close' />
        <span className='tl-min' />
        <span className='tl-max' />
      </div>

      {/* 头像：点击弹出账号切换列表 */}
      <button
        onClick={() => togglePopup('account')}
        className='rounded-full transition-transform hover:scale-105 active:scale-95'
        title={currentBot ? `${currentBot.name}（切换账号）` : '未连接'}
      >
        <Avatar
          url={currentBot?.avatar}
          name={currentBot?.name || '?'}
          className={cn('w-9 h-9 text-sm', popup === 'account' && 'ring-2 ring-qq-blue ring-offset-2 ring-offset-qq-rail')}
        />
      </button>

      {/* 中部导航 */}
      <div className='mt-4 flex flex-col items-center gap-2'>
        {navItem('chats', <MessageCircle className='w-[22px] h-[22px]' strokeWidth={1.8} />, '消息', totalUnread)}
        {navItem('contacts', <Users className='w-[22px] h-[22px]' strokeWidth={1.8} />, '联系人')}
      </div>

      {/* 底部：主题 / 设置 */}
      <div className='mt-auto flex flex-col items-center gap-2'>
        <button
          onClick={() => togglePopup('theme')}
          className={cn(
            'w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
            popup === 'theme' ? 'text-qq-blue bg-qq-blue/12' : 'text-qq-text-secondary hover:bg-qq-hover'
          )}
          title='外观'
        >
          <ThemeIcon className='w-[22px] h-[22px]' strokeWidth={1.8} />
        </button>
        {navItem('settings', <Settings className='w-[22px] h-[22px]' strokeWidth={1.8} />, '设置')}
      </div>

      {/* 弹层通用遮罩：点击空白处关闭 */}
      {popup && <div className='fixed inset-0 z-40' onClick={() => setPopup(null)} />}

      {/* 账号切换弹层 */}
      <AnimatePresence>
        {popup === 'account' && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className='absolute left-full top-2 ml-2 z-50 w-60 glass rounded-xl shadow-2xl py-1 overflow-hidden'
          >
            <div className='px-3.5 pt-2 pb-2 border-b border-qq-border mb-1'>
              <div className='text-[13px] font-semibold truncate'>{currentBot?.name || '未连接 Bot'}</div>
              <div className='text-xs text-qq-text-secondary truncate'>{currentBot?.selfId}</div>
            </div>
            {bots.length === 0 && (
              <div className='px-4 py-6 text-center text-[13px] text-qq-text-secondary'>暂无在线 Bot</div>
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
                  className='w-[calc(100%-0.5rem)] mx-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-qq-hover transition-colors'
                >
                  <Avatar url={b.avatar} name={b.name} className='w-8 h-8 text-sm' />
                  <span className='flex-1 min-w-0 text-left'>
                    <span className='block text-[13px] truncate'>{b.name}</span>
                    <span className='block text-xs text-qq-text-secondary truncate'>{b.selfId}</span>
                  </span>
                  {unread > 0 && (
                    <span className='bg-qq-badge text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 font-medium'>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {isCurrent && <Check className='w-4 h-4 text-qq-blue shrink-0' />}
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
            initial={{ opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className='absolute left-full bottom-2 ml-2 z-50 w-40 glass rounded-xl shadow-2xl p-1 overflow-hidden'
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => {
                  setTheme(value)
                  setPopup(null)
                }}
                className='w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-qq-hover transition-colors text-[13px]'
              >
                <Icon className='w-4 h-4 text-qq-text-secondary' />
                <span className='flex-1 text-left'>{label}</span>
                {theme === value && <Check className='w-3.5 h-3.5 text-qq-blue' />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
