import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './client/App'
import { ChatProvider } from './client/ChatContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChatProvider>
      <App />
    </ChatProvider>
  </React.StrictMode>
)
