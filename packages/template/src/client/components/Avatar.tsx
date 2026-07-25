import React from 'react'
import { cn } from '../utils'

/** TG 风格头像底色板（按名字 hash 取色） */
const AVATAR_COLORS = ['#cc5049', '#d67722', '#955cdb', '#40a920', '#309eba', '#368ad1', '#c7508b']

const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** 头像：有 url 用图片，否则用名称首字符圆形占位（TG 配色） */
export const Avatar: React.FC<{ url?: string, name: string, className?: string }> = ({ url, name, className }) => {
  if (url) {
    return <img src={url} alt={name} referrerPolicy='no-referrer' className={cn('object-cover rounded-full', className)} />
  }
  return (
    <div
      className={cn('rounded-full text-white flex items-center justify-center font-medium select-none', className)}
      style={{ backgroundColor: avatarColor(name || '?') }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}
