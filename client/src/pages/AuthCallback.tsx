import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          navigate('/?error=' + encodeURIComponent(error.message))
          return
        }

        if (data.session) {
          // User is authenticated, redirect to dashboard
          navigate('/dashboard')
        } else {
          // No session found, redirect to home
          navigate('/')
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        navigate('/')
      }
    }

    handleAuthCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <p className="text-lg">Completing authentication...</p>
      </div>
    </div>
  )
}
