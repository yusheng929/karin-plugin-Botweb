import React, { useState, useRef, useEffect } from 'react'
import {
  Smile,
  ImageIcon,
  FolderInput,
  Mic,
  AtSign,
  Reply,
  X
} from 'lucide-react'
import { useChat } from '../ChatContext'
import { MessageElement } from '../../core/types'
import { getMessageSummary } from '../utils'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export const InputArea: React.FC = () => {
  const {
    currentConversation, sendMessage, handleFiles, actualTheme, groupMembers,
    stagedImages, setStagedImages,
    replyTo, setReplyTo, pendingMention, setPendingMention
  } = useChat()
  const [inputValue, setInputValue] = useState('')
  const [atMenu, setAtMenu] = useState<{ filter: string } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDark = actualTheme === 'dark'
  const isGroup = currentConversation?.scene === 'group'

  // 输入内容或图片为空时禁用
  const isDisabled = !currentConversation || (!inputValue.trim() && stagedImages.length === 0)

  const members = isGroup ? groupMembers : []
  const filteredMembers = [
    ...(isGroup && (!atMenu?.filter || '全体成员'.includes(atMenu.filter) || 'all'.includes(atMenu.filter.toLowerCase()))
      ? [{ userId: 'all', nick: '全体成员' }]
      : []),
    ...members.filter((m) => {
      const searchStr = atMenu?.filter.toLowerCase() || ''
      return (
        String(m.userId).toLowerCase().includes(searchStr) ||
        (m.nick || '').toLowerCase().includes(searchStr) ||
        (m.card || '').toLowerCase().includes(searchStr)
      )
    })
  ]

  useEffect(() => {
    setSelectedIndex(0)
  }, [atMenu?.filter])

  // 右键菜单「@ TA」：向输入框插入 @userId（复用现有 @ 解析逻辑）
  useEffect(() => {
    if (!pendingMention) return
    setInputValue(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + `@${pendingMention} `)
    setPendingMention(null)
    textareaRef.current?.focus()
  }, [pendingMention, setPendingMention])

  const memberName = (userId: string) => {
    const member = groupMembers.find(m => String(m.userId) === String(userId))
    return member ? (member.card || member.nick) : undefined
  }

  const handleSend = async () => {
    if (isDisabled || !currentConversation) return

    // 解析 @：规则为 @ID + 空格，且 ID 在当前群成员中（或为 all）
    const parts: MessageElement[] = []
    let lastIndex = 0
    const atRegex = /@([^\s@]+)\s/g

    let match
    while ((match = atRegex.exec(inputValue)) !== null) {
      const targetId = match[1]
      const isMemberMatch = isGroup && (
        targetId === 'all' ||
        groupMembers.some((m) => String(m.userId) === targetId)
      )

      if (isMemberMatch) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', text: inputValue.substring(lastIndex, match.index) })
        }
        parts.push({ type: 'at', targetId, name: targetId === 'all' ? '全体成员' : memberName(targetId) })
        lastIndex = atRegex.lastIndex
      }
    }

    if (lastIndex < inputValue.length) {
      parts.push({ type: 'text', text: inputValue.substring(lastIndex) })
    }

    // 加入待发送的图片（base64 dataURL，直接作为 image 元素发送）；回复元素放头部
    const finalContent: MessageElement[] = [
      ...replyTo ? [{ type: 'reply' as const, messageId: replyTo.messageId }] : [],
      ...parts.length > 0 ? parts : (inputValue.trim() ? [{ type: 'text' as const, text: inputValue }] : []),
      ...stagedImages.map(dataUrl => ({ type: 'image' as const, file: dataUrl }))
    ]

    if (finalContent.length === 0) return

    await sendMessage(finalContent)
    setInputValue('')
    setStagedImages([])
    setReplyTo(null)
  }

  const insertAt = (userId: string) => {
    if (!textareaRef.current) return
    const before = inputValue.substring(0, textareaRef.current.selectionStart).replace(/@\S*$/, '')
    const after = inputValue.substring(textareaRef.current.selectionEnd)
    const newValue = `${before}@${userId} ${after}`
    setInputValue(newValue)
    setAtMenu(null)

    // 重新聚焦并设置光标位置
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const cursorGap = `@${userId} `.length
        const pos = before.length + cursorGap
        textareaRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)

    if (isGroup) {
      const cursor = e.target.selectionStart
      const textBeforeCursor = value.substring(0, cursor)
      const lastAt = textBeforeCursor.lastIndexOf('@')

      // 只有当 @ 后面没有空格，且是在最后一个词的位置时才触发
      if (lastAt !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAt + 1)
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          setAtMenu({ filter: textAfterAt })
          return
        }
      }
    }
    setAtMenu(null)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault()
      handleFiles(e.clipboardData.files)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (atMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredMembers.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + filteredMembers.length) % Math.max(1, filteredMembers.length))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredMembers[selectedIndex]) {
          insertAt(filteredMembers[selectedIndex].userId)
        }
      } else if (e.key === 'Escape') {
        setAtMenu(null)
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <footer className={cn('p-4 border-t shrink-0 relative', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-mac-border')}>
      {/* At Menu */}
      {atMenu && isGroup && filteredMembers.length > 0 && (
        <div
          className={cn(
            'absolute bottom-full mb-2 left-4 w-56 max-h-48 overflow-y-auto rounded-2xl shadow-2xl border backdrop-blur-3xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200',
            isDark ? 'bg-gray-900/90 border-white/10' : 'bg-white/90 border-black/5'
          )}
        >
          <div className='p-2 space-y-0.5'>
            <div className='px-3 py-1.5 text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-1.5'>
              <AtSign className='w-3 h-3' /> 选择群成员
            </div>
            {filteredMembers.map((member, idx: number) => (
              <button
                key={member.userId}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => insertAt(member.userId)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all',
                  idx === selectedIndex
                    ? (isDark ? 'bg-mac-blue text-white' : 'bg-mac-blue text-white shadow-lg shadow-mac-blue/20')
                    : (isDark ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-black/5 text-gray-700')
                )}
              >
                <img
                  src={`https://q.qlogo.cn/g?b=qq&nk=${member.userId}&s=100`}
                  alt=''
                  className='w-6 h-6 rounded-full shrink-0 shadow-sm border border-black/5'
                />
                <div className='flex-1 min-w-0'>
                  <div className='text-xs font-bold truncate'>{('card' in member && member.card) || member.nick || member.userId}</div>
                  <div className={cn('text-[9px] font-medium opacity-50', idx === selectedIndex ? 'text-white' : '')}>{member.userId}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className='flex flex-col gap-3'>
        {/* 待回复状态 */}
        {replyTo && (
          <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
            isDark ? 'bg-white/5 text-gray-300' : 'bg-black/5 text-gray-600')}
          >
            <Reply className='w-3.5 h-3.5 shrink-0 opacity-50' />
            <span className='flex-1 min-w-0 truncate font-medium'>
              回复 {replyTo.senderName}: {getMessageSummary(replyTo.elements)}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className='p-0.5 rounded-full hover:bg-black/10 transition-colors shrink-0'
              title='取消回复'
            >
              <X className='w-3.5 h-3.5' />
            </button>
          </div>
        )}

        <div className='flex items-center gap-1.5 text-mac-text-secondary'>
          <button className='p-2 hover:bg-black/5 rounded-lg transition-all'><Smile className='w-5 h-5' /></button>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'image/*'
                fileInputRef.current.click()
              }
            }}
            className='p-2 hover:bg-black/5 rounded-lg transition-all'
          >
            <ImageIcon className='w-5 h-5' />
          </button>
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = '*/*'
                fileInputRef.current.click()
              }
            }}
            className='p-2 hover:bg-black/5 rounded-lg transition-all'
          >
            <FolderInput className='w-5 h-5' />
          </button>
          <button className='p-2 hover:bg-black/5 rounded-lg transition-all ml-auto'><Mic className='w-5 h-5' /></button>

          <input
            type='file'
            ref={fileInputRef}
            className='hidden'
            multiple
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {stagedImages.length > 0 && (
          <div className='flex flex-wrap gap-2 px-1'>
            {stagedImages.map((src, idx) => (
              <div key={idx} className='relative group w-20 h-20 rounded-lg overflow-hidden border border-black/5 shadow-sm bg-black/5'>
                <img src={src} alt='' className='w-full h-full object-cover' />
                <button
                  onClick={() => setStagedImages(stagedImages.filter((_, i) => i !== idx))}
                  className='absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity'
                >
                  <X className='w-3 h-3' />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className='relative flex items-end gap-2'>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            disabled={!currentConversation}
            placeholder={
              !currentConversation
                ? '选择一个会话开始聊天'
                : `发送给 ${currentConversation.name}...`
            }
            rows={1}
            className={cn(
              'flex-1 resize-none bg-black/5 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-mac-blue/20 transition-all max-h-32 min-h-[40px]',
              isDark && 'bg-gray-700 text-gray-200',
              !currentConversation && 'opacity-50 cursor-not-allowed'
            )}
            style={{ height: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={isDisabled}
            className={cn(
              'h-10 px-5 rounded-xl bg-mac-blue text-white font-medium text-sm transition-all flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:shadow-none shrink-0',
              isDisabled && 'bg-gray-400'
            )}
          >
            发送
          </button>
        </div>
      </div>
    </footer>
  )
}
