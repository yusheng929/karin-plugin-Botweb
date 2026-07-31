import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { toMillis, cn } from '../utils'
import { Button, Spinner } from '@heroui/react'
import { MessageItem } from './MessageItem'
import { Avatar } from './Avatar'
import { MessageViewContextType, MessageViewProvider } from './messageView'
import { BotInfo, ChatMessage, ChatScene, GroupMemberItem } from '../../core/types'

/** 距底部多少像素内视为「贴底」，贴底时内容增高会自动跟随 */
const STICK_THRESHOLD = 80

/** 同发送者连续消息归为一组的时间窗口 */
const GROUP_WINDOW = 300_000

/** 相邻消息间隔超过该值时插入居中时间胶囊（QQ NT 风格） */
const TIME_DIVIDER_GAP = 300_000

/** 窗口化渲染：首屏与每次向上翻页渲染的消息条数（避免长记录一次性渲染几千条卡死页面） */
const PAGE_SIZE = 100

/** 滚动到距顶部多少像素内自动加载更早消息 */
const LOAD_MORE_THRESHOLD = 120

const isSameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

/** 头像地址：自己用当前 bot 头像；私聊对方用会话头像；群成员走后端 getAvatarUrl 缓存 */
const groupAvatarUrl = (
  isMe: boolean, scene: ChatScene | undefined, senderId: string,
  currentBot: BotInfo | null, conversationAvatar: string | undefined,
  getAvatar: (userId: string) => string | undefined
) => isMe
  ? (currentBot?.avatar || getAvatar(senderId))
  : (scene === 'group' ? getAvatar(senderId) : (conversationAvatar || getAvatar(senderId)))

/**
 * 同一发送者的连续消息组（TG 式吸附头像）：
 * 头像 mt-auto 自然位于组尾（最后一条消息处）；上翻历史、长组延伸到可视区下方时
 * sticky bottom 把头像钉在可视区底部（输入框上方），直到组尾滚入视野回到自然位；
 * 继续上翻时上一组（更早）头像下移接替（堆叠 sticky 的推挤效果）。
 * top 约束处理对称情况（往回滚向新消息时头像从顶部自然离场）
 */
