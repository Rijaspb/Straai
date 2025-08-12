import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import { Copy, Check } from 'lucide-react'
import { SuggestedQuestions } from './SuggestedQuestions'
import { Button } from '@/components/ui/button'

export function ChatWindow() {
  const { chats, activeChatId } = useChatStore()
  const activeChat = chats.find((c) => c.id === activeChatId)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages.length])

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center relative px-4 sm:px-6 lg:px-8">
        <div className="text-center w-full max-w-3xl px-6 sm:px-8 py-8 sm:py-10 rounded-2xl glass border-gradient elev-3 hover-lift transition-shadow duration-300">
          <div className="text-2xl font-semibold mb-2">Welcome to Straai</div>
          <div className="text-sm text-muted-foreground mb-4">Start a new chat to ask about your Shopify and Klaviyo data.</div>
          <SuggestedQuestions />
          <div className="mt-4">
            <Button variant="outline" onClick={() => useChatStore.getState().createNewChat()}>New chat</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 bg-gradient-to-b from-background to-accent/30 relative">
      {/* floating backdrop accents */}
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        {activeChat.messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('flex w-full', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div className={cn('relative group max-w-[85%] md:max-w-[75%]', role === 'user' ? 'ml-auto' : 'mr-auto')}>
        {/* Message bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-sm border transition-all duration-200 hover:shadow-md',
            role === 'user'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-transparent shadow-md hover:shadow-lg hover:from-blue-700 hover:to-cyan-700'
              : 'glass border-gradient elev-1 backdrop-blur text-foreground hover:shadow-lg'
          )}
        >
          {/* Content */}
          <div className="whitespace-pre-wrap break-words">
            {content}
          </div>
        </div>

        {/* Copy button - only for assistant messages */}
        {role === 'assistant' && (
          <div className="flex justify-end mt-2">
            <button
              onClick={onCopy}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-background/80 hover:bg-background border rounded-full shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 hover:shadow-md',
                copied && 'text-emerald-600 bg-emerald-50 border-emerald-200'
              )}
              aria-label="Copy message"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


