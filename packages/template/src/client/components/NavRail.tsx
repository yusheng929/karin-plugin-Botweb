import React from 'react'
import {
  MessageCircle,
  Users,
  Settings,
  Sun,
  Moon,
  Monitor,
  Menu,
  LogOut
} from 'lucide-react'
import { Badge, Dropdown, Header, Label, Separator } from '@heroui/react'
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
 * 底部汉堡菜单（HeroUI Dropdown）：主题切换 / 设置 / 退出登录
 */
export const NavRail: React.FC = () => {
  const { conversations } = useChat()
  const { theme, setTheme, navView, setNavView } = useUi()

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
        onClick={() => setNavView(view)}
        className={cn(
          'relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
          active ? 'text-qq-blue' : 'text-qq-text-secondary hover:bg-qq-hover'
        )}
        title={label}
      >
        {/* HeroUI Badge：absolute 定位相对 Anchor（默认 placement top-right） */}
        <Badge.Anchor>
          {icon}
          {badge > 0 && (
            <Badge color='danger' size='sm' className='pointer-events-none'>
              {badge > 99 ? '99+' : badge}
            </Badge>
          )}
        </Badge.Anchor>
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
        <Dropdown>
          <Dropdown.Trigger
            className='w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors text-qq-text-secondary hover:bg-qq-hover data-[pressed]:text-qq-blue'
            aria-label='菜单'
          >
            <Menu className='w-[22px] h-[22px]' strokeWidth={1.6} />
          </Dropdown.Trigger>
          <Dropdown.Popover placement='right bottom' className='min-w-44'>
            <Dropdown.Menu
              onAction={(key) => {
                if (key === 'settings') setNavView('settings')
                if (key === 'logout') logout()
              }}
            >
              <Dropdown.Section
                selectionMode='single'
                selectedKeys={[theme]}
                onSelectionChange={(keys) => {
                  if (keys === 'all') return
                  const v = [...keys][0] as typeof theme | undefined
                  if (v) setTheme(v)
                }}
              >
                <Header>外观</Header>
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <Dropdown.Item key={value} id={value} textValue={label}>
                    <Icon className='w-4 h-4 text-muted' />
                    <Label>{label}</Label>
                    <Dropdown.ItemIndicator className='ms-auto' />
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
              <Separator />
              <Dropdown.Item id='settings' textValue='设置'>
                <Settings className='w-4 h-4 text-muted' />
                <Label>设置</Label>
              </Dropdown.Item>
              <Dropdown.Item id='logout' textValue='退出登录' variant='danger'>
                <LogOut className='w-4 h-4' />
                <Label>退出登录</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </nav>
  )
}
