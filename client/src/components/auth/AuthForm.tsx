import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'
import { Loader2 } from 'lucide-react'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [showReset, setShowReset] = useState(false)
  
  const { signUp, signIn, signInWithGoogle, resetPassword } = useAuthStore()
  const navigate = useNavigate()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await signUp(email, password)
    
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for verification link!')
    }
    
    setLoading(false)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await signIn(email, password)
    
    if (error) {
      setMessage(error.message)
    } else {
      navigate('/dashboard')
    }
    
    setLoading(false)
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await signInWithGoogle()
    
    if (error) {
      setMessage(error.message)
      setLoading(false)
    }
    // Note: For OAuth, the redirect happens automatically
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await resetPassword(resetEmail)
    
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for password reset link!')
      setShowReset(false)
      setResetEmail('')
    }
    
    setLoading(false)
  }

  if (showReset) {
    return (
      <Card className="w-full max-w-md glass border-gradient elev-3 relative overflow-hidden">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Enter your email to receive a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            
            {message && (
              <div className={`text-sm ${message.includes('Check') ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </div>
            )}

            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full"
                onClick={() => setShowReset(false)}
              >
                Back to Sign In
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md glass border-gradient elev-3 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="h-full w-full bg-[radial-gradient(circle_at_1px_1px,_rgba(59,130,246,0.4)_1px,_transparent_0)] bg-[length:20px_20px]"></div>
      </div>
      <CardHeader className="relative">
        <CardTitle className="text-2xl font-bold text-gradient-primary">Welcome to Straai</CardTitle>
        <CardDescription className="text-gray-600">
          Sign in to your account or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {message && (
                <div className={`text-sm ${message.includes('Check') ? 'text-green-600' : 'text-red-600'}`}>
                  {message}
                </div>
              )}

              <div className="space-y-3">
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25 hover-lift" 
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full border-2 hover:bg-gray-50 hover-lift shimmer"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  Continue with Google
                </Button>
                
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-sm"
                  onClick={() => setShowReset(true)}
                >
                  Forgot password?
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {message && (
                <div className={`text-sm ${message.includes('Check') ? 'text-green-600' : 'text-red-600'}`}>
                  {message}
                </div>
              )}

              <div className="space-y-3">
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg shadow-blue-500/25 hover-lift" 
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full border-2 hover:bg-gray-50 hover-lift shimmer"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  Continue with Google
                </Button>
                
                <div className="text-xs text-muted-foreground text-center">
                  By creating an account, you agree to our{' '}
                  <a 
                    href="https://www.termsfeed.com/live/4f809a93-7a2a-40e1-9025-5fdf3a58b185" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="underline hover:text-foreground"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a 
                    href="https://www.termsfeed.com/live/c5482e4e-4177-4d97-8f2e-8116557b41d0" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="underline hover:text-foreground"
                  >
                    Privacy Policy
                  </a>
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
