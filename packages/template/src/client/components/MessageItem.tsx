import React, { useState } from 'react'
import { AlertCircle, Clock, FileIcon, Download } from 'lucide-react'
import { ChatMessage, MessageElement } from '../../core/types'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { getMessageSummary, toMillis, formatSize, resolveMediaSrc, downloadFile, qqFaceGif, qqFacePng, cn } from '../utils'
import { useCachedSrc } from '../faceCache'
import { Avatar } from './Avatar'

/** QQ 表情（face 元素）：本地动图 → 本地静态图 → 占位文本 三级降级（src 走前端 IndexedDB 缓存） */
const MessageFace: React.FC<{ id: number }> = ({ id }) => {
  // 0=动图 1=静态图 2=图源均不可用，降级为文本
  const [stage, setStage] = useState(0)
  const src = useCachedSrc(stage === 0 ? qqFaceGif(id) : qqFacePng(id))

  if (stage === 2) {
    return <span className='opacity-80'>[表情:{id}]</span>
  }
  if (!src) {
    return <span className='inline-block w-5 h-5 align-[-4px] mx-px rounded bg-tg-hover animate-pulse' />
  }
  return (
    <img
      src={src}
      alt={`[表情:${id}]`}
      title={`[表情:${id}]`}
      referrerPolicy='no-referrer'
      onError={() => setStage(s => s + 1)}
      className='inline-block w-5 h-5 align-[-4px] mx-px select-none'
    />
  )
}