const MessageGroup: React.FC<{
  msgs: ChatMessage[]
  isMe: boolean
  scene?: ChatScene
  currentBot: BotInfo | null
  conversationAvatar?: string
  getAvatar: (userId: string) => string | undefined
  flashMessageId: string | null
  onAvatarMenu: (e: React.MouseEvent, msg: ChatMessage) => void
}> = ({ msgs, isMe, scene, currentBot, conversationAvatar, getAvatar, flashMessageId, onAvatarMenu }) => {
  const last = msgs[msgs.length - 1]
  return (
    <div className={cn('flex gap-2.5 -mx-2 px-2', isMe ? 'flex-row-reverse' : 'flex-row')}>
      {/* 吸附头像列（整列撑满组高）：头像 mt-auto 自然在组尾，长组超出可视区下方时
          sticky bottom 钉在底部（输入框上方），被上一组头像推挤替换 */}
      <div className='w-9 shrink-0 flex flex-col'>
        <span
          onContextMenu={isMe ? undefined : (e) => onAvatarMenu(e, last)}
          className={cn('sticky top-2 bottom-2 mt-auto z-10 block select-none', !isMe && 'cursor-pointer')}
        >
          <Avatar
            url={groupAvatarUrl(isMe, scene, last.senderId, currentBot, conversationAvatar, getAvatar)}
            name={isMe ? (currentBot?.name || '?') : last.senderName}
            className='w-9 h-9 text-sm'
          />
        </span>
      </div>
      <div className='flex-1 min-w-0 flex flex-col'>
        {msgs.map((m, i) => (
          <MessageItem
            key={m.messageId || i}
            message={m}
            isMe={isMe}
            groupStart={i === 0}
            groupEnd={i === msgs.length - 1}
            flashing={flashMessageId === m.messageId}
          />
        ))}
      </div>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 居中时间戳文本（QQ NT：今天只显示时刻，昨天/更早带日期前缀） */
const formatTimeDivider = (time: number) => {
  const d = new Date(toMillis(time))
  const now = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return hm
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

export const MessageList: React.FC = () => {
  const {
    messages, currentBot, currentKey, currentConversation, groupMembers,
    resolveAvatar, resendMessage, reactMessage, hasReacted, getMessageById,
    historyHasMore, loadEarlierMessages
  } = useChat()
  const { flashMessageId, flashMessage, setToast, setConfirmDialog, setContextMenu, setPendingInlineCmd } = useUi()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** 是否贴底（跟随滚动）：切换会话置 true，用户上翻后置 false */
  const stickRef = useRef(true)
  /** 窗口化渲染：当前渲染尾部多少条消息（上翻分页增大） */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  /** 向上翻页的滚动锚点（加载更早消息后保持视口不跳动）；非空时也作为「正在翻页」的防抖标记 */
  const anchorRef = useRef<{ height: number, top: number } | null>(null)
  /** 正在从后端拉取更早历史页（按钮 loading 态） */
  const [loadingMore, setLoadingMore] = useState(false)
  /** 离开底部期间到达的新消息数（QQ 式「↓ N」浮标，贴底/点浮标时清零） */
  const [pendingNew, setPendingNew] = useState(0)
  /** 上一条尾部消息的 messageId：只有尾部变化（实时新消息）才累计浮标，历史页向前合并不影响 */
  const lastMsgIdRef = useRef<string | null>(null)

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  /** 加载更早消息：内存窗口还有余量先扩窗；窗口已拉满且后端还有更早则拉取下一页历史再扩窗 */
  const loadEarlier = async () => {
    const el = scrollRef.current
    if (!el || anchorRef.current) return
    anchorRef.current = { height: el.scrollHeight, top: el.scrollTop }
    if (visibleCount < messages.length) {
      setVisibleCount(c => c + PAGE_SIZE)
      return
    }
    if (!historyHasMore) {
      anchorRef.current = null
      return
    }
    setLoadingMore(true)
    try {
      await loadEarlierMessages()
      setVisibleCount(c => c + PAGE_SIZE)
    } catch (err) {
      anchorRef.current = null
      setToast({ message: `拉取历史消息失败: ${(err as Error).message}`, type: 'error' })
    } finally {
      setLoadingMore(false)
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
    // 回到贴底状态：浮标计数清零
    if (stickRef.current && pendingNew > 0) setPendingNew(0)
    if (el.scrollTop < LOAD_MORE_THRESHOLD && (messages.length > visibleCount || historyHasMore)) {
      void loadEarlier()
    }
  }

  // 切换会话：回到首屏窗口并立即跳到底部（图片尚未加载、scrollHeight 不准也没关系，下面的 ResizeObserver 会兜底）
  useLayoutEffect(() => {
    anchorRef.current = null
    setVisibleCount(PAGE_SIZE)
    setPendingNew(0)
    stickRef.current = true
    scrollToBottom()
  }, [currentKey])

  // 向上翻页后恢复滚动锚点（内容在上方增高，视口保持原位置）
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = scrollRef.current
    if (!anchor || !el) return
    anchorRef.current = null
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top
  }, [visibleCount])

  // 新消息到达：贴底状态下跟随；离开底部时累计「↓ N」浮标（自己发送的消息例外——QQ 语义，发送即回底部；
  // 系统灰条不算「自己发送」：上翻翻历史时戳一戳/撤回提示不应把视口拽回底部）
  useEffect(() => {
    const last = messages[messages.length - 1]
    const lastId = last?.messageId ?? null
    const isOwnLast = !!last && !last.system && !!currentBot && last.senderId === currentBot.selfId
    if (stickRef.current || isOwnLast) {
      stickRef.current = true
      scrollToBottom()
    } else if (lastId && lastMsgIdRef.current && lastId !== lastMsgIdRef.current) {
      const prevIdx = messages.findIndex(m => m.messageId === lastMsgIdRef.current)
      setPendingNew(c => c + (prevIdx === -1 ? 1 : messages.length - prevIdx - 1))
    }
    lastMsgIdRef.current = lastId
  }, [messages])

  // 图片等异步内容加载导致列表增高时，贴底状态下继续跟随（解决切换会话后图片把视图顶离底部的问题）
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  /** 群成员查找表：名片/角色徽章按 senderId O(1) 取（替代每条消息 groupMembers.find 的 O(n) 扫描） */
  const memberMap = useMemo(() => {
    const map = new Map<string, GroupMemberItem>()
    for (const m of groupMembers) map.set(String(m.userId), m)
    return map
  }, [groupMembers])

  const scene = currentKey?.split(':')[0] as ChatScene | undefined
  const peer = currentKey?.split(':')[1]
  const conversationAvatar = currentConversation?.avatar

  /**
   * 消息项供数 context：依赖全是稳定回调/原始值（conversationAvatar 是字符串、scene/peer 拆自 currentKey），
   * 新消息到达不会改变 value identity，memo 化的 MessageItem 因此跳过无关重渲染
   */
  const viewContext = useMemo<MessageViewContextType>(() => ({
    currentBot,
    conversationAvatar,
    getMember: (userId) => memberMap.get(String(userId)),
    getAvatar: resolveAvatar,
    getMessage: (messageId) => (currentBot && scene && peer)
      ? getMessageById(currentBot.selfId, scene, peer, messageId)
      : undefined,
    resendMessage,
    reactMessage,
    hasReacted,
    setToast,
    setConfirmDialog,
    setContextMenu,
    setPendingInlineCmd,
    flashMessage
  }), [
    currentBot, conversationAvatar, memberMap, resolveAvatar, scene, peer, getMessageById,
    resendMessage, reactMessage, hasReacted,
    setToast, setConfirmDialog, setContextMenu, setPendingInlineCmd, flashMessage
  ])

  /** 窗口化：只渲染尾部 visibleCount 条；分组/时间胶囊计算仍基于全量数组（首条可见消息需要与窗外前一条比较） */
  const startIndex = Math.max(0, messages.length - visibleCount)
  const visibleMessages = startIndex > 0 ? messages.slice(startIndex) : messages

  /** 相邻两条是否属于同一连续消息组（同发送者、时间接近、均非系统消息、未跨天） */
  const sameGroup = (a?: (typeof messages)[number], b?: (typeof messages)[number]) => {
    if (!a || !b) return false
    if (a.system || b.system) return false
    if (a.senderId !== b.senderId) return false
    const ta = toMillis(a.time)
    const tb = toMillis(b.time)
    return Math.abs(tb - ta) <= GROUP_WINDOW && isSameDay(ta, tb)
  }

  /** 头像右键菜单（群聊成员操作），msg 取组内最后一条（头像视觉归属） */
  const openAvatarMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'avatar', msg })
  }

  /**
   * 渲染单元：时间胶囊 / 系统消息 / 发送者消息组。
   * 分组规则与原 groupStart/groupEnd 判定一致：时间胶囊强制开新组，系统消息独立成元
   */
  type RenderUnit =
    | { kind: 'time', key: string, time: number }
    | { kind: 'system', key: string, msg: ChatMessage }
    | { kind: 'group', key: string, msgs: ChatMessage[] }

  const units: RenderUnit[] = []
  visibleMessages.forEach((m, index) => {
    const absIndex = startIndex + index
    const prevMsg = messages[absIndex - 1]
    // QQ NT：首条 / 跨天 / 间隔超 5 分钟时插入居中时间胶囊
    const showTime = !prevMsg ||
      !isSameDay(toMillis(prevMsg.time), toMillis(m.time)) ||
      toMillis(m.time) - toMillis(prevMsg.time) >= TIME_DIVIDER_GAP
    const key = m.messageId || `i${absIndex}`
    if (showTime) units.push({ kind: 'time', key: `t-${key}`, time: m.time })
    if (m.system) {
      units.push({ kind: 'system', key, msg: m })
      return
    }
    const lastUnit = units[units.length - 1]
    if (!showTime && lastUnit?.kind === 'group' && sameGroup(lastUnit.msgs[lastUnit.msgs.length - 1], m)) {
      lastUnit.msgs.push(m)
    } else {
      units.push({ kind: 'group', key, msgs: [m] })
    }
  })

  return (
    <MessageViewProvider value={viewContext}>
      <div className='flex-1 min-h-0 relative flex flex-col'>
        <div ref={scrollRef} onScroll={handleScroll} className='flex-1 overflow-y-auto px-5 py-4'>
          <div ref={contentRef} className='flex flex-col'>
            {(startIndex > 0 || historyHasMore) && (
              <div className='flex justify-center my-2 select-none'>
                <Button
                  variant='secondary'
                  size='sm'
                  isPending={loadingMore}
                  onPress={() => void loadEarlier()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color='current' size='sm' />}
                      {isPending ? '加载中…' : '加载更早的消息'}
                    </>
                  )}
                </Button>
              </div>
            )}
            {units.map((unit) => {
              if (unit.kind === 'time') {
                return (
                  <div key={unit.key} className='flex justify-center my-3 select-none'>
                    <span className='time-pill'>
                      {formatTimeDivider(unit.time)}
                    </span>
                  </div>
                )
              }
              if (unit.kind === 'system') {
                return (
                  <MessageItem
                    key={unit.key}
                    message={unit.msg}
                    isMe={false}
                    groupStart
                    groupEnd
                    flashing={false}
                  />
                )
              }
              const first = unit.msgs[0]
              const isMe = !!currentBot && first.senderId === currentBot.selfId
              return (
                <MessageGroup
                  key={unit.key}
                  msgs={unit.msgs}
                  isMe={isMe}
                  scene={scene}
                  currentBot={currentBot}
                  conversationAvatar={conversationAvatar}
                  getAvatar={resolveAvatar}
                  flashMessageId={flashMessageId}
                  onAvatarMenu={openAvatarMenu}
                />
              )
            })}
          </div>
        </div>

        {/* 「↓ N」新消息浮标（QQ 式：离开底部期间收到新消息不自动跟随，点击回底部并清零） */}
        {pendingNew > 0 && (
          <button
            onClick={() => {
              stickRef.current = true
              setPendingNew(0)
              scrollToBottom()
            }}
            className='absolute bottom-3 right-4 z-20 flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full bg-qq-bubble-them text-qq-blue text-xs shadow-md hover:shadow-lg transition-shadow select-none'
            title='回到底部查看新消息'
          >
            <ChevronDown className='w-3.5 h-3.5' />
            {pendingNew > 99 ? '99+' : pendingNew}
          </button>
        )}
      </div>
    </MessageViewProvider>
  )
}
