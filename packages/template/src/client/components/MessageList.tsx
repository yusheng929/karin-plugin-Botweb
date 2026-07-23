import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { useChat } from '../ChatContext'
import { toMillis } from '../utils'
import { MessageItem } from './MessageItem'

/** 距底部多少像素内视为「贴底」，贴底时内容增高会自动跟随 */
const STICK_THRESHOLD = 80

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

  return (
    <div ref={scrollRef} onScroll={handleScroll} className='flex-1 overflow-y-auto p-6'>
      <div ref={contentRef} className='flex flex-col gap-8'>
        {messages.map((m, index) => {
          const isMe = !!currentBot && m.senderId === currentBot.selfId
          const prevMsg = messages[index - 1]
          const showTime = !prevMsg || (toMillis(m.time) - toMillis(prevMsg.time)) > 600_000

          return (
            <MessageItem
              key={m.messageId || index}
              message={m}
              isMe={isMe}
              showTime={showTime}
            />
          )
        })}
      </div>
    </div>
  )
}
