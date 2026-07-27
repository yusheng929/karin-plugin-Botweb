/**
 * 特殊协议链接解析注册表。
 * markdown/按钮里的链接默认新窗口打开，但 QQ 专属协议（mqqapi:// 等）在浏览器里
 * 没有意义（会触发系统协议唤起或跳转到错误地址），需要解析成面板内动作。
 * 新增特殊协议时往 handlers 里注册一条解析器即可
 */

/** 内联指令（mqqapi://aio/inlinecmd）：点击后在输入框填入 @消息发送者 + 指令文本 */
export interface InlineCmdAction {
  kind: 'inlineCmd'
  /** 指令文本（URL decode 后） */
  command: string
  /** enter 参数：填入后是否立即发送 */
  enter: boolean
  /** reply 参数：发送时是否携带对原消息的回复 */
  reply: boolean
}

export type SpecialLinkAction = InlineCmdAction

/** mqqapi://aio/inlinecmd?command=X&enter=bool&reply=bool */
const parseMqqapi = (href: string): SpecialLinkAction | null => {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.hostname === 'aio' && url.pathname === '/inlinecmd') {
    const command = url.searchParams.get('command')
    if (!command) return null
    return {
      kind: 'inlineCmd',
      command,
      enter: url.searchParams.get('enter') === 'true',
      reply: url.searchParams.get('reply') === 'true'
    }
  }
  return null
}

/** scheme -> 解析器；新增特殊协议在这里注册 */
const handlers: Record<string, (href: string) => SpecialLinkAction | null> = {
  mqqapi: parseMqqapi
}

/** 命中注册的特殊协议时返回面板内动作；否则返回 null（按普通链接处理） */
export const parseSpecialLink = (href: string): SpecialLinkAction | null => {
  const idx = href.indexOf(':')
  if (idx <= 0) return null
  return handlers[href.slice(0, idx).toLowerCase()]?.(href) ?? null
}
