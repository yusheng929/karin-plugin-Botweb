import React, { useState } from 'react'
import { Bot, Upload, Users, MessageCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { cn } from '../utils'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { GroupPanel } from './GroupPanel'

export const ChatWindow: React.FC = () => {
  const { currentConversation, currentBot, groupMembers, handleFiles } = useChat()
  const { groupPanelOpen, setGroupPanelOpen, setPendingImages } = useUi()
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      // 图片内联进输入框（与文本混排，由 InputArea 消费），其他文件直接发送
      const images = files.filter(f => f.type.startsWith('image/'))
      const others = files.filter(f => !f.type.startsWith('image/'))
      if (images.length > 0) setPendingImages(images)
      if (others.length > 0) void handleFiles(others)
    }
  }

  if (!currentBot) {
    return (
      <div className='flex-1 flex flex-col items-center justify-center p-8 text-center bg-qq-chat-bg'>
        <div className='w-20 h-20 rounded-full bg-qq-blue/10 flex items-center justify-center mb-6'>
          <Bot className='w-10 h-10 text-qq-blue' />
        </div>
        <p className='max-w-xs text-[13px] text-qq-text-secondary leading-relaxed'>
          未检测到已连接的 Bot。请先在 Karin 中登录 Bot 账号。
        </p>
      </div>
    )
  }

  if (!currentConversation) {
    return (
      <div className='flex-1 flex flex-col items-center justify-center bg-qq-chat-bg select-none'>
        <MessageCircle className='w-14 h-14 text-qq-text-secondary/25 mb-4' strokeWidth={1.2} />
        <span className='text-[13px] text-qq-text-secondary'>选择一个会话开始聊天</span>
      </div>
    )
  }

  const isGroup = currentConversation.scene === 'group'

  return (
    <main
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      className='flex-1 flex flex-col relative overflow-hidden bg-qq-chat-bg'
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 z-[100] bg-qq-blue/15 border-2 border-dashed border-qq-blue m-4 rounded-2xl flex flex-col items-center justify-center pointer-events-none'
          >
            <div className='bg-qq-blue text-white p-4 rounded-full shadow-xl mb-3'>
              <Upload className='w-7 h-7' />
            </div>
            <p className='text-qq-blue font-medium'>松开鼠标添加（图片进输入框，文件直接发送）</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶栏：会话名 + 群人数，右侧成员面板开关（仅群聊显示） */}
      <header className='h-[56px] px-5 flex items-center justify-between bg-qq-chat-bg border-b border-qq-border shrink-0 z-20'>
        <div className='flex items-baseline gap-2 min-w-0'>
          <h2 className='text-[16px] font-semibold truncate leading-tight'>
            {currentConversation.name}
          </h2>
          {isGroup && (
            <span className='text-xs text-qq-text-secondary leading-tight shrink-0'>
              ({groupMembers.length})
            </span>
          )}
        </div>
        {isGroup && (
          <button
            onClick={() => setGroupPanelOpen(!groupPanelOpen)}
            className={cn(
              'p-1.5 rounded-lg transition-colors shrink-0',
              groupPanelOpen ? 'text-qq-blue' : 'text-qq-text-secondary hover:bg-qq-hover'
            )}
            title='群资料面板'
          >
            <Users className='w-5 h-5' />
          </button>
        )}
      </header>

      {/* 主体：左列消息列表 + 输入框，右侧 docked 群资料面板 */}
      <div className='flex-1 min-h-0 flex'>
        <div className='flex-1 min-w-0 flex flex-col relative'>
          <div className='flex-1 overflow-hidden relative flex flex-col'>
            <MessageList />
          </div>

          <div className='relative z-10'>
            <InputArea />
          </div>
        </div>

        {isGroup && groupPanelOpen && <GroupPanel />}
      </div>
    </main>
  )
}
