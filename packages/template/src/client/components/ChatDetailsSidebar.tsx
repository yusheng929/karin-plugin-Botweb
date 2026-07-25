import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { Avatar } from './Avatar'

export const ChatDetailsSidebar: React.FC = () => {
  const { currentConversation, groupMembers, resolveAvatar } = useChat()
  const { setContextMenu } = useUi()

  const [showMembers, setShowMembers] = useState(false)

  // 切换会话时退回资料页
  const conversationKey = currentConversation?.key
  useEffect(() => {
    setShowMembers(false)
  }, [conversationKey])

  if (!currentConversation) return null

  const isGroup = currentConversation.scene === 'group'
  const displayId = currentConversation.peer

  const members = [...groupMembers].sort((a, b) => {
    const priority: Record<string, number> = { owner: 1, admin: 2, member: 3, unknown: 4 }
    return (priority[a.role] || 4) - (priority[b.role] || 4)
  })

  /** 成员右键菜单（@ TA / 戳一戳 / 踢出用户，菜单项在 Overlays 统一构建） */
  const openMemberMenu = (e: React.MouseEvent, member: { userId: string, card?: string, nick?: string }) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      kind: 'member',
      member: { userId: member.userId, name: member.card || member.nick || member.userId }
    })
  }

  const roleBadge = (role: string) => {
    if (role === 'owner') return <span className='text-[10px] text-amber-500 font-medium shrink-0'>群主</span>
    if (role === 'admin') return <span className='text-[10px] text-emerald-500 font-medium shrink-0'>管理员</span>
    return null
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className='h-full w-80 flex flex-col border-l border-tg-border bg-tg-bg shadow-xl overflow-hidden'
    >
      <header className='h-14 px-3 flex items-center justify-between shrink-0 border-b border-tg-border'>
        <div className='w-9 flex items-center'>
          {showMembers && (
            <button
              onClick={() => setShowMembers(false)}
              className='p-2 rounded-full hover:bg-tg-hover transition-colors text-tg-text-secondary'
              title='返回'
            >
              <ChevronLeft className='w-5 h-5' />
            </button>
          )}
        </div>
        <h3 className='text-sm font-semibold'>
          {showMembers ? '群聊成员' : '资料'}
        </h3>
        <div className='w-9' />
      </header>

      {/* 成员列表页 */}
      {showMembers && isGroup
        ? (
          <div className='flex-1 overflow-y-auto py-2'>
            {members.map((member) => (
              <div
                key={member.userId}
                onContextMenu={(e) => openMemberMenu(e, member)}
                className='flex items-center gap-3 px-4 py-2 hover:bg-tg-hover transition-colors cursor-default'
              >
                <Avatar
                  url={resolveAvatar(member.userId)}
                  name={member.card || member.nick || member.userId}
                  className='w-10 h-10 text-base shrink-0'
                />
                <div className='flex-1 min-w-0 text-left'>
                  <div className='text-sm truncate'>
                    {member.card || member.nick || member.userId}
                  </div>
                  <div className='text-xs text-tg-text-secondary truncate'>
                    {member.userId}
                  </div>
                </div>
                {roleBadge(member.role)}
              </div>
            ))}
            {members.length === 0 && (
              <div className='px-4 py-8 text-center text-sm text-tg-text-secondary'>暂无成员数据</div>
            )}
          </div>
        )
        : (
          <div className='flex-1 overflow-y-auto'>
            {/* 大头像 + 名称（头像来自会话资料，后端协议端提供；缺失用字母占位） */}
            <div className='flex flex-col items-center pt-8 pb-6 px-4'>
              <Avatar
                url={currentConversation.avatar}
                name={currentConversation.name}
                className='w-28 h-28 text-4xl shadow-sm mb-4'
              />
              <h4 className='text-lg font-semibold text-center truncate max-w-full'>
                {currentConversation.name}
              </h4>
              <div className='text-sm text-tg-text-secondary mt-1'>
                {isGroup ? `群号: ${displayId}` : `账号: ${displayId}`}
              </div>
            </div>

            {/* 成员入口 */}
            {isGroup && (
              <button
                onClick={() => setShowMembers(true)}
                className='w-full flex items-center gap-4 px-4 py-3 hover:bg-tg-hover transition-colors border-t border-tg-border'
              >
                <Users className='w-5 h-5 text-tg-text-secondary shrink-0' />
                <span className='flex-1 text-sm text-left'>群聊成员</span>
                <span className='text-sm text-tg-text-secondary flex items-center gap-0.5'>
                  {members.length}
                  <ChevronRight className='w-4 h-4' />
                </span>
              </button>
            )}
          </div>
        )}
    </div>
  )
}
