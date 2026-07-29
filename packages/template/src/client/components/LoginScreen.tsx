import React, { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, FieldError, Input, Spinner, TextField } from '@heroui/react'
import { login } from '../auth'

/**
 * 登录页（仿 macOS QQ 登录窗）：圆角卡片 + 红绿灯装饰 + 居中大标 + 胶囊输入/按钮。
 * 输入 karin 的 HTTP_AUTH_KEY，调 karin 的 /api/v1/login 换取 JWT。
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
    <div className='flex h-full items-center justify-center bg-qq-sidebar font-sans antialiased'>
      <div className='w-full max-w-[340px] mx-4 bg-qq-bg rounded-2xl shadow-2xl shadow-black/10 overflow-hidden animate-in zoom-in-95 duration-200'>
        {/* macOS 标题栏装饰 */}
        <div className='traffic-lights px-4 pt-4'>
          <span className='tl-close' />
          <span className='tl-min' />
          <span className='tl-max' />
        </div>

        <div className='px-9 pb-9 pt-4'>
          <div className='flex flex-col items-center mb-8'>
            <div className='w-[76px] h-[76px] rounded-full bg-gradient-to-b from-qq-blue/70 to-qq-blue flex items-center justify-center mb-4 shadow-lg shadow-qq-blue/30'>
              <Send className='w-8 h-8 text-white -ml-1' />
            </div>
            <h1 className='text-[19px] font-semibold tracking-wide text-qq-text'>BotWeb</h1>
            <p className='text-xs text-qq-text-secondary mt-1.5'>请输入 HTTP_AUTH_KEY 登录</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className='flex flex-col gap-3'
          >
            <TextField
              fullWidth
              autoFocus
              type='password'
              value={key}
              onChange={setKey}
              isInvalid={!!error}
              aria-label='HTTP_AUTH_KEY'
            >
              <Input placeholder='HTTP_AUTH_KEY' />
              {error && <FieldError>{error}</FieldError>}
            </TextField>
            <Button
              fullWidth
              size='lg'
              isPending={loading}
              isDisabled={!key.trim()}
              onPress={() => void submit()}
            >
              {({ isPending }) => (
                <>
                  {isPending && <Spinner color='current' size='sm' />}
                  登录
                </>
              )}
            </Button>
          </form>

          <p className='text-[11px] text-qq-text-secondary text-center mt-7 leading-relaxed'>
            与 Karin WebUI 共享登录态
            <br />
            任一边登录后两边均免登录
          </p>
        </div>
      </div>
    </div>
  )
}
