import React, { useMemo, useState } from 'react'
import {
  Menu,
  Bot,
  Search,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
  ArrowLeft,
  UserRound,
  Users,
  Settings,
  IdCard,
  AtSign
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat, Conversation } from '../state/chat'
import { useUi } from '../state/ui'
import { getMessageSummary, toMillis, cn } from '../utils'

/** TG 风格头像底色板（按名字 hash 取色） */
const AVATAR_COLORS = ['#cc5049', '#d67722', '#955cdb', '#40a920', '#309eba', '#368ad1', '#c7508b']

const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** 头像：有 url 用图片，否则用名称首字符圆形占位（TG 配色） */
export const Avatar: React.FC<{ url?: string, name: string, className?: string }> = ({ url, name, className }) => {
  if (url) {
    return <img src={url} alt={name} referrerPolicy='no-referrer' className={cn('object-cover rounded-full', className)} />
  }
  return (
    <div
      className={cn('rounded-full text-white flex items-center justify-center font-medium select-none', className)}
      style={{ backgroundColor: avatarColor(name || '?') }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

/** 会话列表时间：今天显示 HH:MM，否则显示 M月d日 */
const formatListTime = (time?: number) => {
  if (!time) return ''
  const d = new Date(toMillis(time))
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${d.getMonth() + 1}月${d.getDate()}日`
}

const THEME_OPTIONS = [
  { value: 'light', label: '白天模式', icon: Sun },
  { value: 'dark', label: '黑夜模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
] as const

type DrawerView = 'menu' | 'profile' | 'contacts' | 'settings'

/**
 * TG 桌面版式左侧抽屉：蓝色头部（头像/昵称/ID，点击展开账号切换列表），
 * 菜单项「我的资料 / 联系人 / 设置（占位）」与主题切换
 */
const DrawerMenu: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { bots, currentBot, selectBot, botUnread, conversations, openConversation } = useChat()
  const { theme, setTheme } = useUi()
  const [view, setView] = useState<DrawerView>('menu')
  const [showAccounts, setShowAccounts] = useState(false)
  /** 联系人分组的折叠状态（默认展开） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  /** 联系人视图：好友在前、群在后，各按名称排序 */
  const contacts = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.scene !== b.scene) return a.scene === 'friend' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [conversations])

  const menuItem = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className='w-full flex items-center gap-4 px-4 py-2.5 hover:bg-tg-hover transition-colors text-sm'
    >
      <span className='text-tg-text-secondary'>{icon}</span>
      <span className='flex-1 text-left'>{label}</span>
    </button>
  )

  const subViewHeader = (title: string) => (
    <div className='h-14 px-2 flex items-center gap-2 border-b border-tg-border shrink-0'>
      <button
        onClick={() => setView('menu')}
        className='p-2.5 rounded-full hover:bg-tg-hover transition-colors text-tg-text-secondary'
        title='返回'
      >
        <ArrowLeft className='w-5 h-5' />
      </button>
      <h3 className='text-sm font-semibold'>{title}</h3>
    </div>
  )

  return (
    <>
      {/* 遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className='fixed inset-0 bg-black/30 z-40'
      />
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        className='fixed left-0 top-0 bottom-0 w-[300px] bg-tg-bg shadow-2xl z-50 flex flex-col overflow-hidden'
      >
        {view === 'menu' && (
          <>
            {/* 蓝色头部：头像 / 昵称 / ID，点击展开账号列表 */}
            <div className='bg-tg-blue text-white shrink-0'>
              <div
                onClick={() => setShowAccounts(!showAccounts)}
                className='px-4 pt-5 pb-4 cursor-pointer hover:bg-white/5 transition-colors'
                title='切换账号'
              >
                <div className='flex items-start justify-between'>
                  <Avatar url={currentBot?.avatar} name={currentBot?.name || '?'} className='w-14 h-14 text-xl ring-2 ring-white/30' />
                  <ChevronDown className={cn('w-5 h-5 mt-1 transition-transform text-white/80', showAccounts && 'rotate-180')} />
                </div>
                <div className='mt-3 text-sm font-medium truncate'>{currentBot?.name || '未连接 Bot'}</div>
                <div className='text-xs text-white/70 truncate'>{currentBot?.selfId}</div>
              </div>

              {/* 账号切换列表（在头部下方展开） */}
              <AnimatePresence>
                {showAccounts && bots.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className='overflow-hidden bg-tg-bg text-tg-text'
                  >
                    {bots.map((b) => {
                      const isCurrent = b.selfId === currentBot?.selfId
                      const unread = !isCurrent ? (botUnread[b.selfId] || 0) : 0
                      return (
                        <button
                          key={b.selfId}
                          onClick={() => {
                            if (!isCurrent) selectBot(b.selfId)
                            onClose()
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
            </div>

            {/* 菜单项 */}
            <div className='py-1.5'>
              {menuItem(<UserRound className='w-5 h-5' />, '我的资料', () => setView('profile'))}
              {menuItem(<Users className='w-5 h-5' />, '联系人', () => setView('contacts'))}
              {menuItem(<Settings className='w-5 h-5' />, '设置', () => setView('settings'))}
            </div>

            <div className='border-t border-tg-border my-1' />

            {/* 主题 */}
            <div className='py-1.5'>
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className='w-full flex items-center gap-4 px-4 py-2.5 hover:bg-tg-hover transition-colors text-sm'
                >
                  <Icon className='w-5 h-5 text-tg-text-secondary' />
                  <span className='flex-1 text-left'>{label}</span>
                  {theme === value && <Check className='w-4 h-4 text-tg-blue' />}
                </button>
              ))}
            </div>
          </>
        )}

        {view === 'profile' && currentBot && (
          <>
            {subViewHeader('我的资料')}
            <div className='flex-1 overflow-y-auto'>
              <div className='flex flex-col items-center pt-8 pb-6 px-4'>
                <Avatar url={currentBot.avatar} name={currentBot.name} className='w-28 h-28 text-4xl shadow-sm mb-4' />
                <h4 className='text-lg font-semibold text-center truncate max-w-full'>{currentBot.name}</h4>
              </div>
              <div className='border-t border-tg-border'>
                <div className='flex items-center gap-4 px-4 py-3'>
                  <IdCard className='w-5 h-5 text-tg-text-secondary shrink-0' />
                  <div className='min-w-0'>
                    <div className='text-sm truncate'>{currentBot.selfId}</div>
                    <div className='text-xs text-tg-text-secondary'>ID</div>
                  </div>
                </div>
                <div className='flex items-center gap-4 px-4 py-3'>
                  <AtSign className='w-5 h-5 text-tg-text-secondary shrink-0' />
                  <div className='min-w-0'>
                    <div className='text-sm truncate'>{currentBot.name}</div>
                    <div className='text-xs text-tg-text-secondary'>昵称</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {view === 'contacts' && (
          <>
            {subViewHeader('联系人')}
            <div className='flex-1 overflow-y-auto py-1.5'>
              {contacts.length === 0 && (
                <div className='px-4 py-8 text-center text-sm text-tg-text-secondary'>暂无联系人</div>
              )}
              {(['friend', 'group'] as const).map((scene) => {
                const list = contacts.filter(c => c.scene === scene)
                if (list.length === 0) return null
                const isCollapsed = !!collapsed[scene]
                return (
                  <div key={scene}>
                    <button
                      onClick={() => toggleSection(scene)}
                      className='w-full flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-medium text-tg-blue hover:opacity-80 transition-opacity'
                    >
                      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isCollapsed && '-rotate-90')} />
                      {scene === 'friend' ? '好友' : '群组'}
                      <span className='text-tg-text-secondary font-normal'>{list.length}</span>
                    </button>
                    {!isCollapsed && list.map((conv) => (
                      <button
                        key={conv.key}
                        onClick={() => {
                          openConversation(conv.key)
                          onClose()
                        }}
                        className='w-full flex items-center gap-3 px-4 py-2 hover:bg-tg-hover transition-colors'
                      >
                        <Avatar url={conv.avatar} name={conv.name} className='w-10 h-10 text-base shrink-0' />
                        <span className='flex-1 min-w-0 text-left'>
                          <span className='block text-sm truncate'>{conv.name}</span>
                          <span className='block text-xs text-tg-text-secondary truncate'>
                            {conv.scene === 'group' ? `群号: ${conv.peer}` : `账号: ${conv.peer}`}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {view === 'settings' && (
          <>
            {subViewHeader('设置')}
            <div className='flex-1 flex flex-col items-center justify-center text-tg-text-secondary select-none'>
              <Settings className='w-10 h-10 mb-3 opacity-30' />
              <p className='text-sm'>设置功能开发中</p>
            </div>
          </>
        )}
      </motion.div>
    </>
  )
}

export const Sidebar: React.FC = () => {
  const {
    currentBot,
    conversations,
    currentKey, openConversation
  } = useChat()

  const [showMenu, setShowMenu] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return conversations
    return conversations.filter(c => c.name.toLowerCase().includes(kw) || c.peer.toLowerCase().includes(kw))
  }, [conversations, search])

  return (
    <aside className='w-[320px] flex flex-col border-r border-tg-border bg-tg-sidebar shrink-0 relative z-30'>
      {/* 顶部：菜单 + 搜索 */}
      <div className='flex items-center gap-2 px-3 py-2.5 shrink-0'>
        <button
          onClick={() => setShowMenu(true)}
          className='p-2.5 rounded-full hover:bg-tg-hover transition-colors text-tg-text-secondary shrink-0'
          title='菜单'
        >
          <Menu className='w-5 h-5' />
        </button>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary pointer-events-none' />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='搜索'
            className='w-full h-10 pl-9 pr-3 rounded-full bg-tg-hover text-sm outline-none placeholder:text-tg-text-secondary focus:ring-2 focus:ring-tg-blue/40 transition-shadow'
          />
        </div>
      </div>

      <AnimatePresence>
        {showMenu && <DrawerMenu onClose={() => setShowMenu(false)} />}
      </AnimatePresence>

      {/* 会话列表 */}
      <div className='flex-1 overflow-y-auto px-2 pb-2'>
        {filtered.length === 0 && (
          <div className='flex flex-col items-center justify-center h-40 text-tg-text-secondary select-none'>
            <Bot className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-sm'>{currentBot ? (search ? '无匹配会话' : '暂无联系人') : '未连接 Bot'}</p>
          </div>
        )}
        {filtered.map((conv: Conversation) => {
          const isActive = currentKey === conv.key
          return (
            <div
              key={conv.key}
              onClick={() => openConversation(conv.key)}
              className={cn(
                'px-2.5 py-2 rounded-xl flex items-center gap-3 cursor-pointer transition-colors',
                isActive ? 'bg-tg-active text-white' : 'hover:bg-tg-hover'
              )}
            >
              <Avatar url={conv.avatar} name={conv.name} className='w-12 h-12 text-lg shrink-0' />
              <div className='min-w-0 flex-1'>
                <div className='flex justify-between items-baseline gap-2'>
                  <span className={cn('text-sm font-medium truncate', isActive ? 'text-white' : 'text-tg-text')}>
                    {conv.name}
                  </span>
                  <span className={cn('text-xs shrink-0', isActive ? 'text-white/70' : 'text-tg-text-secondary')}>
                    {formatListTime(conv.lastMsg?.time)}
                  </span>
                </div>
                <div className='flex items-center gap-2 mt-0.5'>
                  <p className={cn('text-[13px] truncate flex-1', isActive ? 'text-white/80' : 'text-tg-text-secondary')}>
                    {conv.lastMsg?.recalled && <span className='opacity-70'>[已撤回] </span>}
                    {getMessageSummary(conv.lastMsg?.elements)}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className={cn(
                      'text-[11px] min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 font-medium shrink-0',
                      isActive ? 'bg-white text-tg-blue' : 'bg-tg-badge text-white'
                    )}
                    >
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
