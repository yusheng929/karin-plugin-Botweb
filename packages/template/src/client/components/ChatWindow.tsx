import React, { useState } from 'react'
import { Bot, Upload, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { cn } from '../utils'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ChatDetailsSidebar } from './ChatDetailsSidebar'

export const ChatWindow: React.FC = () => {
  const { currentConversation, currentBot, groupMembers, handleFiles } = useChat()
  const { showSettings, setShowSettings, setPendingImages } = useUi()
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
      <div className='flex-1 flex flex-col items-center justify-center p-8 text-center bg-tg-chat-bg'>
        <div className='w-20 h-20 rounded-full bg-tg-blue/10 flex items-center justify-center mb-6'>
          <Bot className='w-10 h-10 text-tg-blue' />
        </div>
        <p className='max-w-xs text-sm text-tg-text-secondary leading-relaxed'>
          未检测到已连接的 Bot。请先在 Karin 中登录 Bot 账号。
        </p>
      </div>
    )
  }

  if (!currentConversation) {
    return (
      <div className='flex-1 flex flex-col items-center justify-center bg-tg-chat-bg select-none'>
        <span className='px-4 py-1.5 rounded-full bg-black/10 dark:bg-white/10 text-sm text-tg-text-secondary'>
          选择一个会话开始聊天
        </span>
      </div>
    )
  }

  const subtitle = currentConversation.scene === 'group'
    ? `${groupMembers.length > 0 ? `${groupMembers.length} 位成员` : '群聊'}`
    : '私聊'

  return (
    <main
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      className='flex-1 flex flex-col relative overflow-hidden bg-tg-chat-bg'
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 z-[100] bg-tg-blue/15 border-2 border-dashed border-tg-blue m-4 rounded-2xl flex flex-col items-center justify-center pointer-events-none'
          >
            <div className='bg-tg-blue text-white p-4 rounded-full shadow-xl mb-3'>
              <Upload className='w-7 h-7' />
            </div>
            <p className='text-tg-blue font-medium'>松开鼠标添加（图片进输入框，文件直接发送）</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶栏 */}
      <header className='h-14 px-4 flex items-center justify-between bg-tg-bg border-b border-tg-border shrink-0 z-20'>
        <div className='flex flex-col min-w-0'>
          <h2 className='text-sm font-semibold truncate leading-tight'>
            {currentConversation.name}
          </h2>
          <span className='text-xs text-tg-text-secondary leading-tight'>
            {subtitle}
          </span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            'p-2.5 rounded-full transition-colors shrink-0',
            showSettings ? 'bg-tg-hover text-tg-blue' : 'text-tg-text-secondary hover:bg-tg-hover'
          )}
          title='会话资料'
        >
          <Info className='w-5 h-5' />
        </button>
      </header>

      <div className='flex-1 overflow-hidden relative flex flex-col'>
        <MessageList />

        <AnimatePresence>
          {showSettings && (
            <motion.div
              key='settings-backdrop'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={() => setShowSettings(false)}
              className='absolute inset-0 bg-black/10 z-25'
            />
          )}
          {showSettings && (
            <motion.div
              key='settings-panel'
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className='absolute top-0 right-0 bottom-0 z-30'
            >
              <ChatDetailsSidebar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className='relative z-10'>
        <InputArea />
      </div>
    </main>
  )
}
