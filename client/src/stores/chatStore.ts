import { create } from 'zustand'
import { useAuthStore } from './authStore'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface ChatThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  messages: ChatMessage[]
}

interface ChatState {
  chats: ChatThread[]
  activeChatId: string | null
  isSending: boolean
  sidebarCollapsed: boolean
  searchQuery: string
  createNewChat: (initialMessage?: string) => string
  setActiveChat: (chatId: string) => void
  renameChat: (chatId: string, title: string) => void
  deleteChat: (chatId: string) => void
  togglePin: (chatId: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSearchQuery: (q: string) => void
  sendMessage: (content: string) => Promise<void>
  addAssistantMessage: (content: string) => void
}

function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  isSending: false,
  sidebarCollapsed: false,
  searchQuery: '',

  createNewChat: (initialMessage?: string) => {
    const chatId = generateId('chat')
    const now = Date.now()
    const initialMessages: ChatMessage[] = []
    let title = 'New chat'
    if (initialMessage && initialMessage.trim().length > 0) {
      const msg: ChatMessage = {
        id: generateId('msg'),
        role: 'user',
        content: initialMessage.trim(),
        createdAt: now,
      }
      initialMessages.push(msg)
      title = initialMessage.slice(0, 40)
    }
    const newChat: ChatThread = {
      id: chatId,
      title,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      messages: initialMessages,
    }
    set((state) => ({
      chats: [newChat, ...state.chats],
      activeChatId: chatId,
    }))
    return chatId
  },

  setActiveChat: (chatId: string) => set({ activeChatId: chatId }),

  renameChat: (chatId: string, title: string) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
    })),

  deleteChat: (chatId: string) =>
    set((state) => {
      const remaining = state.chats.filter((c) => c.id !== chatId)
      const newActive = state.activeChatId === chatId ? remaining[0]?.id ?? null : state.activeChatId
      return { chats: remaining, activeChatId: newActive }
    }),

  togglePin: (chatId: string) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, pinned: !c.pinned } : c)),
    })),

  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

  setSearchQuery: (q: string) => set({ searchQuery: q }),

  sendMessage: async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const state = get()
    let chatId = state.activeChatId
    if (!chatId) {
      chatId = get().createNewChat(trimmed)
    }

    const now = Date.now()
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'user',
      content: trimmed,
      createdAt: now,
    }

    set((s) => ({
      isSending: true,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [...c.messages, message],
              title: c.messages.length === 0 ? trimmed.slice(0, 40) : c.title,
              updatedAt: now,
            }
          : c
      ),
    }))

    try {
      const token = useAuthStore.getState().session?.access_token
      const resp = await fetch('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: trimmed }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || 'Failed to query AI')
      }
      const ai = data?.data
      const formatted = ai?.executive_summary
        ? `Here's what I'm seeing in your data:\n\n${ai.executive_summary}\n\nKey metrics:\n${(ai.key_metrics || []).map((k: any) => `- ${k.name}: ${k.value} — ${k.explanation}`).join('\n')}\n\nTop recommendations:\n${(ai.top_recommendations || []).map((r: string) => `- ${r}`).join('\n')}\n\nConfidence: ${(ai.confidence_score ?? 0).toFixed(2)}`
        : (data?.message || 'Received.')
      get().addAssistantMessage(formatted)
    } catch (e: any) {
      get().addAssistantMessage(`Error: ${e?.message || 'Failed to reach AI service.'}`)
    } finally {
      set({ isSending: false })
    }
  },

  addAssistantMessage: (content: string) => {
    const { activeChatId, chats } = get()
    if (!activeChatId) return
    const now = Date.now()
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content,
      createdAt: now,
    }
    set({
      chats: chats.map((c) =>
        c.id === activeChatId
          ? { ...c, messages: [...c.messages, message], updatedAt: now }
          : c
      ),
    })
  },
}))


