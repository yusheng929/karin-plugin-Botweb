import React from 'react'
import { AtSign, Hand, UserMinus, Copy, Reply, Undo2, Download, ImageIcon } from 'lucide-react'
import { useChat } from '../ChatContext'
import { pokeGroupMember, kickGroupMember } from '../api'
import { resolveMediaSrc, downloadFile, copyImageToClipboard } from '../utils'
import { MessageElement } from '../../core/types'
import { ContextMenu, ContextMenuItem } from './ContextMenu'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export const Overlays: React.FC = () => {
  const {
    toast, setToast,
    confirmDialog, setConfirmDialog,
    alertDialog, setAlertDialog,
    actualTheme,
    contextMenu, setContextMenu,
    currentBot, botGroupRole,
    setPendingMention, setReplyTo, recallMessage, refreshGroupMembers
  } = useChat()

  const isDark = actualTheme === 'dark'

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

    const msg = contextMenu.msg!
    const senderName = msg.senderName || msg.senderId

    if (kind === 'avatar') {
      const items: ContextMenuItem[] = [
        {
          label: '@ TA',
          icon: <AtSign className='w-4 h-4' />,
          onClick: () => setPendingMention(msg.senderId)
        },
        {
          label: '戳一戳',
          icon: <Hand className='w-4 h-4' />,
          onClick: () => {
            pokeGroupMember(currentBot.selfId, msg.peer, msg.senderId)
              .then(ok => setToast(ok
                ? { message: `戳了戳 ${senderName}`, type: 'success' }
                : { message: '戳一戳失败', type: 'error' }))
              .catch(err => setToast({ message: `戳一戳失败: ${err.message}`, type: 'error' }))
          }
        }
      ]
      if (canManageGroup) {
        items.push({
          label: '踢出用户',
          icon: <UserMinus className='w-4 h-4' />,
          danger: true,
          onClick: () => {
            setConfirmDialog({
              title: '踢出用户',
              message: `确定要将 ${senderName} 踢出群聊吗？`,
              confirmText: '确定踢出',
              cancelText: '取消',
              onConfirm: () => {
                kickGroupMember(currentBot.selfId, msg.peer, msg.senderId)
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
          isDark={isDark}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className='fixed top-6 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 duration-300'>
          <div className={cn(
            'backdrop-blur-2xl px-6 py-3 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex items-center gap-3 border transition-all duration-300',
            toast.type === 'success'
              ? (isDark ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-green-50/80 border-green-200 text-green-600')
              : toast.type === 'error'
                ? (isDark ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-red-50/80 border-red-200 text-red-600')
                : (isDark ? 'bg-gray-800/80 border-white/10 text-white' : 'bg-white/80 border-black/5 text-mac-text-main')
          )}
          >
            <div className={cn('w-2 h-2 rounded-full animate-pulse',
              toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-mac-blue')}
            />
            <span className='text-sm font-bold tracking-tight'>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200'>
          <div className={cn('w-full max-w-[320px] rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200 overflow-hidden', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-mac-border')}>
            <div className='p-6 pb-4'>
              <h3 className={cn('text-lg font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>{confirmDialog.title}</h3>
              <p className={cn('text-sm leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-500')}>{confirmDialog.message}</p>
            </div>
            <div className={cn('flex border-t', isDark ? 'border-gray-700' : 'border-mac-border')}>
              <button
                onClick={() => setConfirmDialog(null)}
                className={cn('flex-1 px-4 py-3 text-sm font-medium transition-colors border-r', isDark ? 'border-gray-700 text-gray-400 hover:bg-gray-700' : 'border-mac-border text-gray-500 hover:bg-mac-active')}
              >
                {confirmDialog.cancelText || '取消'}
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm()
                  setConfirmDialog(null)
                }}
                className='flex-1 px-4 py-3 text-sm font-bold text-mac-blue transition-colors hover:bg-mac-blue/10 active:bg-mac-blue/20'
              >
                {confirmDialog.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {alertDialog && (
        <div className='fixed inset-0 z-[111] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200'>
          <div className={cn('w-full max-w-[320px] rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200 overflow-hidden', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-mac-border')}>
            <div className='p-6 pb-4 text-center'>
              <h3 className={cn('text-lg font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>{alertDialog.title}</h3>
              <p className={cn('text-sm leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-500')}>{alertDialog.message}</p>
            </div>
            <div className={cn('flex border-t', isDark ? 'border-gray-700' : 'border-mac-border')}>
              <button
                onClick={() => setAlertDialog(null)}
                className='w-full px-4 py-3 text-sm font-bold text-mac-blue transition-colors hover:bg-mac-blue/10 active:bg-mac-blue/20'
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
