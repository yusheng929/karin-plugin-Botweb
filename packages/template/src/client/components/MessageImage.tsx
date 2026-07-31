import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { useMessageView } from './messageView'
import { resolveMediaSrc, downloadFile, cn } from '../utils'

/** 消息图片：防盗链 no-referrer、限宽限高、加载失败占位、点击遮罩看原图（支持右键菜单与下载按钮）。
 *  消息气泡与 markdown（MessageMarkdown 的 img）共用；className 可附加场景样式（如 md-img 限宽） */
export const MessageImage: React.FC<{ file: string, isPureMedia?: boolean, className?: string }> = ({ file, isPureMedia = false, className }) => {
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
        onClick={(e) => {
          e.stopPropagation()
          setZoom(true)
        }}
        className={cn(
          'max-w-[320px] max-h-[320px] object-contain cursor-zoom-in',
          isPureMedia ? 'block' : 'rounded-lg my-1',
          className
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
