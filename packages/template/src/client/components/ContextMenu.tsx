import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../utils'

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
  onClose: () => void
}

/** 菜单与视口边缘的最小间距 */
const VIEWPORT_MARGIN = 8

/** 通用右键菜单：坐标定位（贴视口边缘时自动翻转/收拢），点击外部 / Esc / 滚动关闭 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 挂载后按实际尺寸校正位置：右/下溢出则翻转到光标另一侧，仍装不下则贴边收拢
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = x - width
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = y - height
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(window.innerWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN))
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(window.innerHeight - height - VIEWPORT_MARGIN, VIEWPORT_MARGIN))
    setPos({ left, top })
  }, [x, y, items.length])

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
      ref={menuRef}
      className='fixed w-44 glass rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100 z-[400]'
      style={{ left: pos.left, top: pos.top }}
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
            'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-lg transition-colors hover:bg-qq-hover',
            item.danger ? 'text-qq-badge' : 'text-qq-text'
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
