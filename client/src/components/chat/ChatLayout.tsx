import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, BarChart3, LogOut } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'

export function ChatLayout() {
  const navigate = useNavigate()
  const { signOut } = useAuthStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        // Create new empty chat and focus input (input focus is implicit by user)
        useChatStore.getState().createNewChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-screen grid overflow-hidden bg-gradient-to-b from-background via-white to-accent/30" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <Sidebar />
      <div className="flex flex-col min-w-0 relative">
        <div className="absolute top-3 right-3 z-50 flex gap-2">
          <div
            className="group relative h-9 w-9 rounded-full bg-card/80 border-gradient elev-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow ring-1 ring-border/50 hover:ring-primary/40 transition cursor-pointer backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            role="button"
            aria-label="Open reports"
            tabIndex={0}
            onClick={() => navigate('/dashboard/reports')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/dashboard/reports')
            }}
            title="Reports"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded-md bg-popover border text-xs text-muted-foreground opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition whitespace-nowrap">
              Reports
            </span>
          </div>
          <div
            className="group relative h-9 w-9 rounded-full bg-card/80 border-gradient elev-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow ring-1 ring-border/50 hover:ring-primary/40 transition cursor-pointer backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            role="button"
            aria-label="Open settings"
            tabIndex={0}
            onClick={() => navigate('/dashboard/settings')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/dashboard/settings')
            }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded-md bg-popover border text-xs text-muted-foreground opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition whitespace-nowrap">
              Settings
            </span>
          </div>
          <div
            className="group relative h-9 w-9 rounded-full bg-card/80 border-gradient elev-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow ring-1 ring-border/50 hover:ring-primary/40 transition cursor-pointer backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            role="button"
            aria-label="Sign out"
            tabIndex={0}
            onClick={async () => { await signOut(); window.location.href = '/' }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' || e.key === ' ') { await signOut(); window.location.href = '/' }
            }}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded-md bg-popover border text-xs text-muted-foreground opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition whitespace-nowrap">
              Sign out
            </span>
          </div>
        </div>
        <ChatWindow />
        <MessageInput />
      </div>
    </div>
  )
}


