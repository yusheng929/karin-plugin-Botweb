import React from 'react'
import { ChevronRight } from 'lucide-react'
import { useChat } from '../ChatContext'
import { getAvatarUrl } from '../utils'

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ')

export const ChatDetailsSidebar: React.FC = () => {
  const {
    currentConversation,
    groupMembers,
    actualTheme
  } = useChat()

  const isDark = actualTheme === 'dark'

  if (!currentConversation) return null

  const isGroup = currentConversation.scene === 'group'
  const displayId = currentConversation.peer
  const avatarUrl = currentConversation.avatar || getAvatarUrl(isGroup ? 'group' : 'private', displayId)

  const members = [...groupMembers].sort((a, b) => {
    const priority: Record<string, number> = { owner: 1, admin: 2, member: 3, unknown: 4 }
    return (priority[a.role] || 4) - (priority[b.role] || 4)
  })
  const displayMembers = members.slice(0, 13)

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
        <div className='w-8' />
        <h3 className={cn('text-sm font-bold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {isGroup ? '群聊资料' : '用户资料'}
        </h3>
        <div className='w-8' />
      </header>

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
              <span className='flex items-center gap-0.5 text-xs font-medium opacity-50'>
                共{members.length}名成员 <ChevronRight className='w-4 h-4' />
              </span>
            </div>
            <div className='grid grid-cols-5 gap-y-4 gap-x-2'>
              {displayMembers.map((member) => (
                <div key={member.userId} className='flex flex-col items-center gap-1 cursor-pointer group'>
                  <div className={cn(
                    'w-10 h-10 rounded-full overflow-hidden ring-2 transition-all group-hover:ring-mac-blue/20',
                    member.role === 'owner' ? 'ring-amber-500/50' : member.role === 'admin' ? 'ring-emerald-500/50' : 'ring-transparent'
                  )}
                  >
                    <img
                      src={`https://q.qlogo.cn/g?b=qq&nk=${member.userId}&s=100`}
                      alt='m'
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
    </div>
  )
}
