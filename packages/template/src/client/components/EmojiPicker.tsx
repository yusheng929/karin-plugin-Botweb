import React, { useEffect } from 'react'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

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
  isDark: boolean
  /** 选中 emoji（插入输入框），面板保持打开 */
  onSelect: (emoji: string) => void
  onClose: () => void
}

/** Emoji 选择面板：分组网格，点击外部 / Esc 关闭 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({ isDark, onSelect, onClose }) => {
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
        className={cn(
          'absolute bottom-full mb-2 left-0 w-80 max-h-64 overflow-y-auto rounded-2xl shadow-2xl border backdrop-blur-3xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200',
          isDark ? 'bg-gray-900/90 border-white/10' : 'bg-white/90 border-black/5'
        )}
      >
        {EMOJI_GROUPS.map(group => (
          <div key={group.name} className='p-2 pb-1'>
            <div className={cn('px-2 py-1 text-[10px] font-black uppercase tracking-widest opacity-40', isDark ? 'text-gray-300' : 'text-gray-600')}>
              {group.name}
            </div>
            <div className='grid grid-cols-8'>
              {group.emojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onSelect(emoji)}
                  className='p-1.5 text-xl leading-none rounded-lg transition-all hover:bg-mac-blue/15 hover:scale-110 active:scale-95'
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
