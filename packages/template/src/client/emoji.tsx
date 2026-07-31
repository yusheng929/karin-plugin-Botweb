import React, { useMemo, useState } from 'react'
import { cn } from './utils'

/**
 * Apple emoji 渲染：文本里的 emoji 字符替换为 emoji-datasource-apple 的 64px PNG
 * （jsDelivr CDN；图片加载失败两级降级：另一候选文件名 → 原字符系统字体兜底）。
 * 用于消息文本/摘要（EmojiText）与 markdown（rehypeAppleEmoji 插件）。
 * Apple 字体本身有再分发限制且无官方 webfont，图片是 Web 端唯一可行的 Apple 样式方案。
 */

/** 图源：emoji-datasource-apple 64px PNG，按 emoji-data fully-qualified 码位序列小写连字符命名 */
const EMOJI_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64'

/**
 * 文本默认呈现（Emoji_Presentation=No）的码位范围：这些字符的 fully-qualified 文件名带 FE0F，
 * 其余 emoji 的文件名不带。漏判/误判由 AppleEmoji 的候选降级链兜底（仅多一次 404）
 */
const TEXT_DEFAULT_RANGES: Array<[number, number]> = [
  [0x23, 0x23], [0x2A, 0x2A], [0x30, 0x39],
  [0xA9, 0xA9], [0xAE, 0xAE], [0x203C, 0x203C], [0x2049, 0x2049], [0x2122, 0x2122], [0x2139, 0x2139],
  [0x2194, 0x2199], [0x21A9, 0x21AA], [0x231A, 0x231B], [0x2328, 0x2328], [0x23CF, 0x23CF],
  [0x23E9, 0x23F3], [0x23F8, 0x23FA], [0x24C2, 0x24C2], [0x25AA, 0x25AB], [0x25B6, 0x25B6],
  [0x25C0, 0x25C0], [0x25FB, 0x25FE], [0x2600, 0x2604], [0x260E, 0x260E], [0x2611, 0x2611],
  [0x2614, 0x2615], [0x2618, 0x2618], [0x261D, 0x261D], [0x2620, 0x2620], [0x2622, 0x2623],
  [0x2626, 0x2626], [0x262A, 0x262A], [0x262E, 0x262F], [0x2638, 0x263A], [0x2640, 0x2640],
  [0x2642, 0x2642], [0x2648, 0x2653], [0x265F, 0x2660], [0x2663, 0x2663], [0x2665, 0x2666],
  [0x2668, 0x2668], [0x267B, 0x267B], [0x267E, 0x267F], [0x2692, 0x2697], [0x2699, 0x2699],
  [0x269B, 0x269C], [0x26A0, 0x26A1], [0x26A7, 0x26A7], [0x26AA, 0x26AB], [0x26B0, 0x26B1],
  [0x26BD, 0x26BE], [0x26C4, 0x26C5], [0x26C8, 0x26C8], [0x26CE, 0x26CF], [0x26D1, 0x26D1],
  [0x26D3, 0x26D4], [0x26E9, 0x26EA], [0x26F0, 0x26F5], [0x26F7,0x26FA], [0x26FD, 0x26FD],
  [0x2702, 0x2702], [0x2705, 0x2705], [0x2708, 0x270D], [0x270F, 0x270F], [0x2712, 0x2712],
  [0x2714, 0x2714], [0x2716, 0x2716], [0x271D, 0x271D], [0x2721, 0x2721], [0x2728, 0x2728],
  [0x2733, 0x2734], [0x2744, 0x2744], [0x2747, 0x2747], [0x274C, 0x274C], [0x274E, 0x274E],
  [0x2753, 0x2755], [0x2757, 0x2757], [0x2763, 0x2764], [0x2795, 0x2797], [0x27A1, 0x27A1],
  [0x27B0, 0x27B0], [0x27BF, 0x27BF], [0x2934, 0x2935], [0x2B05, 0x2B07], [0x2B1B, 0x2B1C],
  [0x2B50, 0x2B50], [0x2B55, 0x2B55], [0x3030, 0x3030], [0x303D, 0x303D], [0x3297, 0x3297],
  [0x3299, 0x3299], [0x1F004, 0x1F004], [0x1F0CF, 0x1F0CF], [0x1F170, 0x1F171], [0x1F17E, 0x1F17F],
  [0x1F18E, 0x1F18E], [0x1F191, 0x1F19A], [0x1F201, 0x1F202], [0x1F21A, 0x1F21A], [0x1F22F, 0x1F22F],
  [0x1F232, 0x1F23A], [0x1F250, 0x1F251], [0x1F3F3, 0x1F3F4], [0x1F440, 0x1F440]
]

const isTextDefault = (cp: number): boolean => {
  let lo = 0
  let hi = TEXT_DEFAULT_RANGES.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [a, b] = TEXT_DEFAULT_RANGES[mid]
    if (cp < a) hi = mid - 1
    else if (cp > b) lo = mid + 1
    else return true
  }
  return false
}

