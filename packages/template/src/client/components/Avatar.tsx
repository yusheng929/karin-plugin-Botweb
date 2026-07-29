import React from 'react'
import { Avatar as HeroAvatar } from '@heroui/react'

/** 头像占位底色板（按名字 hash 取色，色板 hex 保留） */
const AVATAR_COLORS = ['#cc5049', '#d67722', '#955cdb', '#40a920', '#309eba', '#368ad1', '#c7508b']

const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** 头像（HeroUI Avatar）：有 url 用图片（加载失败自动回退），否则名称首字符圆形占位 */
export const Avatar: React.FC<{ url?: string, name: string, className?: string }> = ({ url, name, className }) => (
  <HeroAvatar className={className}>
    {url && <HeroAvatar.Image src={url} alt={name} referrerPolicy='no-referrer' />}
    <HeroAvatar.Fallback
      className='text-white font-medium select-none text-[length:inherit]'
      style={{ backgroundColor: avatarColor(name || '?') }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </HeroAvatar.Fallback>
  </HeroAvatar>
)
