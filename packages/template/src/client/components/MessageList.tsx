import React, { useEffect, useRef } from 'react'
import { useChat } from '../ChatContext'
import { toMillis } from '../utils'
import { MessageItem } from './MessageItem'

export const MessageList: React.FC = () => {
  const { messages, currentBot } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div ref={scrollRef} className='flex-1 overflow-y-auto p-6 flex flex-col gap-8 scroll-smooth'>
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
  )
}
