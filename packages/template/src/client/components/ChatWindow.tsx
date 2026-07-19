import React, { useState } from 'react'
import { Settings, Bot, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '../ChatContext'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { ChatDetailsSidebar } from './ChatDetailsSidebar'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export const ChatWindow: React.FC = () => {
  const { currentConversation, currentBot, setShowSettings, showSettings, actualTheme, handleFiles } = useChat()
  const [isDragging, setIsDragging] = useState(false)
  const isDark = actualTheme === 'dark'

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
      handleFiles(e.dataTransfer.files)
    }
  }

  if (!currentBot) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center p-8 text-center transition-colors duration-500',
        isDark ? 'bg-gray-950' : 'bg-[#fafafa]')}
      >
        <div className={cn('w-32 h-32 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center justify-center mb-10 border transition-all hover:scale-105',
          isDark ? 'bg-gray-800 border-white/10' : 'bg-white border-white')}
        >
          <Bot className='w-16 h-16 text-mac-blue animate-pulse' />
        </div>
        <p className={cn('max-w-xs text-sm font-medium leading-relaxed mb-10', isDark ? 'text-gray-400' : 'text-gray-500')}>
          未检测到已连接的 Bot。请先在 Karin 中登录 Bot 账号。
        </p>
      </div>
    )
  }

  if (!currentConversation) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center transition-colors duration-500',
        isDark ? 'bg-gray-900' : 'bg-white')}
      >
        <div className='relative'>
          <div className='absolute inset-0 bg-mac-blue blur-3xl opacity-10 animate-pulse' />
          <Bot className={cn('w-40 h-40 mb-8 opacity-20 relative z-10', isDark ? 'text-white' : 'text-mac-blue')} />
        </div>
        <span className={cn('text-xl font-bold tracking-tight opacity-40', isDark ? 'text-white' : 'text-gray-900')}>
          开启沟通之旅
        </span>
        <p className={cn('text-xs font-medium mt-3 opacity-30', isDark ? 'text-gray-400' : 'text-gray-500')}>
          在左侧列表中选择一个联系人开始聊天
        </p>
      </div>
    )
  }

  return (
    <main
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('flex-1 flex flex-col relative overflow-hidden transition-colors duration-300',
        isDark ? 'bg-gray-900 text-gray-100' : 'bg-white')}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 z-[100] bg-mac-blue/10 backdrop-blur-[2px] border-2 border-dashed border-mac-blue m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none'
          >
            <div className='bg-mac-blue text-white p-4 rounded-2xl shadow-2xl mb-4'>
              <Upload className='w-8 h-8 animate-bounce' />
            </div>
            <p className='text-mac-blue font-bold text-lg'>松开鼠标发送图片</p>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={cn('h-16 px-8 flex items-center justify-between border-b backdrop-blur-3xl sticky top-0 z-20 shrink-0',
        isDark ? 'bg-gray-800/60 border-white/10' : 'bg-white/70 border-black/5')}
      >
        <div className='flex flex-col gap-0.5'>
          <h2 className={cn('text-base font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>
            {currentConversation.name}
          </h2>
          <div className='flex items-center gap-2'>
            <div className='w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' />
            <span className={cn('text-[10px] font-bold opacity-50 uppercase tracking-widest',
              isDark ? 'text-gray-300' : 'text-gray-500')}
            >
              {currentConversation.scene === 'friend' ? '私聊会话' : '群聊频道'}
            </span>
          </div>
        </div>
        <div className='flex items-center gap-5'>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn('p-2.5 rounded-2xl transition-all duration-200 active:scale-90',
              showSettings
                ? (isDark ? 'bg-mac-blue text-white' : 'bg-mac-blue text-white shadow-lg shadow-mac-blue/20')
                : (isDark ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-black/5 text-mac-text-secondary hover:text-mac-blue'))}
          >
            <Settings className='w-5 h-5' />
          </button>
        </div>
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
              className='absolute inset-0 bg-black/5 z-25'
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
