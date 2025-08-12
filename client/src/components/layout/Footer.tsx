import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'

export function Footer() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return
    setSubmitted(true)
    try {
      const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to subscribe')
      }
      setEmail('')
    } catch (err: any) {
      setSubmitted(false)
      setError(err?.message || 'Subscription failed')
    }
  }

  return (
    <footer className="relative border-t border-gray-200/50 bg-gradient-to-b from-white to-gray-50/80 backdrop-blur-sm">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="h-full w-full bg-[radial-gradient(circle_at_1px_1px,_rgba(59,130,246,0.3)_1px,_transparent_0)] bg-[length:40px_40px]"></div>
      </div>
      <div className="container mx-auto px-4 py-12 grid gap-8 md:grid-cols-4 relative">
        <div>
          <div className="text-lg font-semibold bg-gradient-to-r from-sky-600 to-cyan-600 bg-clip-text text-transparent">Straai</div>
          <p className="text-sm text-muted-foreground mt-2">
            Conversational analytics for Shopify and Klaviyo.
          </p>
          <address className="not-italic text-sm text-muted-foreground mt-4">
            Straai Ltd<br/>
            184 E, Perth Road<br/>
            Dundee, UK
          </address>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Legal</div>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li><a href="https://www.termsfeed.com/live/c5482e4e-4177-4d97-8f2e-8116557b41d0" target="_blank" rel="noopener noreferrer" className="hover:underline">Privacy Policy</a></li>
            <li><a href="https://www.termsfeed.com/live/4f809a93-7a2a-40e1-9025-5fdf3a58b185" target="_blank" rel="noopener noreferrer" className="hover:underline">Terms of Service</a></li>
            <li><a href="https://www.termsfeed.com/live/e9e8e88f-ec6a-4526-810d-ebda4e7b9235" target="_blank" rel="noopener noreferrer" className="hover:underline">Cookie Policy</a></li>
          </ul>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Contact</div>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a href="mailto:support@straai.com" className="hover:underline">support@straai.com</a>
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.047-1.856-3.047-1.856 0-2.136 1.445-2.136 2.939v5.677H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <a href="https://www.linkedin.com/in/rijaspb/" target="_blank" rel="noopener noreferrer" className="hover:underline">straai</a>
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <a href="https://forms.gle/4Yxhg4G4HztsZ8Nb7" target="_blank" rel="noopener noreferrer" className="hover:underline">feedback</a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Newsletter</div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email for newsletter signup"
              className="border-2 focus:border-blue-500 transition-colors"
              required
            />
            <Button 
              type="submit" 
              disabled={submitted}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25 hover-lift"
            >
              {submitted ? 'Thanks!' : 'Sign up'}
            </Button>
          </form>
          {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          <p className="text-xs text-muted-foreground mt-2">
            We'll occasionally send product updates. Unsubscribe anytime.{' '}
            <a 
              href="https://www.termsfeed.com/live/c5482e4e-4177-4d97-8f2e-8116557b41d0" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="underline hover:text-foreground"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
      <div className="border-t border-gray-200/50 py-6 text-center text-xs text-gray-500 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-100/50 to-transparent"></div>
        <div className="relative">
          © {new Date().getFullYear()} Straai. All rights reserved.
        </div>
      </div>
    </footer>
  )
}


