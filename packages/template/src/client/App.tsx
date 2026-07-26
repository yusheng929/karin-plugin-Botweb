import React from 'react'
import { NavRail } from './components/NavRail'
import { Sidebar } from './components/Sidebar'
import { ChatWindow } from './components/ChatWindow'
import { Overlays } from './components/Overlays'

export default function App () {
  return (
    <div className='flex h-full font-sans antialiased overflow-hidden bg-qq-chat-bg text-qq-text'>
      <NavRail />
      <Sidebar />
      <ChatWindow />
      <Overlays />
    </div>
  )
}
