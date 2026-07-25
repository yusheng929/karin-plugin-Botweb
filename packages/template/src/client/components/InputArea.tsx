import React, { useState, useRef, useEffect } from 'react'
import {
  Smile,
  Paperclip,
  AtSign,
  Reply,
  X,
  Send,
  Image as ImageIcon,
  File as FileIcon
} from 'lucide-react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { MessageElement } from '../../core/types'
import { getMessageSummary, isQQProtocol, qqFaceGif, qqFacePng, cn } from '../utils'
import { getCachedFaceSrc } from '../faceCache'
import { EmojiPicker } from './EmojiPicker'
import { Avatar } from './Avatar'

/** 内联图片的大小上限（与 chat.tsx 的文件发送上限一致，base64 内联发送，过大会撑爆请求） */
const MAX_FILE_SIZE = 20 * 1024 * 1024

export const InputArea: React.FC = () => {
  const { currentBot, currentConversation, sendMessage, handleFiles, groupMembers, resolveAvatar } = useChat()
  const { replyTo, setReplyTo, pendingMention, setPendingMention, pendingImages, setPendingImages, setToast } = useUi()
  /** 编辑器是否为空（驱动发送按钮禁用态，contenteditable 为非受控组件，需手动同步） */
  const [isEmpty, setIsEmpty] = useState(true)
  const [atMenu, setAtMenu] = useState<{ filter: string } | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  /** 附件小菜单（图片/文件，TG 风格） */
  const [showAttach, setShowAttach] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 文件选择器的打开来源：image=图片（内联进输入框）/ file=文件（直接发送） */
  const fileModeRef = useRef<'image' | 'file'>('file')
  /** 编辑器内联图片的 dataURL 表：imageId -> dataURL（img 标签只挂 id，发送时按 id 取回） */
  const pendingImagesRef = useRef(new Map<string, string>())
  const imgSeqRef = useRef(0)
  const editorRef = useRef<HTMLDivElement>(null)

  const isGroup = currentConversation?.scene === 'group'
  /** 当前 bot 为 QQ 协议实现时支持发送 QQ 小黄脸 */
  const isQQ = isQQProtocol(currentBot?.protocol)

  // 输入内容（文本/表情/内联图片）为空时禁用
  const isDisabled = !currentConversation || isEmpty

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

  // 附件菜单：点击其他位置关闭
  useEffect(() => {
    if (!showAttach) return
    const close = () => setShowAttach(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showAttach])

  // 切换会话：清空编辑器与内联图片、收起 emoji 面板和 @ 菜单（依赖会话 key 而非对象：消息到达会使会话对象重建，但 key 不变）
  const conversationKey = currentConversation?.key
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = ''
    pendingImagesRef.current.clear()
    setIsEmpty(true)
    setShowEmoji(false)
    setAtMenu(null)
  }, [conversationKey])

  // 右键菜单「@ TA」：向输入框追加 @userId（复用现有 @ 解析逻辑）
  useEffect(() => {
    if (!pendingMention) return
    insertNode(document.createTextNode(`@${pendingMention} `))
    setPendingMention(null)
  }, [pendingMention, setPendingMention])

  // 拖拽进窗口的图片：内联进输入框（与文本混排）
  useEffect(() => {
    if (!pendingImages || pendingImages.length === 0) return
    for (const file of pendingImages) insertImageFile(file)
    setPendingImages(null)
  }, [pendingImages, setPendingImages])

  const memberName = (userId: string) => {
    const member = groupMembers.find(m => String(m.userId) === String(userId))
    return member ? (member.card || member.nick) : undefined
  }

  /** 同步空态（文本为空且没有内联表情/图片即为空） */
  const syncEmpty = () => {
    const editor = editorRef.current
    if (!editor) return
    setIsEmpty(!editor.textContent?.trim() && !editor.querySelector('img'))
  }

  /** 光标移到编辑器末尾 */
  const moveCaretToEnd = () => {
    const editor = editorRef.current
    if (!editor) return
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  /** 在光标处插入节点（无光标时追加到末尾），插入后聚焦并把光标移到节点之后 */
  const insertNode = (node: Node) => {
    const editor = editorRef.current
    if (!editor) return
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(node)
      range.setStartAfter(node)
      range.setEndAfter(node)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editor.appendChild(node)
      moveCaretToEnd()
    }
    editor.focus()
    syncEmpty()
  }

  /** 在光标处插入 emoji（unicode 文本，随文本发送） */
  const insertEmoji = (emoji: string) => {
    insertNode(document.createTextNode(emoji))
  }

  /** 在光标处插入 QQ 小黄脸（内联图片，发送时解析为 face 元素，可与文本/图片混排）。
   *  动图只有约 271 个而静态图 359 个，gif 缺失时降级为 png（与 MessageFace 一致） */
  const insertFace = (id: number) => {
    void (async () => {
      const img = document.createElement('img')
      img.dataset.faceId = String(id)
      img.alt = `[表情:${id}]`
      img.draggable = false
      img.onerror = () => {
        img.onerror = null
        void getCachedFaceSrc(qqFacePng(id)).then(png => { img.src = png })
      }
      img.src = await getCachedFaceSrc(qqFaceGif(id))
      insertNode(img)
    })()
  }

  /** 图片文件内联进输入框（图文混排，发送时按出现顺序解析为 text/image 元素序列） */
  const insertImageFile = (file: File) => {
    void (async () => {
      if (file.size > MAX_FILE_SIZE) {
        setToast({ message: `图片「${file.name}」超过 20MB，无法发送`, type: 'error' })
        return
      }
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(file)
      })
      if (!dataUrl) return
      const id = `img-${Date.now()}-${imgSeqRef.current++}`
      pendingImagesRef.current.set(id, dataUrl)
      const img = document.createElement('img')
      img.src = dataUrl
      img.dataset.imageId = id
      img.alt = file.name
      img.draggable = false
      img.className = 'rich-image'
      insertNode(img)
    })()
  }

  /** 把编辑器内容解析为元素序列（text 与 face/image 按出现顺序交替） */
  const parseEditor = (): MessageElement[] => {
    const root = editorRef.current
    if (!root) return []
    const elements: MessageElement[] = []
    let textBuf = ''
    const flush = () => {
      if (textBuf) {
        elements.push({ type: 'text', text: textBuf })
        textBuf = ''
      }
    }
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        textBuf += node.textContent
      } else if (node instanceof HTMLImageElement && node.dataset.faceId) {
        flush()
        elements.push({ type: 'face', id: Number(node.dataset.faceId) })
      } else if (node instanceof HTMLImageElement && node.dataset.imageId) {
        // 内联图片：dataURL 存 pendingImagesRef（避免把大体积 base64 塞进 DOM 属性）
        const dataUrl = pendingImagesRef.current.get(node.dataset.imageId)
        if (dataUrl) {
          flush()
          elements.push({ type: 'image', file: dataUrl })
        }
      } else if (node instanceof HTMLBRElement) {
        textBuf += '\n'
      } else {
        // div/p 等块级换行容器：前面有内容且未换行时补一个 \n
        if (node !== root && textBuf && !textBuf.endsWith('\n')) textBuf += '\n'
        node.childNodes.forEach(walk)
      }
    }
    root.childNodes.forEach(walk)
    flush()
    return elements
  }

  /** 拆分文本中的 @：规则为 @ID + 空格，且 ID 在当前群成员中（或为 all） */
  const splitMentions = (text: string): MessageElement[] => {
    if (!isGroup) return [{ type: 'text', text }]
    const out: MessageElement[] = []
    let lastIndex = 0
    const atRegex = /@([^\s@]+)\s/g
    let match
    while ((match = atRegex.exec(text)) !== null) {
      const targetId = match[1]
      const isMemberMatch = targetId === 'all' || groupMembers.some((m) => String(m.userId) === targetId)
      if (!isMemberMatch) continue
      if (match.index > lastIndex) out.push({ type: 'text', text: text.slice(lastIndex, match.index) })
      out.push({ type: 'at', targetId, name: targetId === 'all' ? '全体成员' : memberName(targetId) })
      lastIndex = atRegex.lastIndex
    }
    if (lastIndex < text.length) out.push({ type: 'text', text: text.slice(lastIndex) })
    return out
  }

  const handleSend = () => {
    if (isDisabled || !currentConversation) return

    // 编辑器内容（text/face/image 混排）解析后再拆 @；回复元素放头部
    const content: MessageElement[] = []
    for (const el of parseEditor()) {
      if (el.type === 'text') content.push(...splitMentions(el.text))
      else content.push(el)
    }
    const finalContent: MessageElement[] = [
      ...replyTo ? [{ type: 'reply' as const, messageId: replyTo.messageId }] : [],
      ...content
    ]

    if (finalContent.length === 0) return

    // 点击发送立即清空输入；发送结果由消息的 status（sending/failed）和 toast 体现
    if (editorRef.current) editorRef.current.innerHTML = ''
    pendingImagesRef.current.clear()
    setIsEmpty(true)
    setReplyTo(null)
    setShowEmoji(false)
    void sendMessage(finalContent)
  }

  /** 光标前的纯文本（用于 @ 触发检测） */
  const getTextBeforeCaret = (): string => {
    const editor = editorRef.current
    const sel = window.getSelection()
    if (!editor || !sel || sel.rangeCount === 0) return ''
    const range = sel.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return ''
    const pre = range.cloneRange()
    pre.selectNodeContents(editor)
    pre.setEnd(range.startContainer, range.startOffset)
    return pre.toString()
  }

  const insertAt = (userId: string) => {
    const editor = editorRef.current
    if (!editor) return
    const sel = window.getSelection()
    // 光标在文本节点内：把正在输入的 @filter 替换为 @userId + 空格
    if (sel && sel.rangeCount > 0 && sel.anchorNode && editor.contains(sel.anchorNode) && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      const node = sel.anchorNode
      const text = node.textContent || ''
      const before = text.slice(0, sel.anchorOffset).replace(/@\S*$/, `@${userId} `)
      const after = text.slice(sel.anchorOffset)
      node.textContent = before + after
      const range = document.createRange()
      range.setStart(node, before.length)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      editor.focus()
      syncEmpty()
    } else {
      insertNode(document.createTextNode(`@${userId} `))
    }
    setAtMenu(null)
  }

  const handleInput = () => {
    syncEmpty()

    if (isGroup) {
      const textBeforeCursor = getTextBeforeCaret()
      const lastAt = textBeforeCursor.lastIndexOf('@')

      // 只有当 @ 后面没有空格，且是在最后一个词的位置时才触发
      if (lastAt !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAt + 1)
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          setShowEmoji(false)
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
      const files = Array.from(e.clipboardData.files)
      // 图片内联进输入框（与文本混排，可直接配文字），其他文件直接发送
      for (const file of files.filter(f => f.type.startsWith('image/'))) insertImageFile(file)
      const others = files.filter(f => !f.type.startsWith('image/'))
      if (others.length > 0) void handleFiles(others)
      return
    }
    // 只粘贴纯文本，避免把富文本/HTML 带进编辑器
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) insertNode(document.createTextNode(text))
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

  /** 打开文件选择器（image=图片内联进输入框，file=文件直接发送） */
  const pickFiles = (mode: 'image' | 'file') => {
    setShowAttach(false)
    fileModeRef.current = mode
    if (fileInputRef.current) {
      fileInputRef.current.accept = mode === 'image' ? 'image/*' : '*/*'
      fileInputRef.current.click()
    }
  }

  return (
    <footer className='px-4 pb-3 pt-1 shrink-0 relative bg-tg-chat-bg'>
      {/* Emoji 面板 */}
      {showEmoji && (
        <EmojiPicker
          onSelect={insertEmoji}
          onSelectFace={isQQ ? insertFace : undefined}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {/* At Menu */}
      {atMenu && isGroup && filteredMembers.length > 0 && (
        <div className='absolute bottom-full mb-2 left-4 w-64 max-h-56 overflow-y-auto rounded-xl shadow-xl border border-tg-border bg-tg-bg z-50 animate-in fade-in slide-in-from-bottom-2 duration-150'>
          <div className='p-1.5'>
            <div className='px-3 py-1.5 text-xs text-tg-text-secondary flex items-center gap-1.5'>
              <AtSign className='w-3 h-3' /> 选择群成员
            </div>
            {filteredMembers.map((member, idx: number) => (
              <button
                key={member.userId}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => insertAt(member.userId)}
                className={cn(
                  'w-full flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors',
                  idx === selectedIndex ? 'bg-tg-hover' : ''
                )}
              >
                <Avatar
                  url={resolveAvatar(member.userId)}
                  name={('card' in member && member.card) || member.nick || member.userId}
                  className='w-7 h-7 text-xs shrink-0'
                />
                <div className='flex-1 min-w-0'>
                  <div className='text-sm truncate'>{('card' in member && member.card) || member.nick || member.userId}</div>
                  <div className='text-xs text-tg-text-secondary'>{member.userId}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 附件菜单（TG 风格：图片内联进输入框，文件直接发送） */}
      {showAttach && (
        <div
          className='absolute bottom-full mb-2 left-4 w-44 rounded-xl shadow-xl border border-tg-border bg-tg-bg z-50 p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150'
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => pickFiles('image')}
            className='w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-tg-text hover:bg-tg-hover transition-colors'
          >
            <ImageIcon className='w-4 h-4 text-tg-text-secondary' /> 图片
          </button>
          <button
            onClick={() => pickFiles('file')}
            className='w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-tg-text hover:bg-tg-hover transition-colors'
          >
            <FileIcon className='w-4 h-4 text-tg-text-secondary' /> 文件
          </button>
        </div>
      )}

      <div className='flex items-end gap-2'>
        {/* 输入卡片 */}
        <div className='flex-1 flex flex-col rounded-xl bg-tg-bg shadow-sm overflow-hidden'>
          {/* 待回复状态 */}
          {replyTo && (
            <div className='flex items-center gap-2 px-3 py-1.5 border-b border-tg-border text-[13px]'>
              <Reply className='w-4 h-4 shrink-0 text-tg-blue' />
              <span className='flex-1 min-w-0 truncate border-l-2 border-tg-blue pl-2'>
                <span className='text-tg-blue font-medium'>{replyTo.senderName}</span>
                <span className='text-tg-text-secondary'> {getMessageSummary(replyTo.elements)}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className='p-1 rounded-full hover:bg-tg-hover transition-colors shrink-0 text-tg-text-secondary'
                title='取消回复'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          )}

          <div className='flex items-end'>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setAtMenu(null)
                setShowAttach(!showAttach)
              }}
              className={cn(
                'p-3 transition-colors shrink-0',
                showAttach ? 'text-tg-blue' : 'text-tg-text-secondary hover:text-tg-blue'
              )}
              title='附件'
            >
              <Paperclip className='w-6 h-6' />
            </button>
            {/* 富文本输入框：QQ 表情/图片以内联图片形式与文本混排（发送时解析为 text/face/image 元素序列） */}
            <div
              ref={editorRef}
              contentEditable={!!currentConversation}
              onInput={handleInput}
              onKeyDown={handleKeyPress}
              onPaste={handlePaste}
              data-placeholder={!currentConversation ? '选择一个会话开始聊天' : '消息'}
              className={cn(
                'rich-input flex-1 py-3.5 text-sm outline-none max-h-32 min-h-[24px] overflow-y-auto whitespace-pre-wrap break-words',
                !currentConversation && 'opacity-50 cursor-not-allowed'
              )}
            />
            <button
              onClick={() => {
                setAtMenu(null)
                setShowEmoji(!showEmoji)
              }}
              className={cn(
                'p-3 transition-colors shrink-0',
                showEmoji ? 'text-tg-blue' : 'text-tg-text-secondary hover:text-tg-blue'
              )}
              title='表情'
            >
              <Smile className='w-6 h-6' />
            </button>

            <input
              type='file'
              ref={fileInputRef}
              className='hidden'
              multiple
              onChange={(e) => {
                // 先拷贝成数组再清空 input：input.files 的 FileList 是活动的，清空 value 后已捕获的 FileList 会变空
                const files = Array.from(e.target.files || [])
                e.target.value = ''
                if (files.length === 0) return
                // image 模式只内联图片文件（用户可能改选其他类型，非图片走直发兜底）
                if (fileModeRef.current === 'image') {
                  for (const file of files) {
                    if (file.type.startsWith('image/')) insertImageFile(file)
                    else void handleFiles([file])
                  }
                } else {
                  void handleFiles(files)
                }
              }}
            />
          </div>
        </div>

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={isDisabled}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all shadow-sm',
            isDisabled
              ? 'bg-tg-hover text-tg-text-secondary cursor-not-allowed'
              : 'bg-tg-blue text-white hover:bg-tg-blue-hover active:scale-95'
          )}
          title='发送'
        >
          <Send className='w-5 h-5 -ml-0.5' />
        </button>
      </div>
    </footer>
  )
}
