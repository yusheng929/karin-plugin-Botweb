import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useChat } from '../ChatContext'
import { getAvatarUrl } from '../utils'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export const ChatDetailsSidebar: React.FC = () => {
  const {
    currentConversation,
    groupMembers,
    actualTheme,
    setContextMenu
  } = useChat()

  const isDark = actualTheme === 'dark'
  const [showMembers, setShowMembers] = useState(false)

  // 切换会话时退回资料页
  const conversationKey = currentConversation?.key
  useEffect(() => {
    setShowMembers(false)
  }, [conversationKey])

  if (!currentConversation) return null

  const isGroup = currentConversation.scene === 'group'
  const displayId = currentConversation.peer
  const avatarUrl = currentConversation.avatar || getAvatarUrl(isGroup ? 'group' : 'private', displayId)

  const members = [...groupMembers].sort((a, b) => {
    const priority: Record<string, number> = { owner: 1, admin: 2, member: 3, unknown: 4 }
    return (priority[a.role] || 4) - (priority[b.role] || 4)
  })
  const displayMembers = members.slice(0, 13)

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
    if (role === 'owner') {
      return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0', isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600 border border-amber-200')}>群主</span>
    }
    if (role === 'admin') {
      return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0', isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600 border border-emerald-200')}>管理员</span>
    }
    return null
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'h-full w-80 flex flex-col border-l shadow-2xl backdrop-blur-3xl overflow-hidden',
        isDark ? 'bg-gray-900/90 border-white/10' : 'bg-[#F9F1F3]/90 border-black/5'
      )}
    >
      <header className='h-14 px-4 flex items-center justify-between shrink-0'>
        <div className='w-8 flex items-center'>
          {showMembers && (
            <button
              onClick={() => setShowMembers(false)}
              className={cn('p-1.5 rounded-lg transition-colors', isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-black/5 text-gray-600')}
              title='返回'
            >
              <ChevronLeft className='w-4 h-4' />
            </button>
          )}
        </div>
        <h3 className={cn('text-sm font-bold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {showMembers ? '群聊成员' : isGroup ? '群聊资料' : '用户资料'}
        </h3>
        <div className='w-8' />
      </header>

      {/* 成员列表页 */}
      {showMembers && isGroup ? (
        <div className='flex-1 overflow-y-auto px-4 pb-8 pt-2'>
          <div className={cn('rounded-2xl shadow-sm divide-y', isDark ? 'bg-gray-800/50 divide-white/5' : 'bg-white divide-black/5')}>
            {members.map((member) => (
              <div
                key={member.userId}
                onContextMenu={(e) => openMemberMenu(e, member)}
                className='flex items-center gap-3 px-4 py-2.5'
              >
                <div className={cn(
                  'w-9 h-9 rounded-full overflow-hidden shrink-0 ring-2',
                  member.role === 'owner' ? 'ring-amber-500/50' : member.role === 'admin' ? 'ring-emerald-500/50' : 'ring-transparent'
                )}
                >
                  <img
                    src={`https://q.qlogo.cn/g?b=qq&nk=${member.userId}&s=100`}
                    alt=''
                    referrerPolicy='no-referrer'
                    className='w-full h-full object-cover'
                  />
                </div>
                <div className='flex-1 min-w-0 text-left'>
                  <div className={cn('text-xs font-bold truncate', isDark ? 'text-gray-200' : 'text-gray-800')}>
                    {member.card || member.nick || member.userId}
                  </div>
                  <div className={cn('text-[10px] opacity-40 truncate', isDark ? 'text-gray-300' : 'text-gray-600')}>
                    {member.userId}
                  </div>
                </div>
                {roleBadge(member.role)}
              </div>
            ))}
            {members.length === 0 && (
              <div className='px-4 py-8 text-center text-xs opacity-40'>暂无成员数据</div>
            )}
          </div>
        </div>
      ) : (
        <div className='flex-1 overflow-y-auto px-4 pb-8 space-y-4 pt-2'>
          {/* Top Header Card */}
          <div className={cn('p-4 rounded-2xl shadow-sm flex items-center gap-4', isDark ? 'bg-gray-800/50' : 'bg-white')}>
            <div className='w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm'>
              <img src={avatarUrl} alt='avatar' className='w-full h-full object-cover' />
            </div>
            <div className='flex-1 min-w-0 text-left'>
              <div className='flex items-center gap-2'>
                <h4 className={cn('text-base font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>
                  {currentConversation.name}
                </h4>
              </div>
              <div className={cn('text-xs opacity-50 font-medium', isDark ? 'text-gray-100' : 'text-gray-900')}>
                {isGroup ? `群号: ${displayId}` : `账号: ${displayId}`}
              </div>
            </div>
          </div>

          {/* Member Grid Card */}
          {isGroup && (
            <div className={cn('p-4 rounded-2xl shadow-sm space-y-4', isDark ? 'bg-gray-800/50' : 'bg-white')}>
              <div className='flex items-center justify-between'>
                <span className={cn('text-sm font-bold', isDark ? 'text-gray-200' : 'text-gray-700')}>群聊成员</span>
                <button
                  onClick={() => setShowMembers(true)}
                  className={cn('flex items-center gap-0.5 text-xs font-medium opacity-50 rounded-md px-1.5 py-1 -m-1 transition-all hover:opacity-90', isDark ? 'hover:bg-white/10' : 'hover:bg-black/5')}
                >
                  共{members.length}名成员 <ChevronRight className='w-4 h-4' />
                </button>
              </div>
              <div className='grid grid-cols-5 gap-y-4 gap-x-2'>
                {displayMembers.map((member) => (
                  <div
                    key={member.userId}
                    onClick={() => setShowMembers(true)}
                    onContextMenu={(e) => openMemberMenu(e, member)}
                    className='flex flex-col items-center gap-1 cursor-pointer group'
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full overflow-hidden ring-2 transition-all group-hover:ring-mac-blue/20',
                      member.role === 'owner' ? 'ring-amber-500/50' : member.role === 'admin' ? 'ring-emerald-500/50' : 'ring-transparent'
                    )}
                    >
                      <img
                        src={`https://q.qlogo.cn/g?b=qq&nk=${member.userId}&s=100`}
                        alt='m'
                        referrerPolicy='no-referrer'
                        className='w-full h-full object-cover'
                      />
                    </div>
                    <span className='text-[10px] w-full text-center truncate font-medium opacity-60'>
                      {member.card || member.nick || member.userId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