/** 消息图片：防盗链 no-referrer、限宽限高、加载失败占位、点击遮罩看原图（支持右键菜单与下载按钮） */
const MessageImage: React.FC<{ file: string, isPureMedia: boolean }> = ({ file, isPureMedia }) => {
  const { setContextMenu } = useUi()
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
          'max-w-[320px] max-h-[320px] object-contain cursor-zoom-in',
          isPureMedia ? 'block' : 'rounded-lg my-1'
        )}
      />
      {zoom && (
        <div
          className='fixed inset-0 z-[300] bg-black/70 flex items-center justify-center cursor-zoom-out animate-in fade-in duration-200'
          onClick={() => setZoom(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              downloadFile(src, `image-${Date.now()}.png`)
            }}
            className='absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors'
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

/** TG 风格发送者昵称配色（按 ID hash 取色） */
const NAME_COLORS = ['#cc5049', '#d67722', '#955cdb', '#40a920', '#309eba', '#368ad1', '#c7508b']

const nameColor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

const formatTime = (time: number) =>
  new Date(toMillis(time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

interface MessageItemProps {
  message: ChatMessage
  isMe: boolean
  /** 连续消息组的第一条（显示昵称） */
  groupStart: boolean
  /** 连续消息组的最后一条（显示头像与气泡尾巴） */
  groupEnd: boolean
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, isMe, groupStart, groupEnd }) => {
  const { resendMessage, groupMembers, messages, resolveAvatar } = useChat()
  const { setConfirmDialog, setContextMenu, setToast, flashMessageId, flashMessage } = useUi()
  const isGroup = message.scene === 'group'

  // 系统消息（戳一戳/撤回提示等）：居中灰色胶囊，无气泡无头像
  if (message.system) {
    return (
      <div className='flex justify-center my-1.5'>
        <span
          data-message-id={message.messageId}
          className='px-3 py-1 rounded-full bg-black/15 dark:bg-white/10 text-white dark:text-tg-text-secondary text-xs select-none'
        >
          {message.elements.map(e => (e.type === 'text' ? e.text : '')).join('')}
        </span>
      </div>
    )
  }

  const senderMember = isGroup ? groupMembers.find((m) => String(m.userId) === String(message.senderId)) : undefined
  const senderDisplayName = senderMember ? (senderMember.card || senderMember.nick || message.senderName) : message.senderName

  const roleBadge = (() => {
    if (!isGroup || !senderMember) return null
    if (senderMember.role === 'owner') return <span className='text-[10px] text-amber-500 font-medium shrink-0'>群主</span>
    if (senderMember.role === 'admin') return <span className='text-[10px] text-emerald-500 font-medium shrink-0'>管理员</span>
    return null
  })()

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
          'mb-1 pl-2 pr-2 py-0.5 rounded text-[13px] border-l-2 border-tg-blue max-w-full truncate cursor-pointer hover:bg-tg-blue/10 transition-colors',
          isMe ? 'bg-black/5 dark:bg-white/10' : 'bg-black/5 dark:bg-white/5'
        )}
      >
        <span className='text-tg-blue font-medium'>{target ? target.senderName : '引用消息'}</span>
        <br />
        <span className='opacity-70'>{target ? getMessageSummary(target.elements) : '[原消息未加载]'}</span>
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
              className={cn('max-w-[320px] max-h-[320px]', isPureMedia ? 'block' : 'rounded-lg my-1')}
            />
          )
        case 'record':
          return <audio key={idx} controls src={part.file} className='max-w-[260px]' />
        case 'file':
          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-xl transition-colors cursor-pointer group/file w-full max-w-[280px] my-0.5',
                'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15'
              )}
              onClick={() => downloadFile(part.file, part.name)}
            >
              <div className='w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-tg-blue text-white'>
                <FileIcon className='w-5 h-5' />
              </div>
              <div className='flex-1 min-w-0'>
                <div className='text-sm font-medium truncate'>{part.name || '未知文件'}</div>
                <div className='text-xs text-tg-text-secondary'>{formatSize(part.size)}</div>
              </div>
              <Download className='w-4 h-4 opacity-0 group-hover/file:opacity-60 transition-opacity shrink-0' />
            </div>
          )
        case 'at':
          return (
            <span
              key={idx}
              className={cn(
                'font-medium cursor-pointer hover:underline rounded',
                isMe ? 'text-tg-blue dark:text-[#7ab8f5]' : 'text-tg-blue'
              )}
            >
              @{part.name || part.targetId}
            </span>
          )
        case 'face':
          return <MessageFace key={idx} id={part.id} />
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

  /** 气泡内右下角的时间与发送状态 */
  const timeFooter = (
    <span className={cn(
      'inline-flex items-center gap-1 float-right ml-2 mt-1.5 text-[11px] leading-none select-none',
      isMe ? 'text-[#5ca853] dark:text-white/50' : 'text-tg-text-secondary'
    )}
    >
      {formatTime(message.time)}
      {isMe && message.status === 'sending' && <Clock className='w-3 h-3' />}
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
          <AlertCircle className='w-3.5 h-3.5' />
        </button>
      )}
    </span>
  )

  // 群聊里他人消息显示头像（组尾），私聊不显示头像
  const showAvatar = isGroup && !isMe

  return (
    <div
      data-message-id={message.messageId}
      onContextMenu={(e) => openMenu(e, 'message')}
      className={cn(
        'flex items-end gap-2',
        isMe ? 'flex-row-reverse' : 'flex-row',
        groupEnd ? 'mb-2.5' : 'mb-0.5',
        flashMessageId === message.messageId && 'highlight-msg'
      )}
    >
      {/* 头像列（仅群聊他人）：组尾显示头像，其余占位对齐；头像统一走后端协议端 getAvatarUrl，缺失用字母占位 */}
      {showAvatar && (
        <div className='w-8 shrink-0'>
          {groupEnd && (
            <span onContextMenu={(e) => openMenu(e, 'avatar')} className='block cursor-pointer select-none'>
              <Avatar url={resolveAvatar(message.senderId)} name={message.senderName} className='w-8 h-8 text-sm' />
            </span>
          )}
        </div>
      )}

      <div className={cn('relative flex flex-col max-w-[65%] xl:max-w-[640px] min-w-0', isMe ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'bubble min-w-0 max-w-full text-sm leading-relaxed break-words',
            message.recalled && 'border-2 border-red-500/70',
            isPureMedia
              ? 'overflow-hidden rounded-xl'
              : cn(
                'px-3 py-1.5 shadow-sm',
                isMe
                  ? 'bubble-me bg-tg-bubble-me text-tg-bubble-me-text'
                  : 'bubble-them bg-tg-bubble-them text-tg-bubble-them-text'
              )
          )}
        >
          {/* 气泡尾巴（组尾文本气泡） */}
          {!isPureMedia && groupEnd && (
            <span className={isMe ? 'bubble-tail-me' : 'bubble-tail-them'} />
          )}

          {/* 群聊他人：组首气泡内顶部显示彩色昵称 */}
          {isGroup && !isMe && groupStart && (
            <div className='flex items-center gap-1.5 mb-0.5'>
              <span
                className='text-[13px] font-medium truncate max-w-[180px]'
                style={{ color: nameColor(String(message.senderId)) }}
              >
                {senderDisplayName}
              </span>
              {roleBadge}
            </div>
          )}

          {renderMessageContent()}
          {!isPureMedia && timeFooter}
        </div>

        {/* 已撤回标记：气泡下方红色小字（对齐方向跟随 isMe，由父容器 items-end/start 控制） */}
        {message.recalled && (
          <span className='mt-0.5 text-xs text-red-500/80 select-none'>消息已撤回</span>
        )}

        {/* 纯媒体：时间浮层盖在图上（absolute 不占布局空间，否则负 margin 会把下一条消息拉上来重叠） */}
        {isPureMedia && (
          <span className='absolute bottom-1.5 right-2 z-10 px-1.5 py-0.5 rounded bg-black/40 text-white text-[11px] leading-none select-none pointer-events-none'>
            {formatTime(message.time)}
            {isMe && message.status === 'sending' && <Clock className='inline w-3 h-3 ml-1' />}
            {isMe && message.status === 'failed' && <AlertCircle className='inline w-3 h-3 ml-1 text-red-400' />}
          </span>
        )}
      </div>
    </div>
  )
}
