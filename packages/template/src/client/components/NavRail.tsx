import React, { useState } from 'react'
import {
  MessageCircle,
  Users,
  Settings,
  Sun,
  Moon,
  Monitor,
  Check,
  Menu,
  LogOut
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { logout } from '../auth'
import { cn } from '../utils'

const THEME_OPTIONS = [
  { value: 'light', label: '浅色模式', icon: Sun },
  { value: 'dark', label: '深色模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
] as const

/**
 * Mac 版 QQ 功能栏（icon-only，按设计图）：
 * 顶部 macOS 红绿灯装饰，中部「消息 / 联系人」线性图标（未读角标），
 * 底部汉堡菜单弹层：主题切换 / 设置 / 退出登录
 */
export const NavRail: React.FC = () => {
  const { conversations } = useChat()
  const { theme, setTheme, navView, setNavView } = useUi()
  const [menuOpen, setMenuOpen] = useState(false)

  /** 消息导航上的总未读角标 */
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  const navItem = (
    view: 'chats' | 'contacts',
    icon: React.ReactNode,
    label: string,
    badge = 0
  ) => {
    const active = navView === view
    return (
      <button
        onClick={() => {
          setNavView(view)
          setMenuOpen(false)
        }}
        className={cn(
          'relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
          active ? 'text-qq-blue' : 'text-qq-text-secondary hover:bg-qq-hover'
        )}
        title={label}
      >
        {icon}
        {badge > 0 && (
          <span className='unread-pill absolute -top-0.5 -right-1 !min-w-[16px] !h-4 text-[10px] font-medium shadow-sm'>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav className='w-[60px] flex flex-col items-center pt-3 pb-4 gap-2 bg-qq-rail shrink-0 relative z-40 border-r border-qq-border'>
      {/* macOS 红绿灯（纯装饰，无行为） */}
      <div className='traffic-lights mb-4 self-stretch justify-center'>
        <span className='tl-close' />
        <span className='tl-min' />
        <span className='tl-max' />
      </div>

      {/* 中部导航 */}
      <div className='flex flex-col items-center gap-2'>
        {navItem('chats', <MessageCircle className='w-[22px] h-[22px]' strokeWidth={1.6} />, '消息', totalUnread)}
        {navItem('contacts', <Users className='w-[22px] h-[22px]' strokeWidth={1.6} />, '联系人')}
      </div>

      {/* 底部：汉堡菜单（主题 / 设置 / 退出登录） */}
      <div className='mt-auto flex flex-col items-center gap-2'>
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          className={cn(
            'w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
            menuOpen ? 'text-qq-blue' : 'text-qq-text-secondary hover:bg-qq-hover'
          )}
          title='菜单'
        >
          <Menu className='w-[22px] h-[22px]' strokeWidth={1.6} />
        </button>
      </div>

      {/* 弹层遮罩：点击空白处关闭 */}
      {menuOpen && <div className='fixed inset-0 z-40' onClick={() => setMenuOpen(false)} />}

      {/* 菜单弹层 */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className='absolute left-full bottom-2 ml-2 z-50 w-44 glass rounded-xl shadow-2xl p-1 overflow-hidden'
          >
            <div className='px-2.5 pt-1.5 pb-1 text-[11px] text-qq-text-tertiary'>外观</div>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => {
                  setTheme(value)
                  setMenuOpen(false)
                }}
                className='w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-qq-hover transition-colors text-[13px]'
              >
                <Icon className='w-4 h-4 text-qq-text-secondary' />
                <span className='flex-1 text-left'>{label}</span>
                {theme === value && <Check className='w-3.5 h-3.5 text-qq-blue' />}
              </button>
            ))}
            <div className='my-1 border-t border-qq-border' />
            <button
              onClick={() => {
                setNavView('settings')
                setMenuOpen(false)
              }}
              className='w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-qq-hover transition-colors text-[13px]'
            >
              <Settings className='w-4 h-4 text-qq-text-secondary' />
              <span className='flex-1 text-left'>设置</span>
              {navView === 'settings' && <Check className='w-3.5 h-3.5 text-qq-blue' />}
            </button>
            <button
              onClick={() => logout()}
              className='w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-qq-hover transition-colors text-[13px] text-qq-badge'
            >
              <LogOut className='w-4 h-4' />
              <span className='flex-1 text-left'>退出登录</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
