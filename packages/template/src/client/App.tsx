import React from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatWindow } from './components/ChatWindow'
import { Overlays } from './components/Overlays'

export default function App () {
  return (
    <div className='flex h-full font-sans antialiased overflow-hidden bg-tg-chat-bg text-tg-text'>
      <Sidebar />
      <ChatWindow />
      <Overlays />
    </div>
  )
}
