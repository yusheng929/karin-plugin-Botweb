import React from 'react'
import { AtSign, Hand, UserMinus, Copy, Reply, Undo2, Download, ImageIcon } from 'lucide-react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { pokeGroupMember, pokeFriend, kickGroupMember } from '../api'
import { resolveMediaSrc, downloadFile, copyImageToClipboard, cn } from '../utils'
import { MessageElement } from '../../core/types'
import { ContextMenu, ContextMenuItem } from './ContextMenu'

export const Overlays: React.FC = () => {
  const {
    currentBot, botGroupRole, groupMembers, currentConversation,
    recallMessage, refreshGroupMembers, appendLocalPoke
  } = useChat()
  const {
    toast, confirmDialog, setConfirmDialog,
    alertDialog, setAlertDialog,
    contextMenu, setContextMenu,
    setPendingMention, setReplyTo, setToast
  } = useUi()

  // ---------- 右键菜单 ----------

  const canManageGroup = botGroupRole === 'owner' || botGroupRole === 'admin'

  /** 复制图片：成功复制图片本身，失败时降级为复制图片链接 */
  const handleCopyImage = (file: string) => {
    copyImageToClipboard(file)
      .then(mode => setToast(mode === 'image'
        ? { message: '已复制图片', type: 'success' }
        : { message: '已复制图片链接', type: 'success' }))
      .catch(() => setToast({ message: '复制失败', type: 'error' }))
  }

  const buildMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu || !currentBot) return []
    const { kind } = contextMenu

    // 图片菜单（lightbox / 消息内图片）
    if (kind === 'image') {
      const file = contextMenu.file!
      return [
        {
          label: '复制图片',
          icon: <Copy className='w-4 h-4' />,
          onClick: () => handleCopyImage(file)
        },
        {
          label: '下载图片',
          icon: <Download className='w-4 h-4' />,
          onClick: () => downloadFile(resolveMediaSrc(file), `image-${Date.now()}.png`)
        }
      ]
    }

    // member 分支没有 msg；avatar/message 分支才使用，下面各分支内自行断言
    const msg = contextMenu.msg!
    const senderName = msg?.senderName || msg?.senderId || ''

    /** 群成员操作菜单（@ TA / 戳一戳 / 踢出），消息头像右键与成员列表右键共用 */
    const buildGroupMemberItems = (targetId: string, targetName: string, groupId: string): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        {
          label: '@ TA',
          icon: <AtSign className='w-4 h-4' />,
          onClick: () => setPendingMention(targetId)
        },
        {
          label: '戳一戳',
          icon: <Hand className='w-4 h-4' />,
          onClick: () => {
            pokeGroupMember(currentBot.selfId, groupId, targetId)
              .then(ok => {
                // 协议端一般不回显自己的戳一戳，本地乐观上屏灰条
                if (ok) appendLocalPoke('group', groupId, targetId)
                setToast(ok
                  ? { message: `戳了戳 ${targetName}`, type: 'success' }
                  : { message: '戳一戳失败', type: 'error' })
              })
              .catch(err => setToast({ message: `戳一戳失败: ${err.message}`, type: 'error' }))
          }
        }
      ]
      // 踢出权限：群主可踢任何成员；管理员只能踢普通成员（不能踢群主/管理员）
      const targetRole = groupMembers.find(m => String(m.userId) === String(targetId))?.role
      const canKickTarget = botGroupRole === 'owner' ||
        (botGroupRole === 'admin' && targetRole !== 'owner' && targetRole !== 'admin')
      if (canKickTarget) {
        items.push({
          label: '踢出用户',
          icon: <UserMinus className='w-4 h-4' />,
          danger: true,
          onClick: () => {
            setConfirmDialog({
              title: '踢出用户',
              message: `确定要将 ${targetName} 踢出群聊吗？`,
              confirmText: '确定踢出',
              cancelText: '取消',
              onConfirm: () => {
                kickGroupMember(currentBot.selfId, groupId, targetId)
                  .then(() => {
                    setToast({ message: '已踢出该成员', type: 'success' })
                    refreshGroupMembers()
                  })
                  .catch(err => setToast({ message: `踢出失败: ${err.message}`, type: 'error' }))
              }
            })
          }
        })
      }
      return items
    }

    // 成员列表右键（群聊资料页），当前会话必定为群
    if (kind === 'member') {
      const member = contextMenu.member!
      const groupId = currentConversation!.peer
      return buildGroupMemberItems(member.userId, member.name, groupId)
    }

    if (kind === 'avatar') {
      const isGroupMsg = msg!.scene === 'group'
      if (isGroupMsg) {
        return buildGroupMemberItems(msg!.senderId, senderName, msg!.peer)
      }
      // 私聊头像：只有戳一戳
      return [
        {
          label: '戳一戳',
          icon: <Hand className='w-4 h-4' />,
          onClick: () => {
            pokeFriend(currentBot.selfId, msg!.senderId)
              .then(ok => {
                // 协议端一般不回显自己的戳一戳，本地乐观上屏灰条
                if (ok) appendLocalPoke('friend', msg!.peer, msg!.senderId)
                setToast(ok
                  ? { message: `戳了戳 ${senderName}`, type: 'success' }
                  : { message: '戳一戳失败', type: 'error' })
              })
              .catch(err => setToast({ message: `戳一戳失败: ${err.message}`, type: 'error' }))
          }
        }
      ]
    }

    // 消息菜单
    const imageEl = msg.elements.find((e): e is Extract<MessageElement, { type: 'image' }> => e.type === 'image')
    const items: ContextMenuItem[] = [
      {
        label: '复制',
        icon: <Copy className='w-4 h-4' />,
        onClick: () => {
          const text = msg.elements
            .filter(e => e.type === 'text')
            .map(e => (e as { type: 'text', text: string }).text)
            .join('')
          // 纯图片无文本的消息，「复制」直接复制图片
          if (!text) {
            if (imageEl) {
              handleCopyImage(imageEl.file)
            } else {
              setToast({ message: '没有可复制的文本', type: 'info' })
            }
            return
          }
          navigator.clipboard.writeText(text)
            .then(() => setToast({ message: '已复制', type: 'success' }))
            .catch(() => setToast({ message: '复制失败', type: 'error' }))
        }
      },
      {
        label: '回复',
        icon: <Reply className='w-4 h-4' />,
        onClick: () => setReplyTo(msg)
      }
    ]
    if (imageEl) {
      items.push({
        label: '复制图片',
        icon: <ImageIcon className='w-4 h-4' />,
        onClick: () => handleCopyImage(imageEl.file)
      })
    }
    // 撤回：自己（bot）发的消息总是显示；他人消息仅当 bot 在该群为 owner/admin 时显示
    const isOwn = msg.senderId === currentBot.selfId
    const showRecall = !msg.recalled && !msg.system && !msg.status && (isOwn || (msg.scene === 'group' && canManageGroup))
    if (showRecall) {
      items.push({
        label: '撤回',
        icon: <Undo2 className='w-4 h-4' />,
        danger: true,
        onClick: () => recallMessage(msg)
      })
    }
    return items
  }

  if (!toast && !confirmDialog && !alertDialog && !contextMenu) return null

  return (
    <>
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast（TG 风格底部深色浮条） */}
      {toast && (
        <div className='fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-3 fade-in duration-200'>
          <div className='bg-[#212121]/95 dark:bg-[#f5f5f5]/95 text-white dark:text-black px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5'>
            <div className={cn('w-2 h-2 rounded-full shrink-0',
              toast.type === 'success' ? 'bg-tg-badge' : toast.type === 'error' ? 'bg-red-500' : 'bg-tg-blue')}
            />
            <span className='text-sm'>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-150'>
          <div className='w-full max-w-[320px] rounded-2xl shadow-2xl bg-tg-bg animate-in zoom-in-95 duration-150 overflow-hidden'>
            <div className='p-5 pb-3'>
              <h3 className='text-base font-semibold mb-1.5'>{confirmDialog.title}</h3>
              <p className='text-sm text-tg-text-secondary leading-relaxed'>{confirmDialog.message}</p>
            </div>
            <div className='flex justify-end gap-1 px-3 pb-3'>
              <button
                onClick={() => setConfirmDialog(null)}
                className='px-4 py-2 text-sm font-medium text-tg-blue rounded-lg hover:bg-tg-hover transition-colors uppercase'
              >
                {confirmDialog.cancelText || '取消'}
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm()
                  setConfirmDialog(null)
                }}
                className='px-4 py-2 text-sm font-medium text-tg-blue rounded-lg hover:bg-tg-hover transition-colors uppercase'
              >
                {confirmDialog.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {alertDialog && (
        <div className='fixed inset-0 z-[111] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-150'>
          <div className='w-full max-w-[320px] rounded-2xl shadow-2xl bg-tg-bg animate-in zoom-in-95 duration-150 overflow-hidden'>
            <div className='p-5 pb-3'>
              <h3 className='text-base font-semibold mb-1.5'>{alertDialog.title}</h3>
              <p className='text-sm text-tg-text-secondary leading-relaxed'>{alertDialog.message}</p>
            </div>
            <div className='flex justify-end px-3 pb-3'>
              <button
                onClick={() => setAlertDialog(null)}
                className='px-4 py-2 text-sm font-medium text-tg-blue rounded-lg hover:bg-tg-hover transition-colors uppercase'
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
