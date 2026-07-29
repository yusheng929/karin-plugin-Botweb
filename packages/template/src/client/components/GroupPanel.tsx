import React from 'react'
import { useChat } from '../state/chat'
import { useUi } from '../state/ui'
import { cn } from '../utils'
import { GroupMemberItem } from '../../core/types'
import { Avatar } from './Avatar'

/** 群资料面板（QQ NT 最右栏 docked）：群公告占位 + 群成员列表 */
export const GroupPanel: React.FC = () => {
  const { currentConversation, groupMembers, resolveAvatar } = useChat()
  const { setContextMenu } = useUi()

  if (!currentConversation || currentConversation.scene !== 'group') return null

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

  const roleBadge = (member: GroupMemberItem) => {
    // 头衔/角色互斥：有自定义头衔时替换角色文字，颜色跟随角色（群主黄/管理员蓝/群员紫）
    if (member.title) {
      const cls = member.role === 'owner'
        ? 'role-badge-owner'
        : member.role === 'admin' ? 'role-badge-admin' : 'role-badge-title'
      return <span className={cn('role-badge shrink-0 max-w-[80px] truncate', cls)}>{member.title}</span>
    }
    if (member.role === 'owner') return <span className='role-badge role-badge-owner shrink-0'>群主</span>
    if (member.role === 'admin') return <span className='role-badge role-badge-admin shrink-0'>管理员</span>
    return null
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className='h-full w-[280px] shrink-0 flex flex-col border-l border-qq-border bg-qq-sidebar overflow-hidden'
    >
      <div className='flex-1 overflow-y-auto'>
        {/* 群公告（占位板块） */}
        <section className='px-4 pt-4'>
          <h3 className='text-[14px] font-semibold'>群公告</h3>
          <p className='py-4 text-[12px] text-qq-text-secondary'>暂无公告</p>
        </section>

        <div className='mx-4 border-t border-qq-divider' />

        {/* 群聊成员 */}
        <section className='px-4 pt-3 pb-2'>
          <h3 className='text-[14px] font-semibold'>
            群聊成员 <span className='font-normal text-qq-text-secondary'>{members.length}</span>
          </h3>
        </section>
        <div className='px-2 pb-2'>
          {members.map((member) => (
            <div
              key={member.userId}
              onContextMenu={(e) => openMemberMenu(e, member)}
              className='flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-qq-hover transition-colors cursor-default'
            >
              <Avatar
                url={resolveAvatar(member.userId)}
                name={member.card || member.nick || member.userId}
                className='w-8 h-8 text-xs shrink-0'
              />
              <div className='flex-1 min-w-0 text-[13px] truncate'>
                {member.card || member.nick || member.userId}
              </div>
              {roleBadge(member)}
            </div>
          ))}
          {members.length === 0 && (
            <div className='px-4 py-8 text-center text-[13px] text-qq-text-secondary'>暂无成员数据</div>
          )}
        </div>
      </div>
    </div>
  )
}
