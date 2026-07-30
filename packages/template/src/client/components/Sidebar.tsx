import React, { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Database,
  Plus,
  Check
} from 'lucide-react'
import { useChat, Conversation } from '../state/chat'
import { useUi } from '../state/ui'
import { getMessageSummary, toMillis, cn } from '../utils'
import { getSettings, saveSettings } from '../api'
import type { BotWebSettings, ProfileCacheMode } from '../../core/types'
import { Avatar } from './Avatar'
import { Button, Chip, Dropdown, EmptyState, Label, Radio, RadioGroup, SearchField } from '@heroui/react'

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

/** 顶部机器人资料卡（HeroUI Dropdown）：头像（右下角在线状态点）+ 昵称 + 协议/账号签名，点击弹出账号切换列表 */
const ProfileCard: React.FC = () => {
  const { bots, currentBot, selectBot, botUnread } = useChat()

  return (
    <Dropdown>
      <Dropdown.Trigger
        className='w-full flex items-center gap-2.5 px-3 pt-3 pb-2 hover:bg-qq-hover transition-colors text-left shrink-0'
        aria-label='切换账号'
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
      </Dropdown.Trigger>
      <Dropdown.Popover placement='bottom start' className='min-w-[240px]'>
        {bots.length === 0 && (
          <div className='px-4 py-6 text-center text-[13px] text-qq-text-secondary'>暂无在线 Bot</div>
        )}
        <Dropdown.Menu
          onAction={(key) => {
            if (key !== currentBot?.selfId) selectBot(String(key))
          }}
        >
          {bots.map((b) => {
            const isCurrent = b.selfId === currentBot?.selfId
            const unread = !isCurrent ? (botUnread[b.selfId] || 0) : 0
            return (
              <Dropdown.Item key={b.selfId} id={b.selfId} textValue={b.name}>
                <Avatar url={b.avatar} name={b.name} className='w-8 h-8 text-sm' />
                <span className='flex-1 min-w-0 text-left'>
                  <span className='block text-[13px] truncate'>{b.name}</span>
                  <span className='block text-xs text-qq-text-secondary truncate'>{b.selfId}</span>
                </span>
                {unread > 0 && (
                  <Chip className='shrink-0' color='danger' variant='primary' size='sm'>
                    {unread > 99 ? '99+' : unread}
                  </Chip>
                )}
                {isCurrent && <Check className='w-4 h-4 text-qq-blue shrink-0' />}
              </Dropdown.Item>
            )
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

/** 搜索行：HeroUI 搜索框（胶囊样式见 index.css 的 sidebar-search 适配）+ 方形「+」刷新按钮（QQ NT 第二栏头部） */
const SearchRow: React.FC<{ value: string, onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className='flex items-center gap-2 px-3 pt-1.5 pb-2 shrink-0'>
    <SearchField className='flex-1 min-w-0 sidebar-search' aria-label='搜索' value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder='搜索' />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
    <Button
      isIconOnly
      variant='ghost'
      size='sm'
      aria-label='刷新数据'
      onPress={() => window.location.reload()}
      className='w-[30px] min-w-0 h-[30px] p-0 rounded-lg bg-qq-input text-qq-text-secondary hover:bg-qq-hover hover:text-qq-text shrink-0'
    >
      <Plus className='w-4 h-4' />
    </Button>
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
      <div className='flex-1 overflow-y-auto px-3 pb-2 space-y-0.5'>
        {filtered.length === 0 && (
          <EmptyState className='h-40 flex items-center justify-center text-[13px] text-qq-text-secondary'>
            {currentBot ? (search ? '无匹配会话' : '暂无联系人') : '未连接 Bot'}
          </EmptyState>
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
                    <Chip className='shrink-0' color='danger' variant='primary' size='sm'>
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </Chip>
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
      <div className='flex-1 overflow-y-auto px-3 pb-2 space-y-0.5'>
        {contacts.length === 0 && (
          <EmptyState className='h-40 flex items-center justify-center text-[13px] text-qq-text-secondary'>
            {search ? '无匹配联系人' : '暂无联系人'}
          </EmptyState>
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

const PROFILE_CACHE_OPTIONS: { value: ProfileCacheMode, label: string, desc: string }[] = [
  { value: 'non-qq', label: '仅统计非 QQ 协议 Bot', desc: '默认。QQ 协议自带好友/群列表接口，无需本地统计' },
  { value: 'all', label: '统计全部 Bot', desc: '所有 Bot 的联系人/群组/群成员都在本地累积' },
  { value: 'off', label: '关闭统计', desc: '不在本地累积任何联系人/群组数据' }
]

/** 设置视图：macOS 系统设置风格的分组卡片 */
const SettingsView: React.FC = () => {
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
            <RadioGroup
              value={settings.profileCacheMode}
              onChange={v => update({ profileCacheMode: v as ProfileCacheMode })}
              className='mx-3 rounded-xl bg-qq-input overflow-hidden divide-y divide-qq-divider'
              aria-label='联系人/群组统计'
            >
              {PROFILE_CACHE_OPTIONS.map(opt => (
                <Radio
                  key={opt.value}
                  value={opt.value}
                  className='w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-qq-hover transition-colors text-left'
                >
                  <Radio.Content>
                    <Radio.Control className='shrink-0'>
                      <Radio.Indicator />
                    </Radio.Control>
                    <span className='min-w-0'>
                      <Label className='block text-[13px]'>{opt.label}</Label>
                      <span className='block text-xs text-qq-text-secondary'>{opt.desc}</span>
                    </span>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
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
