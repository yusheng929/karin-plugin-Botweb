import React, { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Search,
  ChevronDown,
  Users,
  Database,
  MessageSquareText
} from 'lucide-react'
import { useChat, Conversation } from '../state/chat'
import { useUi } from '../state/ui'
import { getMessageSummary, toMillis, cn } from '../utils'
import { getSettings, saveSettings } from '../api'
import type { BotWebSettings, ProfileCacheMode } from '../../core/types'
import { Avatar } from './Avatar'

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

/** 聊天视图：搜索 + 会话列表 */
const ChatList: React.FC = () => {
  const {
    currentBot,
    conversations,
    currentKey, openConversation
  } = useChat()

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return conversations
    return conversations.filter(c => c.name.toLowerCase().includes(kw) || c.peer.toLowerCase().includes(kw))
  }, [conversations, search])

  return (
    <>
      {/* 顶部搜索 */}
      <div className='flex items-center px-3 py-2.5 shrink-0'>
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
    </>
  )
}

/** 联系人视图：好友在前、群在后，分组可折叠 */
const ContactList: React.FC = () => {
  const { conversations, openConversation } = useChat()
  const { setNavView } = useUi()
  /** 联系人分组的折叠状态（默认展开） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const contacts = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.scene !== b.scene) return a.scene === 'friend' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [conversations])

  return (
    <>
      <div className='h-14 px-4 flex items-center border-b border-tg-border shrink-0'>
        <h3 className='text-sm font-semibold'>联系人</h3>
      </div>
      <div className='flex-1 overflow-y-auto py-1.5'>
        {contacts.length === 0 && (
          <div className='flex flex-col items-center justify-center h-40 text-tg-text-secondary select-none'>
            <Users className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-sm'>暂无联系人</p>
          </div>
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
                    setNavView('chats')
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
  )
}

/** 设置项开关（TG 风格小滑块） */
const Switch: React.FC<{ checked: boolean, disabled?: boolean, onChange: (v: boolean) => void }> = ({ checked, disabled, onChange }) => (
  <button
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'w-9 h-5 rounded-full relative transition-colors shrink-0',
      checked ? 'bg-tg-blue' : 'bg-tg-text-secondary/30',
      disabled && 'opacity-40 cursor-not-allowed'
    )}
  >
    <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
  </button>
)

const PROFILE_CACHE_OPTIONS: { value: ProfileCacheMode, label: string, desc: string }[] = [
  { value: 'non-qq', label: '仅统计非 QQ 协议 Bot', desc: '默认。QQ 协议自带好友/群列表接口，无需本地统计' },
  { value: 'all', label: '统计全部 Bot', desc: '所有 Bot 的联系人/群组/群成员都在本地累积' },
  { value: 'off', label: '关闭统计', desc: '不在本地累积任何联系人/群组数据' }
]

/** 设置视图：联系人/群组统计模式 + 消息存储（全局开关 + 按 Bot 单独开关） */
const SettingsView: React.FC = () => {
  const { bots } = useChat()
  const { setToast } = useUi()
  const [settings, setSettings] = useState<BotWebSettings | null>(null)

  useEffect(() => {
    getSettings().then(setSettings).catch(err => setToast({ message: err.message || '获取设置失败', type: 'error' }))
  }, [setToast])

  /** 乐观更新 + 落盘，失败回滚 */
  const update = (patch: Partial<BotWebSettings>) => {
    if (!settings) return
    const prev = settings
    setSettings({ ...prev, ...patch })
    saveSettings(patch).then(setSettings).catch(err => {
      setSettings(prev)
      setToast({ message: err.message || '保存设置失败', type: 'error' })
    })
  }

  const toggleStoreBot = (selfId: string, on: boolean) => {
    if (!settings) return
    update({
      messageStoreBots: on
        ? [...settings.messageStoreBots, selfId]
        : settings.messageStoreBots.filter(id => id !== selfId)
    })
  }

  return (
    <>
      <div className='h-14 px-4 flex items-center border-b border-tg-border shrink-0'>
        <h3 className='text-sm font-semibold'>设置</h3>
      </div>
      {!settings
        ? <div className='flex-1 flex items-center justify-center text-sm text-tg-text-secondary select-none'>加载中…</div>
        : (
          <div className='flex-1 overflow-y-auto py-2'>
            {/* 联系人/群组统计 */}
            <div className='flex items-center gap-2 px-4 pt-2 pb-1 text-xs font-medium text-tg-text-secondary'>
              <Database className='w-3.5 h-3.5' />
              联系人/群组统计
            </div>
            {PROFILE_CACHE_OPTIONS.map(opt => {
              const active = settings.profileCacheMode === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => update({ profileCacheMode: opt.value })}
                  className='w-full flex items-center gap-3 px-4 py-2.5 hover:bg-tg-hover transition-colors text-left'
                >
                  <span className={cn(
                    'w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                    active ? 'border-tg-blue' : 'border-tg-text-secondary/50'
                  )}
                  >
                    {active && <span className='w-2.5 h-2.5 rounded-full bg-tg-blue' />}
                  </span>
                  <span className='min-w-0'>
                    <span className='block text-sm'>{opt.label}</span>
                    <span className='block text-xs text-tg-text-secondary'>{opt.desc}</span>
                  </span>
                </button>
              )
            })}

            <div className='border-t border-tg-border my-2' />

            {/* 消息存储 */}
            <div className='flex items-center gap-2 px-4 pt-1 pb-1 text-xs font-medium text-tg-text-secondary'>
              <MessageSquareText className='w-3.5 h-3.5' />
              消息存储
            </div>
            <div className='flex items-center gap-3 px-4 py-2.5'>
              <span className='flex-1 min-w-0'>
                <span className='block text-sm'>全局消息存储</span>
                <span className='block text-xs text-tg-text-secondary'>关闭后所有 Bot 都不存储消息（即使单独开启）</span>
              </span>
              <Switch checked={settings.messageStore} onChange={v => update({ messageStore: v })} />
            </div>
            <div className={cn(!settings.messageStore && 'opacity-50 pointer-events-none')}>
              <div className='px-4 pt-1 pb-1 text-xs text-tg-text-secondary'>
                单独开启的 Bot（全局开启时才生效，默认都不存储）
              </div>
              {bots.length === 0 && (
                <div className='px-4 py-4 text-sm text-tg-text-secondary'>暂无在线 Bot</div>
              )}
              {bots.map(b => (
                <div key={b.selfId} className='flex items-center gap-3 px-4 py-2'>
                  <Avatar url={b.avatar} name={b.name} className='w-8 h-8 text-xs shrink-0' />
                  <span className='flex-1 min-w-0'>
                    <span className='block text-sm truncate'>{b.name}</span>
                    <span className='block text-xs text-tg-text-secondary truncate'>{b.selfId}</span>
                  </span>
                  <Switch
                    checked={settings.messageStoreBots.includes(b.selfId)}
                    disabled={!settings.messageStore}
                    onChange={v => toggleStoreBot(b.selfId, v)}
                  />
                </div>
              ))}
            </div>
          </div>
          )}
    </>
  )
}

/**
 * 第二栏（QQ NT 式布局）：随导航栏 navView 切换
 * 聊天（搜索 + 会话列表）/ 联系人 / 设置
 */
export const Sidebar: React.FC = () => {
  const { navView } = useUi()

  return (
    <aside className='w-[320px] flex flex-col border-r border-tg-border bg-tg-sidebar shrink-0 relative z-30'>
      {navView === 'chats' && <ChatList />}
      {navView === 'contacts' && <ContactList />}
      {navView === 'settings' && <SettingsView />}
    </aside>
  )
}
