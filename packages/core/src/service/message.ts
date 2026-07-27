import karin, { SendMsgResults } from 'node-karin'
import { BotService } from './bot'
import { ReactionMessageType, RecallMessageType, SendMessageType } from './types'
import { toSendElements } from './dto'
import { messageDb } from './db'
import { SettingsService } from './settings'
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
      // 持久化发送的消息（INSERT OR IGNORE：多数协议端会回显 message 事件，回显到达时不重复）。
      // 受设置门控：全局开关关闭、或该 bot 未单独开启时不落库
      if (SettingsService.shouldStoreMessage(data.selfId)) {
        void messageDb.insert({
          messageId: result.messageId,
          seq: 0,
          selfId: data.selfId,
          scene: data.scene,
          peer: data.peer,
          senderId: data.selfId,
          senderName: bot.account?.name || bot.selfName || data.selfId,
          time: result.time,
          elements: data.elements
        }).catch(() => {})
      }
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
      // 面板主动撤回不一定有 notice 回显，这里直接标记 db（WS recall 推送到达时幂等跳过）
      void messageDb.markRecalled(data.selfId, data.scene, data.peer, data.messageId).catch(() => {})
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
      // 面板主动贴表情不一定有 notice 回显，这里直接聚合 db（WS reaction 推送到达时前端按 pending 去重）
      void messageDb.applyReaction(data.selfId, data.scene, data.peer, data.messageId, data.faceId, 1, isSet).catch(() => {})
      return ok(null)
    } catch (err) {
      return fail(err instanceof Error ? err.message : '表情回应失败')
    }
  }
}
