import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Send } from 'lucide-react'
import { TypingIndicator } from './TypingIndicator'

export function MessageInput() {
  const { sendMessage, isSending } = useChatStore()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = '0px'
    const scrollHeight = textareaRef.current.scrollHeight
    textareaRef.current.style.height = Math.min(scrollHeight, 160) + 'px'
  }, [value])

  const onSubmit = async () => {
    if (!value.trim() || isSending) return
    const content = value
    setValue('')
    await sendMessage(content)
  }

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative">
      {/* subtle top glow */}
      <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 w-[60%] h-8 bg-gradient-to-b from-cyan-300/20 to-transparent blur-2xl"></div>
      <div className="max-w-4xl mx-auto px-4 py-4">
        {isSending && (
          <div className="mb-4">
            <TypingIndicator />
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
              rows={1}
              placeholder="Type your message..."
              className={cn(
                'w-full resize-none glass border-gradient rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-md focus:shadow-lg'
              )}
              aria-label="Type your message"
              disabled={isSending}
            />
          </div>
          <Button onClick={onSubmit} disabled={isSending || !value.trim()} className="shrink-0 hover-lift bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25">
            <Send className="w-4 h-4 mr-2" /> Ask
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">Enter to send • Shift+Enter for new line</div>
      </div>
    </div>
  )
}


