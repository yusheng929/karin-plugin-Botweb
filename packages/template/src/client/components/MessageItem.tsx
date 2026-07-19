import React, { useState } from 'react'
import { AlertCircle, Loader2, FileIcon, Download } from 'lucide-react'
import { ChatMessage, MessageElement } from '../../core/types'
import { useChat } from '../ChatContext'
import { getAvatarUrl, getMessageSummary, toMillis, formatSize, resolveMediaSrc, downloadFile } from '../utils'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

/** 消息图片：防盗链 no-referrer、限宽限高、加载失败占位、点击遮罩看原图（支持右键菜单与下载按钮） */
const MessageImage: React.FC<{ file: string, isPureMedia: boolean }> = ({ file, isPureMedia }) => {
  const { setContextMenu } = useChat()
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(false)
  const src = resolveMediaSrc(file)

  if (error) {
    return (
      <div className='max-w-[260px] px-4 py-6 rounded-lg bg-black/5 text-xs opacity-50 text-center select-none'>
        [图片加载失败]
      </div>
    )
  }

  return (
    <>
      <img
        src={src}
        alt=''
        referrerPolicy='no-referrer'
        onError={() => setError(true)}
        onClick={() => setZoom(true)}
        className={cn(
          'max-w-[260px] max-h-[320px] object-contain rounded-lg shadow-sm cursor-zoom-in',
          !isPureMedia && 'my-1'
        )}
      />
      {zoom && (
        <div
          className='fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center cursor-zoom-out animate-in fade-in duration-200'
          onClick={() => setZoom(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              downloadFile(src, `image-${Date.now()}.png`)
            }}
            className='absolute top-6 right-6 p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-xl transition-all active:scale-90'
            title='下载图片'
          >
            <Download className='w-5 h-5' />
          </button>
          <img
            src={src}
            alt=''
            referrerPolicy='no-referrer'
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, kind: 'image', file })
            }}
            className='max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default'
          />
        </div>
      )}
    </>
  )
}

