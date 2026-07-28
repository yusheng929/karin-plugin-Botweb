import React, { useMemo } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useMessageView } from './messageView'
import { resolveMediaSrc, cn } from '../utils'
import { parseSpecialLink } from '../specialLink'
import type { ChatMessage } from '../../core/types'

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

/** 特殊协议链接（mqqapi:// 等）放行原始 href 交给点击拦截，其余走默认消毒（防 javascript: 等） */
const mdUrlTransform = (url: string) => parseSpecialLink(url) ? url : defaultUrlTransform(url)

/** 插件数组提升为常量（配合 memo：props 引用稳定时 ReactMarkdown 跳过重复解析） */
const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeRaw]

/** memo 化的 ReactMarkdown：消息项因无关状态（头像到达/高亮等）重渲染时，同内容 markdown 不重复走解析管线 */
const MemoReactMarkdown = React.memo(ReactMarkdown)

/**
 * markdown 消息渲染：react-markdown + GFM 为基础，按 bot 协议族预处理方言语法。
 * isMe 时附加 md-me 类（自己蓝气泡白字，链接等着色跟随气泡）。
 * message 提供消息上下文（mqqapi 内联指令需要 @ 发送者 / 回复原消息），
 * 转发浮层等无上下文场景特殊协议链接不响应点击
 */
export const MessageMarkdown: React.FC<{ content: string, isMe?: boolean, message?: ChatMessage }> = ({ content, isMe, message }) => {
  const { currentBot, setPendingInlineCmd } = useMessageView()
  const family = mdFamily(currentBot?.protocol)
  const source = useMemo(() => preprocess(content, family), [content, family])

  const components: Components = useMemo(() => ({
    ...mdComponents,
    a: ({ href, children }) => {
      const action = href ? parseSpecialLink(href) : null
      if (action) {
        return (
          <a
            href={href}
            onClick={(e) => {
              // 特殊协议在浏览器里无法打开，拦截为面板内动作
              e.preventDefault()
              e.stopPropagation()
              if (!message) return
              if (action.kind === 'inlineCmd') {
                setPendingInlineCmd({ command: action.command, enter: action.enter, reply: action.reply, message })
              }
            }}
          >
            {children}
          </a>
        )
      }
      return <a href={href} target='_blank' rel='noreferrer'>{children}</a>
    }
  }), [message, setPendingInlineCmd])

  return (
    <div className={cn('md-body', isMe && 'md-me')}>
      <MemoReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
        urlTransform={mdUrlTransform}
      >
        {source}
      </MemoReactMarkdown>
    </div>
  )
}
