import React, { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useChat } from '../state/chat'
import { resolveMediaSrc, cn } from '../utils'

/** markdown 协议族（各平台语法不同，渲染前按族预处理） */
type MdFamily = 'qq' | 'telegram' | 'discord'

/** 按 karin 适配器 protocol 判定 markdown 协议族，未知协议按 GFM 通用渲染 */
const mdFamily = (protocol: string | undefined): MdFamily => {
  const p = (protocol || '').toLowerCase()
  if (/telegram|(^|[^a-z])tg([^a-z]|$)/.test(p)) return 'telegram'
  if (/discord|(^|[^a-z])dc([^a-z]|$)/.test(p)) return 'discord'
  return 'qq'
}

/** 防 XSS：rehype-raw 会放行原始 HTML，先把用户内容里的 `<` 全部转义，只放行预处理注入的标签 */
const escapeHtml = (s: string) => s.replace(/</g, '&lt;')

/** Telegram MarkdownV2 风格：||剧透|| __下划线__ ~删除线~ *粗体*（单星在 commonmark 里是斜体，需转双星） */
const preprocessTelegram = (s: string): string => {
  return s
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="md-spoiler">$1</span>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/(?<!~)~([^~\n]+)~(?!~)/g, '~~$1~~')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '**$1**')
}

/** Discord 风格：||剧透|| 与行首 -# 小字（subtext），其余基本兼容 GFM */
const preprocessDiscord = (s: string): string => {
  return s
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="md-spoiler">$1</span>')
    .replace(/^-#[ \t]+(.+)$/gm, '<span class="md-subtext">$1</span>')
}

const preprocess = (content: string, family: MdFamily): string => {
  const escaped = escapeHtml(content)
  if (family === 'telegram') return preprocessTelegram(escaped)
  if (family === 'discord') return preprocessDiscord(escaped)
  return escaped
}

/** 链接新窗口打开；图片防盗链 + base64:// 归一（与消息图片一致） */
const mdComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target='_blank' rel='noreferrer'>{children}</a>
  ),
  img: ({ src, alt }) => (
    <img
      src={resolveMediaSrc(String(src || ''))}
      alt={alt || ''}
      referrerPolicy='no-referrer'
      className='md-img'
    />
  )
}

/**
 * markdown 消息渲染：react-markdown + GFM 为基础，按 bot 协议族预处理方言语法。
 * isMe 时附加 md-me 类（自己蓝气泡白字，链接等着色跟随气泡）
 */
export const MessageMarkdown: React.FC<{ content: string, isMe?: boolean }> = ({ content, isMe }) => {
  const { currentBot } = useChat()
  const family = mdFamily(currentBot?.protocol)
  const source = useMemo(() => preprocess(content, family), [content, family])

  return (
    <div className={cn('md-body', isMe && 'md-me')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={mdComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
