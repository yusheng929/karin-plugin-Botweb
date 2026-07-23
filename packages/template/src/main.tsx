import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './client/App'
import { ChatProvider } from './client/ChatContext'
import { LoginScreen } from './client/components/LoginScreen'
import { isLoggedIn, onAuthChange } from './client/auth'
import './index.css'

/**
 * 登录态门控：未登录只渲染登录页，登录后才挂载 ChatProvider，
 * 这样面板的所有初始化请求（bots 列表、WS 连接）天然都带鉴权。
 */
const Root: React.FC = () => {
  const [authed, setAuthed] = useState(isLoggedIn())

  useEffect(() => onAuthChange(() => setAuthed(isLoggedIn())), [])

  return authed
    ? (
      <ChatProvider>
        <App />
      </ChatProvider>
      )
    : <LoginScreen />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
