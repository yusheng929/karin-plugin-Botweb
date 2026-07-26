import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useChat } from '../state/chat'
import { toMillis } from '../utils'
import { MessageItem } from './MessageItem'

/** 距底部多少像素内视为「贴底」，贴底时内容增高会自动跟随 */
const STICK_THRESHOLD = 80

/** 同发送者连续消息归为一组的时间窗口 */
const GROUP_WINDOW = 300_000

/** 相邻消息间隔超过该值时插入居中时间胶囊（QQ NT 风格） */
const TIME_DIVIDER_GAP = 300_000

const isSameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

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
  const { messages, currentBot, currentKey } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** 是否贴底（跟随滚动）：切换会话置 true，用户上翻后置 false */
  const stickRef = useRef(true)

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
  }

  // 切换会话：立即跳到底部（图片尚未加载、scrollHeight 不准也没关系，下面的 ResizeObserver 会兜底）
  useLayoutEffect(() => {
    stickRef.current = true
    scrollToBottom()
  }, [currentKey])

  // 新消息到达：贴底状态下跟随
  useEffect(() => {
    if (stickRef.current) scrollToBottom()
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

  /** 相邻两条是否属于同一连续消息组（同发送者、时间接近、均非系统消息、未跨天） */
  const sameGroup = (a?: (typeof messages)[number], b?: (typeof messages)[number]) => {
    if (!a || !b) return false
    if (a.system || b.system) return false
    if (a.senderId !== b.senderId) return false
    const ta = toMillis(a.time)
    const tb = toMillis(b.time)
    return Math.abs(tb - ta) <= GROUP_WINDOW && isSameDay(ta, tb)
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className='flex-1 overflow-y-auto px-5 py-4'>
      <div ref={contentRef} className='flex flex-col'>
        {messages.map((m, index) => {
          const prevMsg = messages[index - 1]
          const nextMsg = messages[index + 1]
          // QQ NT：首条 / 跨天 / 间隔超 5 分钟时插入居中时间胶囊
          const showTime = !prevMsg ||
            !isSameDay(toMillis(prevMsg.time), toMillis(m.time)) ||
            toMillis(m.time) - toMillis(prevMsg.time) >= TIME_DIVIDER_GAP
          const isMe = !!currentBot && m.senderId === currentBot.selfId
          const groupStart = showTime || !sameGroup(prevMsg, m)
          const groupEnd = !sameGroup(m, nextMsg)

          return (
            <React.Fragment key={m.messageId || index}>
              {showTime && (
                <div className='flex justify-center my-3 select-none'>
                  <span className='time-pill'>
                    {formatTimeDivider(m.time)}
                  </span>
                </div>
              )}
              <MessageItem
                message={m}
                isMe={isMe}
                groupStart={groupStart}
                groupEnd={groupEnd}
              />
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