/**
 * 文件名候选（两级）：首选按 emoji-data 命名规则（FE0F 仅跟在文本默认字符后），
 * 备选反转 FE0F 取舍（规则误判时兜底）。均失败则显示原字符
 */
const emojiCodeCandidates = (emoji: string): string[] => {
  const cps = [...emoji].map(c => c.codePointAt(0)!)
  const rule: number[] = []
  const stripped: number[] = []
  const kept: number[] = []
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]
    if (cp === 0xFE0E) continue // 文本变体选择符不参与命名
    if (cp !== 0xFE0F) {
      rule.push(cp)
      stripped.push(cp)
      kept.push(cp)
      continue
    }
    kept.push(cp)
    const prev = cps[i - 1]
    if (prev !== undefined && isTextDefault(prev)) rule.push(cp)
  }
  const hex = (list: number[]) => list.map(cp => cp.toString(16)).join('-')
  const primary = hex(rule)
  const alt = rule.length === stripped.length ? hex(kept) : hex(stripped)
  return alt === primary ? [primary] : [primary, alt]
}

// ---------- 文本拆分 ----------

const KEYCAP = '[#*0-9]\\uFE0F?\\u20E3'
const PICT = '\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:[\\u{E0020}-\\u{E007F}]+)?'
/** 匹配旗帜（RI 对）、键帽序列、Extended_Pictographic 及其 ZWJ 组合/细分旗帜 tag 序列 */
const EMOJI_RE = new RegExp(`\\p{RI}{2}|${KEYCAP}|${PICT}(?:\\u200D${PICT})*`, 'gu')

/** 把文本拆成普通字符串与 emoji 串的交替序列 */
export const splitEmoji = (text: string): Array<string> => {
  const out: string[] = []
  let last = 0
  for (const m of text.matchAll(EMOJI_RE)) {
    const idx = m.index
    if (idx > last) out.push(text.slice(last, idx))
    out.push(m[0])
    last = idx + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** 判断串是否为 emoji（splitEmoji 产物中奇偶交替无法区分，用全匹配判定） */
const WHOLE_RE = new RegExp(`^(?:\\p{RI}{2}|${KEYCAP}|${PICT}(?:\\u200D${PICT})*)$`, 'u')
const isEmojiPart = (s: string): boolean => WHOLE_RE.test(s)

/** 单个 emoji 的 Apple 图片（onError 走候选降级，最终回退原字符） */
export const AppleEmoji: React.FC<{ emoji: string, className?: string }> = ({ emoji, className }) => {
  const candidates = useMemo(() => emojiCodeCandidates(emoji), [emoji])
  const [stage, setStage] = useState(0)
  if (stage >= candidates.length) return <>{emoji}</>
  return (
    <img
      src={`${EMOJI_BASE}/${candidates[stage]}.png`}
      alt={emoji}
      draggable={false}
      loading='lazy'
      onError={() => setStage(s => s + 1)}
      className={cn('emoji-img', className)}
    />
  )
}

/** 含 emoji 的文本渲染：emoji 替换为 Apple 图片，其余原样 */
export const EmojiText: React.FC<{ text: string, className?: string }> = ({ text, className }) => (
  <>
    {splitEmoji(text).map((part, i) => isEmojiPart(part)
      ? <AppleEmoji key={i} emoji={part} className={className} />
      : <React.Fragment key={i}>{part}</React.Fragment>)}
  </>
)

// ---------- markdown（rehype 插件） ----------

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** 文本 -> hast 节点序列（emoji 段换成 img 元素，alt 携带原字符供 components.img 渲染 AppleEmoji） */
const textToHast = (value: string): HastNode[] => {
  const out: HastNode[] = []
  for (const part of splitEmoji(value)) {
    if (isEmojiPart(part)) {
      out.push({
        type: 'element',
        tagName: 'img',
        properties: { className: ['emoji-img'], alt: part },
        children: []
      })
    } else {
      out.push({ type: 'text', value: part })
    }
  }
  return out
}

/**
 * rehype 插件：把 markdown 文本节点里的 emoji 替换为 img.emoji-img 元素。
 * 手写树遍历（pnpm 严格隔离，不引 transitive 的 unist-util-visit）
 */
export const rehypeAppleEmoji = () => (tree: HastNode) => {
  const walk = (node: HastNode) => {
    if (!node.children) return
    const out: HastNode[] = []
    for (const child of node.children) {
      if (child.type === 'text' && child.value) {
        out.push(...textToHast(child.value))
      } else {
        // 已生成的/原有的 img 不再深入，其余元素递归处理子节点
        if (!(child.type === 'element' && child.tagName === 'img')) walk(child)
        out.push(child)
      }
    }
    node.children = out
  }
  walk(tree)
}
