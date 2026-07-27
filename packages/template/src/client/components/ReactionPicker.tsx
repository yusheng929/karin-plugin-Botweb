import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { qqFacePng } from '../utils'
import { getFaceManifest, useCachedSrc, warmFaceCache } from '../faceCache'

/** manifest 拉取失败时的兜底 QQ 表情 id 列表（经典小黄脸 0-221，与 EmojiPicker 一致） */
const FALLBACK_FACE_IDS = Array.from({ length: 222 }, (_, i) => i)

/** 与视口边缘的最小间距 */
const VIEWPORT_MARGIN = 8

/** QFace 格子：src 走前端 IndexedDB 缓存，未就绪时渲染占位（与 EmojiPicker 的 FaceCell 一致） */
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

interface ReactionPickerProps {
  x: number
  y: number
  onSelect: (faceId: number) => void
  onClose: () => void
}

/** 贴表情选择器：QFace 网格浮层（坐标定位贴边收拢，点击外部 / Esc / 滚动关闭），与右键菜单同模式 */
export const ReactionPicker: React.FC<ReactionPickerProps> = ({ x, y, onSelect, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [faceIds, setFaceIds] = useState<number[] | null>(null)

  // 取本地表情清单并预热静态图缓存（与 EmojiPicker 打开 QFace 页签时一致）
  useEffect(() => {
    getFaceManifest().then((manifest) => {
      const ids = manifest?.static?.length ? manifest.static : FALLBACK_FACE_IDS
      setFaceIds(ids)
      warmFaceCache(ids.map(qqFacePng))
    })
  }, [])

  // 挂载后按实际尺寸校正位置：右/下溢出则翻转到另一侧，仍装不下则贴边收拢
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = x - width
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = y - height
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(window.innerWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN))
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(window.innerHeight - height - VIEWPORT_MARGIN, VIEWPORT_MARGIN))
    setPos({ left, top })
  }, [x, y, faceIds])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', onClose)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className='fixed w-72 max-h-64 overflow-y-auto glass rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-100 z-[400]'
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className='grid grid-cols-8'>
        {(faceIds || FALLBACK_FACE_IDS).map(id => (
          <FaceCell key={id} id={id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
