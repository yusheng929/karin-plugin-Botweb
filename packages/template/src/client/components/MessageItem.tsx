import React, { useState } from 'react'
import { AlertCircle, FileIcon, Download, MessagesSquare, X } from 'lucide-react'
import { ChatMessage, ButtonItem, ForwardMessageItem, MessageElement, ReactionItem } from '../../core/types'
import { useMessageView } from './messageView'
import { getMessageSummary, toMillis, formatSize, resolveMediaSrc, downloadFile, qqFaceGif, qqFacePng, isQQProtocol, cn } from '../utils'
import { useCachedSrc } from '../faceCache'
import { getForward } from '../api'
import { Spinner } from '@heroui/react'
import { Avatar } from './Avatar'
import { MessageMarkdown } from './MessageMarkdown'

/** QQ 表情（face 元素）：本地动图 → 本地静态图 → 占位文本 三级降级（src 走前端 IndexedDB 缓存） */
const MessageFace: React.FC<{ id: number, className?: string }> = ({ id, className }) => {
  // 0=动图 1=静态图 2=图源均不可用，降级为文本
  const [stage, setStage] = useState(0)
  const src = useCachedSrc(stage === 0 ? qqFaceGif(id) : qqFacePng(id))

  if (stage === 2) {
    return <span className='opacity-80'>[表情:{id}]</span>
  }
  if (!src) {
    return <span className={cn('inline-block rounded bg-qq-hover animate-pulse', className || 'w-5 h-5 align-[-4px] mx-px')} />
  }
  return (
    <img
      src={src}
      alt={`[表情:${id}]`}
      title={`[表情:${id}]`}
      referrerPolicy='no-referrer'
      onError={() => setStage(s => s + 1)}
      className={cn('inline-block select-none', className || 'w-5 h-5 align-[-4px] mx-px')}
    />
  )
}

/** 表情回应条（QQ 贴表情聚合）：气泡下方一排小胶囊（QFace 小图 + 次数），对齐方向跟随 isMe；
 *  QQ 协议下胶囊可点击——未贴过则贴一个同表情，已贴过（蓝色高亮）则取消（QQ 客户端同款交互） */
const MessageReactions: React.FC<{ reactions: ReactionItem[], myFaceIds?: ReadonlySet<number>, onReact?: (faceId: number) => void }> = ({ reactions, myFaceIds, onReact }) => (
  <div className='flex flex-wrap items-center gap-1 mt-1 select-none'>
    {reactions.map((r) => {
      const mine = myFaceIds?.has(r.faceId)
      return (
        <button
          key={r.faceId}
          disabled={!onReact}
          onClick={onReact ? () => onReact(r.faceId) : undefined}
          className={cn(
            'flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full text-[11px] leading-none transition-colors',
            mine
              ? 'bg-qq-blue/15 text-qq-blue cursor-pointer hover:bg-qq-blue/25'
              : cn('bg-qq-hover text-qq-text-secondary', onReact && 'cursor-pointer hover:bg-qq-active')
          )}
          title={mine ? `[表情:${r.faceId}] x${r.count}（已贴，点击取消）` : `[表情:${r.faceId}] x${r.count}`}
        >
          <MessageFace id={r.faceId} className='w-3.5 h-3.5' />
          <span>{r.count}</span>
        </button>
      )
    })}
  </div>
)

/** 消息图片：防盗链 no-referrer、限宽限高、加载失败占位、点击遮罩看原图（支持右键菜单与下载按钮） */
const MessageImage: React.FC<{ file: string, isPureMedia: boolean }> = ({ file, isPureMedia }) => {
  const { setContextMenu } = useMessageView()
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(false)
  const src = resolveMediaSrc(file)

  if (error) {
    return (
      <div className='max-w-[260px] px-4 py-6 rounded-xl bg-qq-hover text-xs opacity-50 text-center select-none'>
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
            className='max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl cursor-default'
          />
        </div>
      )}
    </>
  )
}

