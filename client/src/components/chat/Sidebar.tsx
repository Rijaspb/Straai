import { useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Clock, CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Edit3, Trash2, Pin, PinOff } from 'lucide-react'

function groupChatsByTime(chats: ReturnType<typeof useChatStore.getState>['chats']) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000
  const startOf30Days = startOfToday - 30 * 24 * 60 * 60 * 1000

  const groups: Record<string, typeof chats> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
    Earlier: [],
  }

  const pinned = chats.filter((c) => c.pinned)
  groups['Pinned'] = pinned

  chats
    .filter((c) => !c.pinned)
    .forEach((c) => {
      const t = c.updatedAt
      if (t >= startOfToday) groups['Today'].push(c)
      else if (t >= startOfYesterday) groups['Yesterday'].push(c)
      else if (t >= startOf7Days) groups['Last 7 Days'].push(c)
      else if (t >= startOf30Days) groups['Last 30 Days'].push(c)
      else groups['Earlier'].push(c)
    })

  return groups
}

export function Sidebar() {
  const {
    chats,
    activeChatId,
    createNewChat,
    setActiveChat,
    renameChat,
    deleteChat,
    togglePin,
    sidebarCollapsed,
    setSidebarCollapsed,
    searchQuery,
    setSearchQuery,
  } = useChatStore()

  const { user } = useAuthStore()

  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats
    const q = searchQuery.toLowerCase()
    return chats.filter((c) => c.title.toLowerCase().includes(q))
  }, [chats, searchQuery])

  const groups = useMemo(() => groupChatsByTime(filteredChats), [filteredChats])

  const startEdit = (id: string, title: string) => {
    setEditingChatId(id)
    setEditingTitle(title)
  }

  const commitEdit = () => {
    if (editingChatId) {
      renameChat(editingChatId, editingTitle.trim() || 'Untitled')
    }
    setEditingChatId(null)
    setEditingTitle('')
  }

  return (
    <aside
      className={cn(
        'h-full border-r bg-gradient-to-b from-accent/40 via-background to-background transition-all duration-200 ease-out flex flex-col',
        sidebarCollapsed ? 'w-[60px]' : 'w-[280px]'
      )}
      aria-label="Chat history sidebar"
    >
      {/* Straai branding */}
      {sidebarCollapsed ? (
        <div className="pt-3 pb-1 px-1 flex items-center justify-between">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
            <span aria-hidden>S</span>
            <span className="sr-only">Straai</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
              <span aria-hidden>S</span>
              <span className="sr-only">Straai</span>
            </div>
            <div className="text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent select-none">
              Straai
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2 p-2">
        <Button className="w-full" size={sidebarCollapsed ? 'icon' : 'default'} onClick={() => createNewChat()}
          aria-label="New chat (Ctrl+N)"
        >
          {sidebarCollapsed ? <Plus className="w-4 h-4" /> : 'New Chat'}
        </Button>
      </div>

      {!sidebarCollapsed && (
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 glass border-gradient"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search chat history"
            />
          </div>
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto pr-1', sidebarCollapsed && 'px-1')}
           role="list"
           aria-label="Chat history groups"
      >
        {Object.entries(groups).map(([group, items]) => {
          if (items.length === 0) return null
          return (
            <div key={group} className={cn('px-2', sidebarCollapsed && 'px-0')}>
              {!sidebarCollapsed && (
                <div className="text-[10px] tracking-wider uppercase text-muted-foreground/80 px-2 py-2 flex items-center gap-1">
                  {group === 'Today' || group === 'Yesterday' ? (
                    <Clock className="w-3 h-3" />
                  ) : (
                    <CalendarDays className="w-3 h-3" />
                  )}
                  {group}
                </div>
              )}
              <div className="space-y-1">
                {items.map((c) => {
                  const active = c.id === activeChatId
                  return (
                    <div
                      key={c.id}
                      role="listitem"
                      className={cn(
                        'group flex items-center justify-between rounded-lg cursor-pointer hover:bg-accent/60 focus:bg-accent/60 outline-none transition-colors',
                        active && 'bg-accent/70 border-l-2 border-l-primary shadow-sm'
                      )}
                    >
                      <button
                        onClick={() => setActiveChat(c.id)}
                        className={cn('flex-1 text-left px-2 py-2 truncate hover:translate-x-[1px] transition-transform')}
                        aria-current={active ? 'true' : 'false'}
                        title={c.title}
                      >
                        {sidebarCollapsed ? c.title.slice(0, 2) : (
                          editingChatId === c.id ? (
                            <input
                              className="w-full bg-transparent focus:outline-none text-sm"
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit()
                                if (e.key === 'Escape') { setEditingChatId(null); setEditingTitle('') }
                              }}
                              aria-label="Rename chat"
                            />
                          ) : (
                            <span className="text-sm">{c.title}</span>
                          )
                        )}
                      </button>
                      {!sidebarCollapsed && (
                        <div className="flex items-center gap-1 pr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            title={c.pinned ? 'Unpin' : 'Pin'}
                            aria-label={c.pinned ? 'Unpin' : 'Pin'}
                            onClick={() => togglePin(c.id)}
                            className={cn(
                              'h-7 w-7 rounded-md border bg-card/70 text-muted-foreground shadow-sm transition',
                              'hover:bg-background hover:border-border/80 hover:text-foreground',
                              c.pinned && 'bg-primary/10 text-primary-700 border-primary/20'
                            )}
                          >
                            {c.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Rename"
                            aria-label="Rename"
                            onClick={() => startEdit(c.id, c.title)}
                            className="h-7 w-7 rounded-md border bg-card/70 text-muted-foreground shadow-sm transition hover:bg-background hover:border-border/80 hover:text-foreground"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            aria-label="Delete"
                            onClick={() => deleteChat(c.id)}
                            className="h-7 w-7 rounded-md border bg-card/70 text-red-500 shadow-sm transition hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t p-2 mt-auto">
        {!sidebarCollapsed && (
          <div className="flex items-center justify-between rounded-md px-2 py-2 glass border-gradient">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold">
                {(user?.email || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="text-sm truncate" title={user?.email || ''}>{user?.email || 'Account'}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}


