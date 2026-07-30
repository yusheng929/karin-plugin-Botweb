import karin, { SendMsgResults } from 'node-karin'
import { BotService } from './bot'
import { ReactionMessageType, RecallMessageType, SendMessageType } from './types'
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
      const result = await bot.sendMsg(contact, toSendElements(data.elements))
      return ok(result)
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
  },

  /** 表情回应（QQ 贴表情，仅 NapCat/Lagrange 等 OneBot 协议端支持，其余抛错） */
  async react (data: ReactionMessageType): Promise<ApiResult<null>> {
    const bot = BotService.get(data.selfId)
    if (!bot) return fail('Bot不存在')
    const isSet = data.isSet !== false
    try {
      const contact = data.scene === 'group' ? karin.contactGroup(data.peer) : karin.contactFriend(data.peer)
      await bot.setMsgReaction(contact, data.messageId, data.faceId, isSet)
      return ok(null)
    } catch (err) {
      return fail(err instanceof Error ? err.message : '表情回应失败')
    }
  }
}
