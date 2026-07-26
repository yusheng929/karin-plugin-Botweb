import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { Avatar } from './Avatar'

/** 会话资料侧栏（QQ NT 右侧抽屉）：资料页 + 群成员列表页 */
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
    if (role === 'owner') return <span className='text-[10px] px-1 py-px rounded bg-amber-500/15 text-amber-500 font-medium shrink-0'>群主</span>
    if (role === 'admin') return <span className='text-[10px] px-1 py-px rounded bg-emerald-500/15 text-emerald-500 font-medium shrink-0'>管理员</span>
    return null
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className='h-full w-72 flex flex-col border-l border-qq-border bg-qq-chat-bg shadow-xl overflow-hidden'
    >
      <header className='h-[52px] px-2.5 flex items-center justify-between shrink-0 border-b border-qq-border'>
        <div className='w-8 flex items-center'>
          {showMembers && (
            <button
              onClick={() => setShowMembers(false)}
              className='p-1.5 rounded-lg hover:bg-qq-hover transition-colors text-qq-text-secondary'
              title='返回'
            >
              <ChevronLeft className='w-5 h-5' />
            </button>
          )}
        </div>
        <h3 className='text-[14px] font-semibold'>
          {showMembers ? '群聊成员' : (isGroup ? '群聊设置' : '聊天设置')}
        </h3>
        <div className='w-8' />
      </header>

      {/* 成员列表页 */}
      {showMembers && isGroup
        ? (
          <div className='flex-1 overflow-y-auto px-2 py-2'>
            {members.map((member) => (
              <div
                key={member.userId}
                onContextMenu={(e) => openMemberMenu(e, member)}
                className='flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] hover:bg-qq-hover transition-colors cursor-default'
              >
                <Avatar
                  url={resolveAvatar(member.userId)}
                  name={member.card || member.nick || member.userId}
                  className='w-9 h-9 text-sm shrink-0'
                />
                <div className='flex-1 min-w-0 text-left'>
                  <div className='text-[13px] truncate'>
                    {member.card || member.nick || member.userId}
                  </div>
                  <div className='text-xs text-qq-text-secondary truncate'>
                    {member.userId}
                  </div>
                </div>
                {roleBadge(member.role)}
              </div>
            ))}
            {members.length === 0 && (
              <div className='px-4 py-8 text-center text-[13px] text-qq-text-secondary'>暂无成员数据</div>
            )}
          </div>
          )
        : (
          <div className='flex-1 overflow-y-auto'>
            {/* 头像 + 名称（头像来自会话资料，后端协议端提供；缺失用字母占位） */}
            <div className='flex flex-col items-center pt-7 pb-6 px-4'>
              <Avatar
                url={currentConversation.avatar}
                name={currentConversation.name}
                className='w-20 h-20 text-3xl shadow-sm mb-3'
              />
              <h4 className='text-[16px] font-semibold text-center truncate max-w-full'>
                {currentConversation.name}
              </h4>
              <div className='text-xs text-qq-text-secondary mt-1'>
                {isGroup ? `群号 ${displayId}` : `QQ ${displayId}`}
              </div>
            </div>

            {/* 成员入口 */}
            {isGroup && (
              <div className='px-3'>
                <button
                  onClick={() => setShowMembers(true)}
                  className='w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-qq-sidebar hover:bg-qq-hover transition-colors'
                >
                  <Users className='w-[18px] h-[18px] text-qq-text-secondary shrink-0' strokeWidth={1.8} />
                  <span className='flex-1 text-[13px] text-left'>群聊成员</span>
                  <span className='text-[13px] text-qq-text-secondary flex items-center gap-0.5'>
                    {members.length}
                    <ChevronRight className='w-4 h-4' />
                  </span>
                </button>
              </div>
            )}
          </div>
          )}
    </div>
  )
}
