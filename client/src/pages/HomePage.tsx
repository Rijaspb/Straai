import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { AuthForm } from "@/components/auth/AuthForm"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { PricingCard } from "@/components/pricing/PricingCard"
import { Footer } from "@/components/layout/Footer"

export function HomePage() {
  const navigate = useNavigate()
  const { user, loading, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard')
    }
  }, [user, loading, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Advanced animated background system */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-sky-50/50">
        
        {/* Layer 1: Advanced gradient mesh */}
        <div className="absolute inset-0 gradient-mesh-advanced animate-gradient-y"></div>
        
        {/* Layer 2: Tech grid overlay */}
        <div className="absolute inset-0 tech-grid opacity-40"></div>
        
        {/* Layer 3: Floating gradient orbs */}
        <div className="absolute inset-0 opacity-70">
          <div className="absolute top-0 left-0 w-64 sm:w-80 lg:w-96 h-64 sm:h-80 lg:h-96 bg-gradient-to-br from-blue-400/20 via-cyan-300/15 to-sky-200/10 rounded-full blur-3xl animate-gradient-y"></div>
          <div className="absolute top-1/4 right-0 w-56 sm:w-72 lg:w-80 h-56 sm:h-72 lg:h-80 bg-gradient-to-bl from-purple-400/15 via-blue-300/20 to-cyan-200/15 rounded-full blur-3xl animate-float" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-0 left-1/3 w-48 sm:w-64 lg:w-72 h-48 sm:h-64 lg:h-72 bg-gradient-to-tr from-cyan-300/20 via-sky-200/15 to-blue-300/10 rounded-full blur-3xl animate-breathe"></div>
          <div className="absolute top-1/2 left-1/2 w-40 sm:w-56 lg:w-64 h-40 sm:h-56 lg:h-64 bg-gradient-to-r from-indigo-300/15 to-purple-300/15 rounded-full blur-3xl animate-gradient-x" style={{animationDelay: '2s'}}></div>
        </div>
        
        {/* Layer 4: Sophisticated geometric tech shapes */}
        <div className="absolute inset-0 opacity-40">
          {/* Rotating tech rings */}
          <div className="absolute top-1/6 left-1/6 w-16 h-16 tech-ring animate-rotate-slow"></div>
          <div className="absolute top-2/3 right-1/5 w-12 h-12 tech-ring animate-rotate-reverse" style={{animationDelay: '3s'}}></div>
          <div className="absolute bottom-1/4 left-2/3 w-20 h-20 tech-ring animate-rotate-slow" style={{animationDelay: '6s'}}></div>
          
          {/* Morphing geometric shapes */}
          <div className="absolute top-1/5 right-1/3 tech-shape-1 animate-morph" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-3/5 left-1/5 tech-shape-2 animate-morph" style={{animationDelay: '3s'}}></div>
          <div className="absolute bottom-1/5 right-1/6 tech-shape-3 animate-morph" style={{animationDelay: '5s'}}></div>
          <div className="absolute top-1/2 left-1/6 tech-shape-1 animate-wave" style={{animationDelay: '2s'}}></div>
          <div className="absolute bottom-1/3 right-2/5 tech-shape-2 animate-wave" style={{animationDelay: '4s'}}></div>
          
          {/* Orbiting elements */}
          <div className="absolute top-1/3 left-1/2 w-8 h-8">
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-orbit"></div>
          </div>
          <div className="absolute bottom-1/2 right-1/3 w-10 h-10">
            <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-pink-400 rounded-full animate-orbit" style={{animationDelay: '2s'}}></div>
          </div>
          
          {/* Floating tech dots with advanced animations */}
          <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-breathe"></div>
          <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-gradient-to-r from-purple-500 to-blue-400 rounded-full animate-glow" style={{animationDelay: '0.5s'}}></div>
          <div className="absolute bottom-1/3 left-1/2 w-2.5 h-2.5 bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full animate-float" style={{animationDelay: '1.5s'}}></div>
          <div className="absolute top-1/2 right-1/3 w-1.5 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full animate-pulse-slow" style={{animationDelay: '2.5s'}}></div>
          <div className="absolute top-3/4 left-3/4 w-2 h-2 bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full animate-glow" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-1/5 left-1/4 w-1.5 h-1.5 bg-gradient-to-r from-pink-500 to-purple-400 rounded-full animate-breathe" style={{animationDelay: '3s'}}></div>
        </div>
        
        {/* Layer 5: Circuit-inspired patterns */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/6 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-400/30 via-cyan-400/30 to-transparent animate-shimmer"></div>
          <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400/30 via-blue-400/30 to-transparent animate-shimmer" style={{animationDelay: '2s'}}></div>
          <div className="absolute bottom-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-400/30 via-sky-400/30 to-transparent animate-shimmer" style={{animationDelay: '4s'}}></div>
          
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-400/20 via-cyan-400/20 to-transparent animate-shimmer" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-purple-400/20 via-blue-400/20 to-transparent animate-shimmer" style={{animationDelay: '3s'}}></div>
        </div>
        
        {/* Layer 6: Particle system */}
        <div className="absolute inset-0 opacity-60">
          {/* Animated particles */}
          <div className="absolute top-1/5 left-1/8 particle particle-1 animate-float" style={{animationDelay: '0s'}}></div>
          <div className="absolute top-1/3 left-1/2 particle particle-2 animate-float" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-2/3 left-1/6 particle particle-3 animate-float" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/2 right-1/8 particle particle-1 animate-float" style={{animationDelay: '1.5s'}}></div>
          <div className="absolute bottom-1/4 right-1/3 particle particle-2 animate-float" style={{animationDelay: '0.8s'}}></div>
          <div className="absolute top-3/4 left-2/3 particle particle-3 animate-float" style={{animationDelay: '2.3s'}}></div>
          <div className="absolute bottom-1/6 left-1/3 particle particle-1 animate-float" style={{animationDelay: '1.2s'}}></div>
          <div className="absolute top-1/8 right-1/4 particle particle-2 animate-float" style={{animationDelay: '2.8s'}}></div>
        </div>
        
        {/* Layer 7: Hexagonal tech pattern overlay */}
        <div className="absolute inset-0 hex-pattern opacity-30"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <div className="container mx-auto px-4 py-12 sm:py-16 lg:py-20 flex-1">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-start lg:items-center min-h-[70vh] sm:min-h-[75vh]">
            {/* Left side - Hero content */}
            <div className="space-y-8 relative animate-slide-up">
              {/* Badge */}
              <div className="inline-flex items-center px-3 sm:px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100/50 backdrop-blur-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                <span className="text-xs sm:text-sm font-medium text-blue-700">AI-Powered Analytics Platform</span>
            </div>
            
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-none">
                  <span className="block bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                    Welcome to
                  </span>
                  <span className="block bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-clip-text text-transparent animate-gradient-x">
                    Straai
                  </span>
            </h1>
                
                <p className="text-lg sm:text-xl lg:text-2xl text-gray-600 max-w-lg leading-relaxed font-light">
                  Transform your Shopify + Klaviyo data into actionable insights through natural conversation.
                </p>
              </div>
              
              <div className="space-y-5">
                <div className="flex items-center space-x-4 group">
                  <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full animate-pulse"></div>
                  <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">AI-powered analytics engine</span>
                </div>
                <div className="flex items-center space-x-4 group">
                  <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">Real-time data insights</span>
                </div>
                <div className="flex items-center space-x-4 group">
                  <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                  <span className="text-lg text-gray-700 group-hover:text-gray-900 transition-colors">Seamless integration</span>
              </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button 
                  size="lg" 
                  className="px-6 sm:px-8 py-4 text-base sm:text-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-xl shadow-blue-500/25 hover-lift animate-scale-in"
                  onClick={() => navigate('/dashboard')}
                >
                  Start Free Trial
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="px-6 sm:px-8 py-4 text-base sm:text-lg font-semibold border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover-lift animate-scale-in shimmer"
                  style={{animationDelay: '0.1s'}}
                  onClick={() => navigate('/dashboard')}
                >
                  Sign In
                </Button>
            </div>
          </div>

          {/* Right side - Auth form + price card */}
            <div className="grid gap-8 animate-slide-down">
            <div className="flex justify-center lg:justify-end">
                <div className="hover-lift animate-scale-in" style={{animationDelay: '0.3s'}}>
              <AuthForm />
            </div>
              </div>
              <div className="flex justify-center lg:justify-end pt-2">
                <div className="hover-lift animate-scale-in" style={{animationDelay: '0.5s'}}>
              <PricingCard
                title="Starter"
                price="$29"
                features={["Shopify + Klaviyo", "Unlimited chat conversations", "Weekly email analytics and insights", "Chat history"]}
                onSelect={() => navigate('/dashboard')}
              />
            </div>
          </div>
        </div>
      </div>
        </div>
        
        <div className="animate-slide-up" style={{animationDelay: '0.7s'}}>
      <Footer />
        </div>
      </div>
    </div>
  )
}
