import React, { useState } from 'react'
import {
  MessageSquare,
  Bot,
  Sun,
  Moon,
  Monitor
} from 'lucide-react'
import { useChat, Conversation } from '../ChatContext'
import { getMessageSummary, toMillis } from '../utils'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

/** 头像：有 url 用图片，否则用名称首字符圆形占位 */
const Avatar: React.FC<{ url?: string, name: string, className?: string }> = ({ url, name, className }) => {
  if (url) {
    return <img src={url} alt={name} className={cn('object-cover', className)} />
  }
  return (
    <div className={cn('bg-mac-blue/10 text-mac-blue flex items-center justify-center font-bold select-none', className)}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const NavItem: React.FC<{ active: boolean, onClick: () => void, children: React.ReactNode }> = ({ active, onClick, children }) => (
  <div
    onClick={onClick}
    className={cn(
      'w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200',
      active ? 'bg-mac-blue text-white shadow-[0_4px_12px_rgba(0,122,255,0.3)] scale-105' : 'text-mac-text-secondary hover:bg-black/5 hover:text-mac-text-main'
    )}
  >
    {children}
  </div>
)

export const Sidebar: React.FC = () => {
  const {
    bots, currentBot, selectBot,
    conversations,
    currentKey, openConversation,
    botUnread,
    theme, setTheme,
    actualTheme
  } = useChat()

  const [showBotList, setShowBotList] = useState(false)
  const isDark = actualTheme === 'dark'

  return (
    <>
      {/* Left Nav Rail */}
      <nav className={cn('w-[68px] flex flex-col items-center py-6 border-r gap-8 shrink-0 relative z-40 transition-colors duration-300',
        isDark ? 'bg-gray-900 border-white/10' : 'bg-mac-sidebar border-black/5')}
      >
        <div className='flex gap-2 mb-2'>
          <div className='w-3 h-3 rounded-full bg-[#ff5f57] shadow-inner' />
          <div className='w-3 h-3 rounded-full bg-[#febc2e] shadow-inner' />
          <div className='w-3 h-3 rounded-full bg-[#28c840] shadow-inner' />
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation()
            if (bots.length > 1) setShowBotList(!showBotList)
          }}
          title={currentBot ? `${currentBot.name} (${currentBot.selfId})` : '未连接 Bot'}
          className={cn(
            'w-11 h-11 rounded-2xl border flex items-center justify-center text-xl mb-2 shadow-lg transition-all duration-300 overflow-hidden shrink-0 group',
            bots.length > 1 && 'cursor-pointer hover:ring-2 hover:ring-mac-blue/50 hover:ring-offset-2',
            isDark ? 'border-white/10 bg-gray-800' : 'border-white bg-white',
            showBotList ? 'ring-2 ring-mac-blue ring-offset-2' : ''
          )}
        >
          {currentBot?.avatar
            ? (
              <img
                src={currentBot.avatar}
                alt={currentBot.name}
                className='w-full h-full object-cover transition-transform group-hover:scale-110'
              />
            )
            : (
              <Bot className='w-6 h-6 text-mac-text-secondary' />
            )}
        </div>
        <div className='flex flex-col gap-4'>
          <NavItem active onClick={() => setShowBotList(false)}>
            <MessageSquare className='w-5 h-5' />
          </NavItem>
        </div>
        <div className='mt-auto flex flex-col gap-3 mb-4'>
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-200',
              theme === 'light' ? 'bg-mac-blue text-white shadow-md' : 'text-mac-text-secondary hover:bg-black/5'
            )}
            title='白天模式'
          >
            <Sun className='w-4.5 h-4.5' />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-200',
              theme === 'dark' ? 'bg-mac-blue text-white shadow-md' : 'text-mac-text-secondary hover:bg-white/5'
            )}
            title='黑夜模式'
          >
            <Moon className='w-4.5 h-4.5' />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-200',
              theme === 'system' ? 'bg-mac-blue text-white shadow-md' : 'text-mac-text-secondary hover:bg-black/5'
            )}
            title='跟随系统'
          >
            <Monitor className='w-4.5 h-4.5' />
          </button>
        </div>
      </nav>

      {/* Bot List Sidebar（多个 bot 时可切换） */}
      {showBotList && bots.length > 1 && (
        <div
          className={cn('w-[78px] border-r flex flex-col items-center py-6 gap-5 animate-in slide-in-from-left-4 duration-300 shrink-0 z-30 backdrop-blur-3xl shadow-2xl',
            isDark ? 'bg-gray-800/80 border-white/10' : 'bg-white/70 border-black/5')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className='px-2 text-[10px] font-black uppercase tracking-widest text-mac-text-secondary opacity-40 mb-1'>Bot</div>
          <div className='flex flex-col gap-4 w-full items-center overflow-y-auto no-scrollbar pb-6'>
            {bots.map((b) => {
              const unread = b.selfId !== currentBot?.selfId ? (botUnread[b.selfId] || 0) : 0
              return (
                <div
                  key={b.selfId}
                  className='relative group cursor-pointer'
                  title={`${b.name} (${b.selfId})`}
                  onClick={() => {
                    selectBot(b.selfId)
                    setShowBotList(false)
                  }}
                >
                  <div className={cn(
                    'w-13 h-13 rounded-2xl overflow-hidden border-2 transition-all duration-300 shadow-md',
                    currentBot?.selfId === b.selfId
                      ? 'border-mac-blue scale-110 shadow-mac-blue/20'
                      : 'border-white/20 group-hover:border-mac-blue/50 group-hover:scale-105'
                  )}
                  >
                    {b.avatar
                      ? <img src={b.avatar} alt={b.name} className='w-full h-full object-cover' />
                      : (
                        <div className='w-full h-full bg-mac-blue/10 flex items-center justify-center'>
                          <Bot className='w-6 h-6 text-mac-blue' />
                        </div>
                      )}
                  </div>
                  {currentBot?.selfId === b.selfId && (
                    <div className='absolute -bottom-1 -right-1 w-5 h-5 bg-mac-blue rounded-full border-[3px] border-white flex items-center justify-center shadow-lg'>
                      <div className='w-1.5 h-1.5 bg-white rounded-full' />
                    </div>
                  )}
                  {unread > 0 && (
                    <div className='absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 font-black shadow-lg shadow-red-500/20 border-2 border-white animate-in zoom-in'>
                      {unread > 99 ? '99+' : unread}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sidebar List */}
      <aside className={cn('w-[280px] flex flex-col border-r shrink-0 transition-all duration-300 relative z-20',
        isDark ? 'bg-gray-800/90 border-white/10' : 'bg-[#f6f6f6]/95 border-black/5')}
      >
        <div className='p-6 pb-2'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className={cn('text-xl font-bold tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>消息</h2>
          </div>
        </div>
        <div className='flex-1 overflow-y-auto px-3 space-y-1.5 pb-6'>
          {conversations.length === 0 && (
            <div className='flex flex-col items-center justify-center h-40 opacity-30 select-none'>
              <div className='w-12 h-12 rounded-2xl border-2 border-dashed flex items-center justify-center mb-2'>
                <Bot className='w-6 h-6' />
              </div>
              <p className='text-xs font-bold'>{currentBot ? '暂无联系人' : '未连接 Bot'}</p>
            </div>
          )}
          {conversations.map((conv: Conversation) => {
            const lastTime = conv.lastMsg ? new Date(toMillis(conv.lastMsg.time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            const isActive = currentKey === conv.key

            return (
              <div
                key={conv.key}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openConversation(conv.key)
                }}
                className={cn(
                  'px-3.5 py-3 rounded-2xl flex items-center gap-3.5 cursor-pointer transition-all duration-200 group relative',
                  isActive
                    ? 'bg-mac-blue text-white shadow-[0_8px_20px_-5px_rgba(0,122,255,0.4)] z-10'
                    : isDark ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-white shadow-sm hover:shadow-md active:scale-[0.98]'
                )}
              >
                <div className='relative w-11 h-11 rounded-[14px] overflow-hidden shrink-0 shadow-sm transition-transform group-hover:scale-105'>
                  <Avatar url={conv.avatar} name={conv.name} className='w-full h-full text-lg' />
                </div>
                <div className='min-w-0 flex-1 py-0.5'>
                  <div className='flex justify-between items-center mb-1'>
                    <span className={cn(
                      'text-sm font-bold truncate tracking-tight',
                      isActive ? 'text-white' : (isDark ? 'text-gray-100' : 'text-mac-text-main')
                    )}
                    >{conv.name}
                    </span>
                    <span className={cn(
                      'text-[10px] font-medium shrink-0',
                      isActive ? 'text-white/70' : (isDark ? 'text-gray-500' : 'text-mac-text-secondary')
                    )}
                    >{lastTime}
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <p className={cn(
                      'text-[11px] truncate flex-1 font-medium',
                      isActive ? 'text-white/80' : (isDark ? 'text-gray-400' : 'text-mac-text-secondary')
                    )}
                    >
                      {getMessageSummary(conv.lastMsg?.elements)}
                      {conv.lastMsg?.recalled && <span className='ml-1 opacity-70'>[已撤回]</span>}
                    </p>
                    {conv.unreadCount > 0 && (
                      <div className='bg-red-500 text-white text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 font-black shadow-lg shadow-red-500/20 animate-in zoom-in'>
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
