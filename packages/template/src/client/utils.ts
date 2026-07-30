import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MessageElement } from '../core/types'
import { BASE } from './api'

export function cn (...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * QQ 平台能力判定（经典小黄脸/表情回应/贴表情等 QQ NT 特性）。
 * 优先看 platform === 'qq' 且排除 qqbot（官方机器人 API 不支持这些特性）；
 * milky 的 protocol 是实现名（Yogurt 等）无法枚举，所以不能再按协议名白名单判定。
 * platform 缺失（旧后端）时回退到协议名白名单
 */
const QQ_FACE_PROTOCOLS = ['icqq', 'gocq-http', 'napcat', 'oicq', 'llonebot', 'lagrange']

/** 当前 bot 是否具备 QQ NT 特性（决定能否发 qqface / 表情面板 QFace 页签 / 表情回应） */
export const isQQProtocol = (bot?: { protocol?: string, platform?: string } | null) => {
  if (!bot) return false
  if (bot.platform) return bot.platform === 'qq' && bot.protocol !== 'qqbot'
  return !!bot.protocol && QQ_FACE_PROTOCOLS.includes(bot.protocol)
}

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
 * 复制文本到剪贴板：优先 Clipboard API（仅安全上下文可用：https/localhost），
 * http 局域网访问或权限拒绝时降级为隐藏 textarea + execCommand
 */
export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch { /* 降级 execCommand */ }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  // 不可见但可被选中（display:none 的元素无法 select）
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand copy 被浏览器拒绝')
  } finally {
    ta.remove()
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
    await copyTextToClipboard(src)
    return 'url'
  }
}

/**
 * NapCat 等实现的 markdown 消息会额外携带一段纯文本兜底（markdown 的明文形态），
 * 特征为紧跟在 markdown 元素之后的 text 元素；直接渲染会双重显示。
 * 渲染/摘要/复制统一经此过滤（仅展示层过滤，原始数据不动，「原始事件」仍可见完整元素）
 */
export const visibleElements = (elements: MessageElement[]): MessageElement[] =>
  elements.filter((el, i) => !(el.type === 'text' && i > 0 && elements[i - 1].type === 'markdown'))

export const getMessageSummary = (elements?: MessageElement[]): string => {
  if (!elements || elements.length === 0) return '[暂无消息]'

  return visibleElements(elements).map((p) => {
    switch (p.type) {
      case 'text': return p.text
      case 'image': return '[图片]'
      case 'at': return `@${p.name || p.targetId}`
      case 'face': return `[表情:${p.id}]`
      case 'reply': return '' // 摘要不显示引用标记
      case 'file': return `[文件]${p.name || ''}`
      case 'video': return '[视频]'
      case 'record': return '[语音]'
      case 'json': return '[JSON]'
      case 'markdown': return p.content
      case 'buttons': return '[按钮]'
      case 'other': return p.text || '[暂不支持的消息]'
      default: return '[消息]'
    }
  }).join(' ').trim()
}
