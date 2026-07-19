import React, { useEffect } from 'react'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  isDark: boolean
  onClose: () => void
}

/** 通用右键菜单：坐标定位，点击外部 / Esc / 滚动关闭 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, isDark, onClose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', onClose)
    window.addEventListener('blur', onClose)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  if (items.length === 0) return null

  return (
    <div
      className={cn('fixed w-44 rounded-2xl shadow-2xl border p-1 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-2xl z-[400]',
        isDark ? 'bg-gray-800/80 border-white/10' : 'bg-white/80 border-black/5')}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => {
            onClose()
            item.onClick()
          }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-colors',
            item.danger
              ? 'text-red-500 hover:bg-red-500 hover:text-white'
              : (isDark ? 'hover:bg-mac-blue text-white' : 'hover:bg-mac-blue hover:text-white text-mac-text-main')
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
