import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Toast } from '@heroui/react'
import App from './client/App'
import { ChatProvider } from './client/state/chat'
import { UiProvider } from './client/state/ui'
import { LoginScreen } from './client/components/LoginScreen'
import { isLoggedIn, onAuthChange } from './client/auth'
import './index.css'

/**
 * 登录态门控：未登录只渲染登录页，登录后才挂载 ChatProvider，
 * 这样面板的所有初始化请求（bots 列表、WS 连接）天然都带鉴权。
 * Toast.Provider 挂在最外层（HeroUI 全局轻提示，setToast 走 ToastQueue）。
 */
const Root: React.FC = () => {
  const [authed, setAuthed] = useState(isLoggedIn())

  useEffect(() => onAuthChange(() => setAuthed(isLoggedIn())), [])

  return (
    <>
      {/* 层级必须高于面板内所有浮层（原始事件等 z-[300]），否则浮层上的操作提示会沉到浮层下 */}
      <Toast.Provider placement='top' className='z-[400]' />
      {authed
        ? (
          <UiProvider>
            <ChatProvider>
              <App />
            </ChatProvider>
          </UiProvider>
          )
        : <LoginScreen />}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
