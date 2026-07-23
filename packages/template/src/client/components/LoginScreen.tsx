import React, { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { login } from '../auth'

/**
 * 登录页：输入 karin 的 HTTP_AUTH_KEY，调 karin 的 /api/v1/login 换取 JWT。
 * 登录态写入 karin WebUI 同款 localStorage 键，与其双向共享（任一边登录，两边都免登录）。
 * 登录成功后 auth 模块会通知入口切换到面板，本组件无需回调。
 */
export const LoginScreen: React.FC = () => {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const value = key.trim()
    if (!value || loading) return
    setLoading(true)
    setError('')
    try {
      await login(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
      setLoading(false)
    }
  }

  return (
    <div className='flex h-full items-center justify-center bg-gray-950 font-sans antialiased relative overflow-hidden'>
      {/* 背景光斑（与面板一致的玻璃质感） */}
      <div className='absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-mac-blue/10 rounded-full blur-[120px] pointer-events-none' />
      <div className='absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none' />

      <div className='w-full max-w-[340px] mx-4 rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200'>
        <div className='flex flex-col items-center mb-6'>
          <div className='w-12 h-12 rounded-2xl bg-mac-blue/15 flex items-center justify-center mb-3'>
            <KeyRound className='w-6 h-6 text-mac-blue' />
          </div>
          <h1 className='text-lg font-bold text-white tracking-tight'>BotWeb 面板</h1>
          <p className='text-xs text-gray-400 mt-1'>请输入 HTTP_AUTH_KEY 登录</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className='flex flex-col gap-3'
        >
          <input
            type='password'
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder='HTTP_AUTH_KEY'
            autoFocus
            className='w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 outline-none focus:border-mac-blue/60 focus:ring-2 focus:ring-mac-blue/20 transition-all'
          />
          {error && <p className='text-xs text-red-400 leading-relaxed'>{error}</p>}
          <button
            type='submit'
            disabled={loading || !key.trim()}
            className='w-full py-2.5 rounded-xl bg-mac-blue text-white text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
          >
            {loading && <Loader2 className='w-4 h-4 animate-spin' />}
            登录
          </button>
        </form>

        <p className='text-[11px] text-gray-500 text-center mt-5 leading-relaxed'>
          与 Karin WebUI 共享登录态，任一边登录后两边均免登录
        </p>
      </div>
    </div>
  )
}