/** 气泡悬停提示的完整时间 */
const formatFullTime = (time: number) => {
  const d = new Date(toMillis(time))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 转发内容浮层里的单条元素渲染（简化版：图片不放大、嵌套转发显示占位） */
const renderForwardElement = (part: MessageElement, idx: number): React.ReactNode => {
  switch (part.type) {
    case 'text':
      return <span key={idx}>{part.text}</span>
    case 'at':
      return <span key={idx} className='text-qq-blue font-medium'>@{part.name || part.targetId}</span>
    case 'face':
      return <MessageFace key={idx} id={part.id} />
    case 'image':
      return (
        <img
          key={idx}
          src={resolveMediaSrc(part.file)}
          alt=''
          referrerPolicy='no-referrer'
          className='max-w-[240px] max-h-[240px] object-contain rounded-lg my-1 block'
        />
      )
    case 'video':
      return <video key={idx} controls src={part.file} className='max-w-[240px] max-h-[240px] rounded-lg my-1 block' />
    case 'record':
      return <audio key={idx} controls src={part.file} className='max-w-[240px] my-1 block' />
    case 'file':
      return <span key={idx} className='opacity-70'>[文件]{part.name || ''}{part.size ? `（${formatSize(part.size)}）` : ''}</span>
    case 'reply':
      return null
    case 'forward':
      return <span key={idx} className='opacity-70'>[嵌套的合并转发]</span>
    case 'markdown':
      return <MessageMarkdown key={idx} content={part.content} />
    case 'buttons':
      return <MessageButtons key={idx} rows={part.rows} />
    default:
      return <span key={idx} className='opacity-50'>{(part as { text?: string }).text || '[暂不支持的消息]'}</span>
  }
}

/**
 * QQ 按钮/键盘渲染：QQ NT 式线框小按钮，link 按钮可点击跳转，
 * 回调/指令按钮无法在面板触发（协议端回调机制），仅展示
 */
const MessageButtons: React.FC<{ rows: ButtonItem[][] }> = ({ rows }) => (
  <div className='flex flex-col gap-1.5 mt-1.5 w-full min-w-[160px]'>
    {rows.map((row, i) => (
      <div key={i} className='flex gap-1.5'>
        {row.map((btn, j) => (
          <button
            key={j}
            onClick={(e) => {
              e.stopPropagation()
              if (btn.link) window.open(btn.link, '_blank', 'noreferrer')
            }}
            disabled={!btn.link}
            title={btn.link || btn.data || btn.text}
            className={cn(
              'flex-1 px-3 py-1 rounded-full border text-[12px] truncate transition-colors',
              btn.style === 3
                ? 'border-qq-badge/50 text-qq-badge'
                : 'border-qq-blue/50 text-qq-blue',
              btn.link ? 'hover:bg-qq-blue/10 cursor-pointer' : 'opacity-70 cursor-default'
            )}
          >
            {btn.text}
          </button>
        ))}
      </div>
    ))}
  </div>
)

/**
 * 合并转发卡片（QQ NT 式）：列表里显示白色卡片，点击后按需调
 * GET /bots/:selfId/forward 拉取内容，毛玻璃浮层逐条展示
 */
const MessageForward: React.FC<{ resId: string }> = ({ resId }) => {
  const { currentBot, setToast } = useMessageView()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ForwardMessageItem[] | null>(null)

  const openViewer = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(true)
    if (items !== null || loading || !currentBot) return
    setLoading(true)
    try {
      setItems(await getForward(currentBot.selfId, resId))
    } catch (err) {
      setOpen(false)
      setToast({ message: err instanceof Error ? err.message : '获取合并转发消息失败', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        onClick={openViewer}
        className='w-[240px] rounded-xl bg-qq-bg border border-qq-border/60 shadow-sm p-3 cursor-pointer hover:bg-qq-hover transition-colors select-none'
      >
        <div className='flex items-center gap-2.5'>
          <div className='w-9 h-9 rounded-lg bg-qq-blue/10 text-qq-blue flex items-center justify-center shrink-0'>
            <MessagesSquare className='w-5 h-5' />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='text-[13px] font-medium text-qq-text truncate'>合并转发</div>
            <div className='text-[11px] text-qq-text-secondary truncate'>点击展开聊天记录</div>
          </div>
        </div>
      </div>

      {open && (
        <div
          className='fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200'
          onClick={() => setOpen(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className='glass rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[75vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between px-4 py-3 border-b border-qq-border/40 shrink-0'>
              <span className='text-[14px] font-medium'>合并转发{items ? `（${items.length} 条）` : ''}</span>
              <button
                onClick={() => setOpen(false)}
                className='p-1 rounded-full hover:bg-qq-hover transition-colors text-qq-text-secondary'
                title='关闭'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
            <div className='flex-1 overflow-y-auto px-4 py-3'>
              {loading && (
                <div className='flex items-center justify-center py-10'>
                  <Spinner />
                </div>
              )}
              {items?.map((item, i) => (
                <div key={i} className='mb-3 last:mb-0'>
                  <div className='text-[11px] text-qq-text-secondary mb-0.5'>
                    {item.senderName} · {formatFullTime(item.time)}
                  </div>
                  <div className='text-[13px] leading-[1.6] break-words'>
                    {item.elements.map(renderForwardElement)}
                  </div>
                </div>
              ))}
              {items && items.length === 0 && (
                <div className='text-center py-10 text-[12px] text-qq-text-secondary'>暂无内容</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}


interface MessageItemProps {
  message: ChatMessage
  isMe: boolean
  /** 连续消息组的第一条（显示头像与昵称） */
  groupStart: boolean
  /** 连续消息组的最后一条（控制底部留白） */
  groupEnd: boolean
  /** 回复跳转后的短暂高亮中 */
  flashing: boolean
}

/**
 * QQ NT 式消息行：
 * 双侧头像（组首显示、顶部对齐），群聊他人昵称在气泡外上方（灰色小字），
 * 时间不入气泡（悬停 tooltip + 列表居中时间戳），发送状态图标位于气泡侧边。
 * React.memo + MessageViewContext 供数：新消息到达/toast/右键菜单等无关状态变化不会触发重渲染
 */
const MessageItemInner: React.FC<MessageItemProps> = ({ message, isMe, groupStart, groupEnd, flashing }) => {
  const {
    currentBot, conversationAvatar, getMember, getAvatar, getMessage,
    resendMessage, reactMessage, hasReacted,
    setConfirmDialog, setContextMenu, setToast, flashMessage
  } = useMessageView()
  const isGroup = message.scene === 'group'

  // 系统消息（戳一戳/撤回提示等）：居中小灰条，无气泡无头像
  if (message.system) {
    return (
      <div className='flex justify-center my-1.5'>
        <span
          data-message-id={message.messageId}
          className='text-xs text-qq-text-tertiary select-none'
        >
          {message.elements.map(e => (e.type === 'text' ? e.text : '')).join('')}
        </span>
      </div>
    )
  }

  const senderMember = isGroup ? getMember(message.senderId) : undefined
  const senderDisplayName = senderMember ? (senderMember.card || senderMember.nick || message.senderName) : message.senderName

  /**
   * 头衔/角色徽章（互斥，QQ 语义）：有自定义头衔时替换角色文字——
   * 群主仍黄色、管理员仍蓝色、普通群员紫色；无头衔时群主/管理员显示角色文字
   */
  const badge = (() => {
    if (!isGroup || !senderMember) return null
    if (senderMember.title) {
      const cls = senderMember.role === 'owner'
        ? 'role-badge-owner'
        : senderMember.role === 'admin' ? 'role-badge-admin' : 'role-badge-title'
      return <span className={cn('role-badge shrink-0 max-w-[120px] truncate', cls)}>{senderMember.title}</span>
    }
    if (senderMember.role === 'owner') {
      return <span className='role-badge role-badge-owner shrink-0'>群主</span>
    }
    if (senderMember.role === 'admin') {
      return <span className='role-badge role-badge-admin shrink-0'>管理员</span>
    }
    return null
  })()

  const parts = message.elements
  const hasText = parts.some(p => (p.type === 'text' && p.text.trim() !== '') || ['at', 'reply', 'face', 'file', 'record', 'markdown', 'buttons', 'other'].includes(p.type))
  const isPureMedia = !hasText && parts.every(p => ['image', 'video'].includes(p.type) || (p.type === 'text' && p.text.trim() === ''))
  /** 纯合并转发消息：卡片自带底色/边框，气泡像纯媒体一样去掉背景与内边距 */
  const isForwardOnly = parts.some(p => p.type === 'forward') && parts.every(p => p.type === 'forward' || (p.type === 'text' && p.text.trim() === ''))

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
    const target = getMessage(part.messageId)
    return (
      <div
        key={idx}
        onClick={(e) => {
          e.stopPropagation()
          jumpToMessage(part.messageId)
        }}
        className={cn(
          'mb-1 pl-2 pr-2 py-1 rounded-md text-xs border-l-2 max-w-full truncate cursor-pointer transition-colors',
          isMe
            ? 'bg-white/15 border-white/60 hover:bg-white/25'
            : 'bg-qq-hover border-qq-blue hover:bg-qq-blue/10'
        )}
      >
        <span className={cn('font-medium', isMe ? 'text-qq-bubble-me-text' : 'text-qq-blue')}>{target ? target.senderName : '引用消息'}</span>
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
                'flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer group/file w-full max-w-[280px] my-0.5',
                isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-qq-hover hover:bg-qq-blue/10'
              )}
              onClick={() => downloadFile(part.file, part.name)}
            >
              <div className='w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-qq-blue text-white'>
                <FileIcon className='w-5 h-5' />
              </div>
              <div className='flex-1 min-w-0'>
                <div className='text-[13px] font-medium truncate'>{part.name || '未知文件'}</div>
                <div className={cn('text-xs', isMe ? 'text-qq-bubble-me-text/70' : 'text-qq-text-secondary')}>{formatSize(part.size)}</div>
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
                isMe ? 'text-qq-bubble-me-text' : 'text-qq-blue'
              )}
            >
              @{part.name || part.targetId}
            </span>
          )
        case 'face':
          return <MessageFace key={idx} id={part.id} />
        case 'reply':
          return renderReply(part, idx)
        case 'forward':
          return <MessageForward key={idx} resId={part.id} />
        case 'markdown':
          return <MessageMarkdown key={idx} content={part.content} isMe={isMe} message={message} />
        case 'buttons':
          return <MessageButtons key={idx} rows={part.rows} />
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

  /** 头像地址：自己用当前 bot 头像；私聊对方用会话头像；群成员走后端 getAvatarUrl 缓存 */
  const avatarUrl = isMe
    ? (currentBot?.avatar || getAvatar(message.senderId))
    : (!isGroup ? (conversationAvatar || getAvatar(message.senderId)) : getAvatar(message.senderId))

  /** 气泡侧边的发送状态（QQ 风：失败红色感叹号点击重发，发送中转圈） */
  const statusIcon = isMe && message.status === 'sending'
    ? <Spinner size='sm' color='current' className='mb-1 shrink-0' />
    : isMe && message.status === 'failed'
      ? (
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
          className='mb-1 shrink-0 text-qq-badge hover:opacity-80 transition-opacity'
          title='发送失败，点击重试'
        >
          <AlertCircle className='w-4 h-4' />
        </button>
        )
      : null

  return (
    <div
      data-message-id={message.messageId}
      onContextMenu={(e) => openMenu(e, 'message')}
      className={cn(
        'flex items-start gap-2.5 -mx-2 px-2 rounded-lg hover:bg-qq-hover transition-colors',
        isMe ? 'flex-row-reverse' : 'flex-row',
        groupEnd ? 'mb-3' : 'mb-1',
        flashing && 'highlight-msg'
      )}
    >
      {/* 头像列（QQ NT：双侧均显示，组首出现、顶部对齐；其余占位保持缩进） */}
      <div className='w-9 shrink-0'>
        {groupStart && (
          <span
            onContextMenu={isMe ? undefined : (e) => openMenu(e, 'avatar')}
            className={cn('block select-none', !isMe && 'cursor-pointer')}
          >
            <Avatar url={avatarUrl} name={isMe ? (currentBot?.name || '?') : message.senderName} className='w-9 h-9 text-sm' />
          </span>
        )}
      </div>

      <div className={cn('flex flex-col max-w-[62%] xl:max-w-[560px] min-w-0', isMe ? 'items-end' : 'items-start')}>
        {/* 群聊他人：昵称 + 头衔/身份徽章在气泡外上方（灰色小字，QQ NT 式） */}
        {isGroup && !isMe && groupStart && (
          <div className='flex items-center gap-1.5 mb-1 px-0.5 max-w-full'>
            <span className='text-xs text-qq-text-secondary truncate'>
              {senderDisplayName}
            </span>
            {badge}
          </div>
        )}

        <div className={cn('flex items-end gap-1.5 max-w-full', isMe && 'flex-row-reverse')}>
          <div
            title={formatFullTime(message.time)}
            className={cn(
              'bubble min-w-0 max-w-full text-[14px] leading-[1.6] break-words',
              message.recalled && 'opacity-60 border border-qq-badge/60',
              isPureMedia || isForwardOnly
                ? 'overflow-hidden rounded-xl'
                : cn(
                  'px-3 py-[7px]',
                  isMe
                    ? 'bg-qq-bubble-me text-qq-bubble-me-text'
                    : 'bg-qq-bubble-them text-qq-bubble-them-text'
                )
            )}
          >
            {renderMessageContent()}
          </div>
          {statusIcon}
        </div>

        {/* 已撤回标记：气泡下方红色小字（对齐方向跟随 isMe，由父容器 items-end/start 控制） */}
        {message.recalled && (
          <span className='mt-1 text-[11px] text-qq-badge select-none'>消息已撤回</span>
        )}

        {/* 表情回应条：气泡下方小胶囊（QFace + 次数）；QQ 协议下点击胶囊贴/取消贴（自己贴过的蓝色高亮） */}
        {message.reactions && message.reactions.length > 0 && (
          <MessageReactions
            reactions={message.reactions}
            myFaceIds={new Set(message.reactions.map(r => r.faceId).filter(id => hasReacted(message, id)))}
            onReact={isQQProtocol(currentBot?.protocol) && !message.system
              ? (faceId) => void reactMessage(message, faceId)
              : undefined}
          />
        )}
      </div>
    </div>
  )
}

/**
 * memo 化：props 全为原始值/稳定消息对象引用（reducer 对无关消息保持原引用），
 * 新消息追加、toast、右键菜单等无关状态变化时整列消息跳过重渲染；
 * 需要的数据经 MessageViewContext 注入（其 value 不随消息流变化）
 */
export const MessageItem = React.memo(MessageItemInner)
