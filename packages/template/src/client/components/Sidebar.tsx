import React, { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Search,
  ChevronDown,
  Users,
  Database,
  MessageSquareText,
  Plus,
  Check
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat, Conversation } from '../state/chat'
import { useUi } from '../state/ui'
import { getMessageSummary, toMillis, cn } from '../utils'
import { getSettings, saveSettings } from '../api'
import type { BotWebSettings, ProfileCacheMode } from '../../core/types'
import { Avatar } from './Avatar'

/** 会话列表时间：今天显示 HH:MM，昨天显示「昨天」，否则显示 M月d日 */
const formatListTime = (time?: number) => {
  if (!time) return ''
  const d = new Date(toMillis(time))
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 顶部机器人资料卡：头像（右下角在线状态点）+ 昵称 + 协议/账号签名，点击弹出账号切换列表 */
const ProfileCard: React.FC = () => {
  const { bots, currentBot, selectBot, botUnread } = useChat()
  const [open, setOpen] = useState(false)

  return (
    <div className='relative shrink-0'>
      <button
        onClick={() => setOpen(v => !v)}
        className='w-full flex items-center gap-2.5 px-3 pt-3 pb-2 hover:bg-qq-hover transition-colors text-left'
        title='切换账号'
      >
        <span className='relative shrink-0'>
          <Avatar url={currentBot?.avatar} name={currentBot?.name || '?'} className='w-10 h-10 text-sm' />
          {/* 在线状态点（绿色为固定语义色，两主题通用） */}
          <span className='absolute -bottom-px -right-px w-3 h-3 rounded-full bg-green-500 ring-2 ring-qq-sidebar' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block text-[14px] font-semibold truncate'>{currentBot?.name || '未连接 Bot'}</span>
          <span className='block text-xs text-qq-text-secondary truncate'>
            {currentBot ? `${currentBot.protocol} · ${currentBot.selfId}` : '暂无在线 Bot'}
          </span>
        </span>
      </button>

      {/* 遮罩：点击空白处关闭弹层 */}
      {open && <div className='fixed inset-0 z-40' onClick={() => setOpen(false)} />}

      {/* 账号切换弹层 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className='absolute left-2 right-2 top-full mt-1 z-50 glass rounded-xl shadow-2xl py-1 overflow-hidden'
          >
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
                    setOpen(false)
                  }}
                  className='w-[calc(100%-0.5rem)] mx-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-qq-hover transition-colors'
                >
                  <Avatar url={b.avatar} name={b.name} className='w-8 h-8 text-sm' />
                  <span className='flex-1 min-w-0 text-left'>
                    <span className='block text-[13px] truncate'>{b.name}</span>
                    <span className='block text-xs text-qq-text-secondary truncate'>{b.selfId}</span>
                  </span>
                  {unread > 0 && (
                    <span className='unread-pill shrink-0'>{unread > 99 ? '99+' : unread}</span>
                  )}
                  {isCurrent && <Check className='w-4 h-4 text-qq-blue shrink-0' />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 搜索行：圆角搜索框 + 方形「+」刷新按钮（QQ NT 第二栏头部） */
const SearchRow: React.FC<{ value: string, onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className='flex items-center gap-2 px-3 pt-1.5 pb-2 shrink-0'>
    <div className='relative flex-1'>
      <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-qq-text-secondary pointer-events-none' />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder='搜索'
        className='w-full h-[30px] pl-8 pr-3 rounded-lg bg-qq-input text-[13px] outline-none placeholder:text-qq-text-secondary focus:ring-2 focus:ring-qq-blue/40 transition-shadow'
      />
    </div>
    <button
      title='刷新数据'
      onClick={() => window.location.reload()}
      className='w-[30px] h-[30px] rounded-lg bg-qq-input flex items-center justify-center text-qq-text-secondary hover:bg-qq-hover hover:text-qq-text transition-colors shrink-0'
    >
      <Plus className='w-4 h-4' />
    </button>
  </div>
)

/** 聊天视图：搜索 + 会话列表（QQ NT：选中行灰底，未读数红色胶囊） */
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
      <SearchRow value={search} onChange={setSearch} />

      {/* 会话列表 */}
      <div className='flex-1 overflow-y-auto px-2 pb-2'>
        {filtered.length === 0 && (
          <div className='flex flex-col items-center justify-center h-40 text-qq-text-secondary select-none'>
            <Bot className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-[13px]'>{currentBot ? (search ? '无匹配会话' : '暂无联系人') : '未连接 Bot'}</p>
          </div>
        )}
        {filtered.map((conv: Conversation) => {
          const isActive = currentKey === conv.key
          return (
            <div
              key={conv.key}
              onClick={() => openConversation(conv.key)}
              className={cn(
                'px-2.5 py-2 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors',
                isActive ? 'bg-qq-active' : 'hover:bg-qq-hover'
              )}
            >
              <Avatar url={conv.avatar} name={conv.name} className='w-10 h-10 text-sm shrink-0' />
              <div className='min-w-0 flex-1'>
                <div className='flex justify-between items-baseline gap-2'>
                  <span className='text-[14px] font-medium truncate text-qq-text'>
                    {conv.name}
                  </span>
                  <span className='text-[11px] shrink-0 text-qq-text-tertiary'>
                    {formatListTime(conv.lastMsg?.time)}
                  </span>
                </div>
                <div className='flex items-center gap-2 mt-[3px]'>
                  <p className='text-xs truncate flex-1 text-qq-text-secondary'>
                    {conv.lastMsg?.recalled && <span className='opacity-70'>[已撤回] </span>}
                    {getMessageSummary(conv.lastMsg?.elements)}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className='unread-pill shrink-0'>
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
  const [search, setSearch] = useState('')
  /** 联系人分组的折叠状态（默认展开） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const contacts = useMemo(() => {
    const kw = search.trim().toLowerCase()
    const list = kw
      ? conversations.filter(c => c.name.toLowerCase().includes(kw) || c.peer.toLowerCase().includes(kw))
      : conversations
    return [...list].sort((a, b) => {
      if (a.scene !== b.scene) return a.scene === 'friend' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [conversations, search])

  return (
    <>
      <SearchRow value={search} onChange={setSearch} />
      <div className='flex-1 overflow-y-auto px-2 pb-2'>
        {contacts.length === 0 && (
          <div className='flex flex-col items-center justify-center h-40 text-qq-text-secondary select-none'>
            <Users className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-[13px]'>{search ? '无匹配联系人' : '暂无联系人'}</p>
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
                className='w-full flex items-center gap-1 px-2 pt-3 pb-1.5 text-xs text-qq-text-secondary hover:opacity-80 transition-opacity'
              >
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isCollapsed && '-rotate-90')} />
                {scene === 'friend' ? '好友' : '群聊'}
                <span className='opacity-80'>（{list.length}）</span>
              </button>
              {!isCollapsed && list.map((conv) => (
                <button
                  key={conv.key}
                  onClick={() => {
                    openConversation(conv.key)
                    setNavView('chats')
                  }}
                  className='w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-qq-hover transition-colors'
                >
                  <Avatar url={conv.avatar} name={conv.name} className='w-9 h-9 text-sm shrink-0' />
                  <span className='flex-1 min-w-0 text-left'>
                    <span className='block text-[14px] truncate'>{conv.name}</span>
                    <span className='block text-xs text-qq-text-secondary truncate'>{conv.peer}</span>
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

/** 设置项开关（macOS 风滑块：蓝底白头） */
const Switch: React.FC<{ checked: boolean, disabled?: boolean, onChange: (v: boolean) => void }> = ({ checked, disabled, onChange }) => (
  <button
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'w-[38px] h-[22px] rounded-full relative transition-colors shrink-0',
      checked ? 'bg-qq-blue' : 'bg-qq-text-secondary/30',
      disabled && 'opacity-40 cursor-not-allowed'
    )}
  >
    <span className={cn('absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-[2px]')} />
  </button>
)

const PROFILE_CACHE_OPTIONS: { value: ProfileCacheMode, label: string, desc: string }[] = [
  { value: 'non-qq', label: '仅统计非 QQ 协议 Bot', desc: '默认。QQ 协议自带好友/群列表接口，无需本地统计' },
  { value: 'all', label: '统计全部 Bot', desc: '所有 Bot 的联系人/群组/群成员都在本地累积' },
  { value: 'off', label: '关闭统计', desc: '不在本地累积任何联系人/群组数据' }
]

/** 设置视图：macOS 系统设置风格的分组卡片 */
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
      <div className='h-[44px] px-4 flex items-center shrink-0'>
        <h3 className='text-[15px] font-semibold'>设置</h3>
      </div>
      {!settings
        ? <div className='flex-1 flex items-center justify-center text-[13px] text-qq-text-secondary select-none'>加载中…</div>
        : (
          <div className='flex-1 overflow-y-auto pb-4'>
            {/* 联系人/群组统计 */}
            <div className='flex items-center gap-1.5 px-5 pt-2 pb-1.5 text-xs text-qq-text-secondary'>
              <Database className='w-3.5 h-3.5' />
              联系人/群组统计
            </div>
            <div className='mx-3 rounded-xl bg-qq-input overflow-hidden divide-y divide-qq-divider'>
              {PROFILE_CACHE_OPTIONS.map(opt => {
                const active = settings.profileCacheMode === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => update({ profileCacheMode: opt.value })}
                    className='w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-qq-hover transition-colors text-left'
                  >
                    <span className={cn(
                      'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                      active ? 'border-qq-blue bg-qq-blue' : 'border-qq-text-secondary/50'
                    )}
                    >
                      {active && <span className='w-1.5 h-1.5 rounded-full bg-white' />}
                    </span>
                    <span className='min-w-0'>
                      <span className='block text-[13px]'>{opt.label}</span>
                      <span className='block text-xs text-qq-text-secondary'>{opt.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 消息存储 */}
            <div className='flex items-center gap-1.5 px-5 pt-4 pb-1.5 text-xs text-qq-text-secondary'>
              <MessageSquareText className='w-3.5 h-3.5' />
              消息存储
            </div>
            <div className='mx-3 rounded-xl bg-qq-input overflow-hidden divide-y divide-qq-divider'>
              <div className='flex items-center gap-3 px-3.5 py-2.5'>
                <span className='flex-1 min-w-0'>
                  <span className='block text-[13px]'>全局消息存储</span>
                  <span className='block text-xs text-qq-text-secondary'>关闭后所有 Bot 都不存储消息（即使单独开启）</span>
                </span>
                <Switch checked={settings.messageStore} onChange={v => update({ messageStore: v })} />
              </div>
              <div className={cn(!settings.messageStore && 'opacity-50 pointer-events-none')}>
                <div className='px-3.5 pt-2 pb-1 text-xs text-qq-text-secondary'>
                  单独开启的 Bot（全局开启时才生效，默认都不存储）
                </div>
                {bots.length === 0 && (
                  <div className='px-3.5 py-4 text-[13px] text-qq-text-secondary'>暂无在线 Bot</div>
                )}
                {bots.map(b => (
                  <div key={b.selfId} className='flex items-center gap-2.5 px-3.5 py-2'>
                    <Avatar url={b.avatar} name={b.name} className='w-7 h-7 text-xs shrink-0' />
                    <span className='flex-1 min-w-0'>
                      <span className='block text-[13px] truncate'>{b.name}</span>
                      <span className='block text-xs text-qq-text-secondary truncate'>{b.selfId}</span>
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
          </div>
          )}
    </>
  )
}

/**
 * 第二栏（QQ NT 式布局，280px）：
 * 顶部机器人资料卡（点击切换账号），其下随导航栏 navView 切换
 * 聊天（搜索 + 会话列表）/ 联系人 / 设置
 */
export const Sidebar: React.FC = () => {
  const { navView } = useUi()

  return (
    <aside className='w-[280px] flex flex-col border-r border-qq-border bg-qq-sidebar shrink-0 relative z-30'>
      <ProfileCard />
      {navView === 'chats' && <ChatList />}
      {navView === 'contacts' && <ContactList />}
      {navView === 'settings' && <SettingsView />}
    </aside>
  )
}
