export function TypingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="relative group max-w-[85%] md:max-w-[75%] mr-auto">
        <div className="glass border-gradient elev-1 backdrop-blur rounded-2xl px-5 py-4 transition-all duration-200">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-sm">Assistant is typing</span>
            <Dot />
            <Dot style={{ animationDelay: '120ms' }} />
            <Dot style={{ animationDelay: '240ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Dot(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-bounce [animation-duration:1000ms]"
    />
  )
}


