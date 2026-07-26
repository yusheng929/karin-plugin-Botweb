import React, { useEffect, useState } from 'react'
import { Smile } from 'lucide-react'
import { qqFacePng, cn } from '../utils'
import { getFaceManifest, useCachedSrc, warmFaceCache } from '../faceCache'

/** 常用 emoji 分组（unicode 表情，随文本发送，不依赖协议端的表情能力） */
const EMOJI_GROUPS: { name: string, emojis: string[] }[] = [
  {
    name: '笑脸与情感',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😋', '😜', '🤪', '😝', '🤗', '🤔', '🤫', '🤭', '😏', '😴', '🥱', '😪', '😌', '😛', '🤤',
      '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕',
      '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
      '😣', '😞', '😓', '😩', '😫', '🥹', '😤', '😡', '😠', '🤬', '💀', '💩', '🤡', '👻'
    ]
  },
  {
    name: '手势与人物',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🫶', '👉',
      '👈', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '👋', '🤙', '✍️', '👀', '👄', '👅', '👂', '👃', '🫡'
    ]
  },
  {
    name: '动物与自然',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
      '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦉', '🐴', '🦄', '🐝', '🦋', '🐌', '🐢', '🐍', '🐙',
      '🦑', '🦐', '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌲', '🌳',
      '🌈', '☀️', '🌙', '⭐', '⚡', '🔥', '❄️', '☔', '🌊'
    ]
  },
  {
    name: '美食',
    emojis: [
      '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🌽',
      '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🍜', '🍲', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍛', '🍝',
      '🍦', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🥤', '🧋', '🍺', '☕', '🍵', '🥛'
    ]
  },
  {
    name: '符号与物品',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘',
      '💯', '✨', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '⚽', '🏀', '🏓', '🎮', '🎲', '🎯', '🎸', '🎤',
      '🎧', '📱', '💻', '📷', '🔒', '🔑', '💡', '📌', '✏️', '📖', '💰', '💎', '🚀', '✈️', '🚗', '⏰',
      '🔔', '🎵'
    ]
  }
]

interface EmojiPickerProps {
  /** 选中 emoji（插入输入框），面板保持打开 */
  onSelect: (emoji: string) => void
  /** 选中 QQ 小黄脸（仅 QQ 协议 bot 传入，面板会出现「QQ表情」页签） */
  onSelectFace?: (id: number) => void
  onClose: () => void
}

/** manifest 拉取失败时的兜底 QQ 表情 id 列表（经典小黄脸 0-221） */
const FALLBACK_FACE_IDS = Array.from({ length: 222 }, (_, i) => i)

/** QFace 格子：src 走前端 IndexedDB 缓存，未就绪时渲染占位 */
const FaceCell: React.FC<{ id: number, onSelect: (id: number) => void }> = ({ id, onSelect }) => {
  const src = useCachedSrc(qqFacePng(id))
  const [error, setError] = useState(false)
  if (error) return null
  return (
    <button
      onClick={() => onSelect(id)}
      className='p-1 rounded-lg transition-colors hover:bg-qq-hover'
      title={`[表情:${id}]`}
    >
      {src
        ? (
          <img
            src={src}
            alt={`[表情:${id}]`}
            loading='lazy'
            onError={() => setError(true)}
            className='w-7 h-7 object-contain'
          />
          )
        : <span className='block w-7 h-7 rounded bg-qq-hover animate-pulse' />}
    </button>
  )
}

/** QFace 页签图标：与表情格子一样走前端 IndexedDB 缓存，不直拼 URL */
const QFaceTabIcon: React.FC = () => {
  const src = useCachedSrc(qqFacePng(14))
  if (!src) return <span className='block w-4 h-4 rounded bg-qq-hover animate-pulse' />
  return <img src={src} alt='' className='w-4 h-4 object-contain' />
}

/** Emoji 选择面板：横向分类（Emoji / QFace），点击外部 / Esc 关闭 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onSelectFace, onClose }) => {
  const [tab, setTab] = useState<'emoji' | 'qqface'>('emoji')
  const [faceIds, setFaceIds] = useState<number[] | null>(null)

  // 打开 QQ 表情页签时取本地表情清单（内存缓存），并后台预热全部静态图进 IndexedDB
  useEffect(() => {
    if (!onSelectFace || faceIds !== null) return
    getFaceManifest().then((manifest) => {
      const ids = manifest?.static?.length ? manifest.static : FALLBACK_FACE_IDS
      setFaceIds(ids)
      warmFaceCache(ids.map(qqFacePng))
    })
  }, [onSelectFace, faceIds])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      {/* 透明遮罩：点击外部关闭 */}
      <div className='fixed inset-0 z-40' onMouseDown={onClose} />
      <div
        // preventDefault：避免点击面板时输入框失焦丢失光标位置
        onMouseDown={(e) => e.preventDefault()}
        className='absolute bottom-full mb-2 left-3 w-80 max-h-72 overflow-hidden rounded-xl shadow-2xl glass z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col'
      >
        {/* 横向分类条：Emoji 在前，QQ 协议 bot 追加 QFace */}
        <div className='flex items-center gap-1 px-2 py-1.5 border-b border-qq-border shrink-0 overflow-x-auto no-scrollbar'>
          <button
            onClick={() => setTab('emoji')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors',
              tab === 'emoji' ? 'bg-qq-blue/15 text-qq-blue font-medium' : 'text-qq-text-secondary hover:bg-qq-hover'
            )}
          >
            <Smile className='w-4 h-4' />
            Emoji
          </button>
          {onSelectFace && (
            <button
              onClick={() => setTab('qqface')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors',
                tab === 'qqface' ? 'bg-qq-blue/15 text-qq-blue font-medium' : 'text-qq-text-secondary hover:bg-qq-hover'
              )}
            >
              <QFaceTabIcon />
              QFace
            </button>
          )}
        </div>

        <div className='flex-1 overflow-y-auto'>
          {tab === 'qqface' && onSelectFace
            ? (
              <div className='grid grid-cols-8 p-2'>
                {(faceIds || FALLBACK_FACE_IDS).map(id => (
                  <FaceCell key={id} id={id} onSelect={onSelectFace} />
                ))}
              </div>
              )
            : EMOJI_GROUPS.map(group => (
              <div key={group.name} className='p-2 pb-1'>
                <div className='px-2 py-1 text-xs text-qq-text-secondary'>
                  {group.name}
                </div>
                <div className='grid grid-cols-8'>
                  {group.emojis.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => onSelect(emoji)}
                      className='p-1.5 text-xl leading-none rounded-lg transition-colors hover:bg-qq-hover'
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
