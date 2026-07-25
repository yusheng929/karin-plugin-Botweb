import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MessageElement } from '../core/types'
import { BASE } from './api'

export function cn (...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * QQ 协议实现（onebot 系协议端，face 元素为 QQ 小黄脸数字 id）：
 * qqbot 为官方机器人 API，不支持经典小黄脸，不计入
 */
const QQ_FACE_PROTOCOLS = ['icqq', 'gocq-http', 'napcat', 'oicq', 'llonebot', 'lagrange']

/** 当前 bot 是否为 QQ 协议实现（决定能否发送 qqface / 表情面板是否展示 qqface） */
export const isQQProtocol = (protocol?: string) => !!protocol && QQ_FACE_PROTOCOLS.includes(protocol)

/** QQ 小黄脸本地图源（core 托管，见 core/scripts/download-faces.mjs） */
export const qqFaceGif = (id: number) => `${BASE}/faces/gif/s${id}.gif`
export const qqFacePng = (id: number) => `${BASE}/faces/static/s${id}.png`

/**
 * 时间戳归一化为毫秒：大于 1e12 视为已是毫秒原样返回，否则按秒乘 1000
 *（部分来源如发送接口返回、本地 Date.now() 已是毫秒）
 */
export const toMillis = (time: number) => time > 1e12 ? time : time * 1000

export const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * karin 的 base64 媒体为 `base64://xxx` 格式，渲染时转换为 data URL
 *（浏览器按实际内容嗅探格式，gif 也能正常动）
 */
export const resolveMediaSrc = (file: string) =>
  file.startsWith('base64://') ? `data:image/jpeg;base64,${file.slice('base64://'.length)}` : file

/** 下载文件：fetch blob → a[download]，跨域等失败时降级 window.open */
export const downloadFile = async (url: string, name?: string) => {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name || 'file'
    a.click()
    URL.revokeObjectURL(objectUrl)
  } catch (e) {
    window.open(url, '_blank')
  }
}

/**
 * 复制图片到剪贴板：fetch blob → ClipboardItem（非 png 经 canvas 转 png）。
 * 失败时降级复制图片地址文本。返回实际复制的内容类型。
 */
export const copyImageToClipboard = async (file: string): Promise<'image' | 'url'> => {
  const src = resolveMediaSrc(file)
  try {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    let blob = await res.blob()
    if (blob.type !== 'image/png') {
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
      )
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'image'
  } catch (e) {
    await navigator.clipboard.writeText(src)
    return 'url'
  }
}

export const getMessageSummary = (elements?: MessageElement[]): string => {
  if (!elements || elements.length === 0) return '[暂无消息]'

  return elements.map((p) => {
    switch (p.type) {
      case 'text': return p.text
      case 'image': return '[图片]'
      case 'at': return `@${p.name || p.targetId}`
      case 'face': return `[表情:${p.id}]`
      case 'reply': return '' // 摘要不显示引用标记
      case 'file': return `[文件]${p.name || ''}`
      case 'video': return '[视频]'
      case 'record': return '[语音]'
      case 'other': return p.text || '[暂不支持的消息]'
      default: return '[消息]'
    }
  }).join(' ').trim()
}