interface MessageItemProps {
  message: ChatMessage
  isMe: boolean
  showTime: boolean
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, isMe, showTime }) => {
  const {
    resendMessage, actualTheme, setConfirmDialog, groupMembers, messages,
    setContextMenu, setToast, flashMessageId, flashMessage
  } = useChat()
  const isDark = actualTheme === 'dark'
  const isGroup = message.scene === 'group'

  const timeChip = showTime && (
    <div className='flex justify-center'>
      <span className={cn('px-2 py-0.5 rounded-full text-[10px]', isDark ? 'bg-gray-800 text-gray-400' : 'bg-black/5 text-gray-500')}>
        {new Date(toMillis(message.time)).toLocaleString()}
      </span>
    </div>
  )

  // 系统消息（戳一戳/撤回提示等）：居中灰色小字条，无气泡无头像
  if (message.system) {
    return (
      <div className='flex flex-col gap-4'>
        {timeChip}
        <div data-message-id={message.messageId} className='flex justify-center'>
          <span className={cn('px-3 py-1 rounded-full text-[10px]', isDark ? 'bg-gray-800 text-gray-400' : 'bg-black/5 text-gray-500')}>
            {message.elements.map(e => (e.type === 'text' ? e.text : '')).join('')}
          </span>
        </div>
      </div>
    )
  }

  const senderMember = isGroup ? groupMembers.find((m) => String(m.userId) === String(message.senderId)) : undefined
  const senderDisplayName = senderMember ? (senderMember.card || senderMember.nick || message.senderName) : message.senderName

  const getRoleTitle = () => {
    if (!isGroup || !senderMember) return null

    let text = ''
    let colorClasses = ''

    if (senderMember.role === 'owner') {
      text = '群主'
      colorClasses = isDark ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
    } else if (senderMember.role === 'admin') {
      text = '管理员'
      colorClasses = isDark ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
    } else {
      return null
    }

    return { text, colorClasses }
  }

  const roleTitle = getRoleTitle()

  const parts = message.elements
  const hasText = parts.some(p => (p.type === 'text' && p.text.trim() !== '') || ['at', 'reply', 'face', 'file', 'record', 'other'].includes(p.type))
  const isPureMedia = !hasText && parts.every(p => ['image', 'video'].includes(p.type) || (p.type === 'text' && p.text.trim() === ''))

  /** 点击引用块跳转到原消息并短暂高亮 */
  const jumpToMessage = (messageId: string) => {
    const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      flashMessage(messageId)
    } else {
      setToast({ message: '原消息未加载', type: 'info' })
    }
  }

  const renderReply = (part: Extract<MessageElement, { type: 'reply' }>, idx: number) => {
    const target = messages.find(m => m.messageId === part.messageId)
    return (
      <div
        key={idx}
        onClick={(e) => {
          e.stopPropagation()
          jumpToMessage(part.messageId)
        }}
        className={cn(
          'mb-1 px-2 py-1 rounded-lg text-xs border-l-2 opacity-80 max-w-full truncate cursor-pointer hover:opacity-100 transition-opacity',
          isMe
            ? 'border-white/50 bg-white/10'
            : isDark ? 'border-mac-blue/50 bg-white/5' : 'border-mac-blue/50 bg-black/5'
        )}
      >
        {target
          ? `${target.senderName}: ${getMessageSummary(target.elements)}`
          : '[引用消息]'}
      </div>
    )
  }

  const renderMessageContent = () => {
    return parts.map((part, idx) => {
      switch (part.type) {
        case 'text':
          return <span key={idx}>{part.text}</span>
        case 'image':
          return <MessageImage key={idx} file={part.file} isPureMedia={isPureMedia} />
        case 'video':
          return (
            <video
              key={idx}
              controls
              src={part.file}
              className={cn('max-w-[260px] max-h-[320px] rounded-lg shadow-sm', !isPureMedia && 'my-1')}
            />
          )
        case 'record':
          return <audio key={idx} controls src={part.file} className='max-w-[260px]' />
        case 'file':
          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group/file w-full max-w-[280px]',
                isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/5 hover:bg-black/10'
              )}
              onClick={() => downloadFile(part.file, part.name)}
            >
              <div className='w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-mac-blue/10'>
                <FileIcon className='w-5 h-5 text-mac-blue' />
              </div>
              <div className='flex-1 min-w-0'>
                <div className={cn('text-xs font-bold truncate', isDark ? 'text-gray-200' : 'text-gray-900')}>
                  {part.name || '未知文件'}
                </div>
                <div className={cn('text-[10px] opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  {formatSize(part.size)}
                </div>
              </div>
              <Download className='w-4 h-4 opacity-0 group-hover/file:opacity-100 transition-opacity text-mac-blue' />
            </div>
          )
        case 'at':
          return (
            <span
              key={idx}
              className={cn(
                'font-medium cursor-pointer hover:underline px-1 rounded transition-colors',
                isMe
                  ? 'text-blue-100 bg-white/10 hover:bg-white/20'
                  : 'text-mac-blue bg-mac-blue/5 hover:bg-mac-blue/10'
              )}
            >
              @{part.name || part.targetId}
            </span>
          )
        case 'face':
          return <span key={idx} className='opacity-80'>[表情:{part.id}]</span>
        case 'reply':
          return renderReply(part, idx)
        case 'other':
          return <span key={idx} className='opacity-50'>{part.text || '[暂不支持的消息]'}</span>
        default:
          return null
      }
    })
  }

  const openMenu = (e: React.MouseEvent, kind: 'avatar' | 'message') => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, kind, msg: message })
  }

  return (
    <div className='flex flex-col gap-4'>
      {timeChip}

      <div
        data-message-id={message.messageId}
        onContextMenu={(e) => openMenu(e, 'message')}
        className={cn(
          'flex group items-start gap-3 px-2 -mx-2 py-1 -my-1 rounded-2xl transition-colors duration-500',
          isMe ? 'flex-row-reverse' : 'flex-row',
          flashMessageId === message.messageId && (isDark ? 'bg-mac-blue/25' : 'bg-mac-blue/15')
        )}
      >
        {/* Avatar */}
        <div
          onContextMenu={(e) => {
            // 群消息头像右键弹成员菜单；其他情况冒泡为消息菜单
            if (isGroup && !isMe) {
              openMenu(e, 'avatar')
            }
          }}
          className={cn(
            'w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden cursor-pointer active:scale-95 transition-transform z-10 ring-2 ring-inset',
            isGroup && senderMember?.role === 'owner'
              ? 'ring-amber-500/50'
              : isGroup && senderMember?.role === 'admin' ? 'ring-emerald-500/50' : 'ring-transparent'
          )}
        >
          <img src={getAvatarUrl('private', message.senderId)} alt='' className='w-full h-full object-cover' />
        </div>

        {/* Message Content Column */}
        <div className={cn('flex flex-col max-w-[70%]', isMe ? 'items-end' : 'items-start')}>
          {/* Metadata Row (Title & Display Name) - Always above the bubble */}
          <div className={cn('flex items-center gap-1.5 mb-1 px-1', isMe ? 'flex-row-reverse' : 'flex-row')}>
            {isGroup && roleTitle && (
              <span className={cn(
                'text-[8px] px-1 py-0.5 rounded font-black uppercase tracking-widest shadow-sm border whitespace-nowrap leading-none',
                roleTitle.colorClasses
              )}
              >
                {roleTitle.text}
              </span>
            )}
            <span className={cn('text-[10px] font-bold opacity-50 truncate max-w-[120px] leading-none', isDark ? 'text-gray-400' : 'text-gray-500')}>
              {isGroup || !isMe ? senderDisplayName : ''}
            </span>
          </div>

          <div className='flex items-center gap-2 group'>
            {/* Status Indicators (Left of bubble if isMe) */}
            {isMe && message.status === 'sending' && (
              <Loader2 className='w-4 h-4 text-mac-blue animate-spin shrink-0' />
            )}
            {isMe && message.status === 'failed' && (
              <button
                onClick={() => {
                  setConfirmDialog({
                    title: '重新发送',
                    message: '消息发送失败，是否尝试重新发送该消息？',
                    onConfirm: () => resendMessage(message.messageId),
                    confirmText: '重新发送',
                    cancelText: '取消'
                  })
                }}
                className='text-red-500 hover:text-red-600 transition-colors'
                title='发送失败，点击重试'
              >
                <AlertCircle className='w-4 h-4' />
              </button>
            )}

            <div
              className={cn(
                'relative transition-all duration-300',
                isPureMedia ? '' : 'px-4 py-2.5 rounded-2xl shadow-sm text-sm break-all leading-relaxed',
                isPureMedia
                  ? ''
                  : isMe
                    ? 'bg-mac-blue text-white'
                    : (isDark ? 'bg-gray-800 text-gray-200' : 'bg-white border border-mac-border text-mac-text-main')
              )}
            >
              {renderMessageContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
