import React, { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
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
    <div className='flex h-full items-center justify-center bg-tg-chat-bg font-sans antialiased'>
      <div className='w-full max-w-[360px] mx-4 rounded-2xl bg-tg-bg shadow-xl p-8 animate-in zoom-in-95 duration-200'>
        <div className='flex flex-col items-center mb-8'>
          <div className='w-20 h-20 rounded-full bg-tg-blue flex items-center justify-center mb-4 shadow-lg'>
            <Send className='w-9 h-9 text-white -ml-1' />
          </div>
          <h1 className='text-xl font-semibold'>BotWeb</h1>
          <p className='text-sm text-tg-text-secondary mt-1.5'>请输入 HTTP_AUTH_KEY 登录</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className='flex flex-col gap-4'
        >
          <input
            type='password'
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder='HTTP_AUTH_KEY'
            autoFocus
            className='w-full px-4 py-3 rounded-xl bg-tg-hover text-sm outline-none placeholder:text-tg-text-secondary focus:ring-2 focus:ring-tg-blue/50 transition-shadow'
          />
          {error && <p className='text-xs text-red-500 leading-relaxed'>{error}</p>}
          <button
            type='submit'
            disabled={loading || !key.trim()}
            className='w-full py-3 rounded-xl bg-tg-blue text-white text-sm font-medium uppercase tracking-wide transition-colors hover:bg-tg-blue-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
          >
            {loading && <Loader2 className='w-4 h-4 animate-spin' />}
            登录
          </button>
        </form>

        <p className='text-xs text-tg-text-secondary text-center mt-6 leading-relaxed'>
          与 Karin WebUI 共享登录态，任一边登录后两边均免登录
        </p>
      </div>
    </div>
  )
}
