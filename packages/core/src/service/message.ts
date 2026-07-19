import karin, { SendMsgResults } from 'node-karin'
import { BotService } from './bot'
import { RecallMessageType, SendMessageType } from './types'
import { toSendElements } from './dto'
import { ApiResult } from '@/types'
import { fail, ok } from './response'

export const MessageService = {
  /** 主动发送消息 */
  async send (data: SendMessageType): Promise<ApiResult<SendMsgResults | null>> {
    const bot = BotService.get(data.selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const contact = data.scene === 'group' ? karin.contactGroup(data.peer) : karin.contactFriend(data.peer)
      return ok(await bot.sendMsg(contact, toSendElements(data.elements)))
    } catch (err) {
      return fail(err instanceof Error ? err.message : '消息发送错误')
    }
  },

  /** 撤回消息 */
  async recall (data: RecallMessageType): Promise<ApiResult<null>> {
    const bot = BotService.get(data.selfId)
    if (!bot) return fail('Bot不存在')
    try {
      const contact = data.scene === 'group' ? karin.contactGroup(data.peer) : karin.contactFriend(data.peer)
      await bot.recallMsg(contact, data.messageId)
      return ok(null)
    } catch (err) {
      return fail(err instanceof Error ? err.message : '消息撤回失败')
    }
  }
}

/**
 * 注意：本期不提供历史消息接口。
 * karin 的 `bot.getHistoryMsg` 依赖协议端实现，各协议（OneBot/QQBot/微信等）差异很大，
 * 聊天窗口目前只展示实时消息（WS 推送 + 自己发送的），后续如需历史消息再按协议评估。
 */
