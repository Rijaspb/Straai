import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PricingCardProps {
  title: string
  price: string
  description?: string
  features: string[]
  onSelect: () => void
}

export function PricingCard({ title, price, features, onSelect }: PricingCardProps) {
  return (
    <div className="relative">
      {/* Popular badge positioned outside the card */}
      <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-500 to-emerald-400 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg animate-pulse z-10">
        Popular
      </div>
      
      <Card className="w-full max-w-md glass border-gradient elev-3 relative overflow-hidden group mt-4">
        {/* Premium background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="h-full w-full bg-[radial-gradient(circle_at_1px_1px,_rgba(59,130,246,0.4)_1px,_transparent_0)] bg-[length:20px_20px]"></div>
        </div>
      
      <CardHeader className="relative">
        <CardTitle className="text-2xl font-bold text-gradient-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-4xl font-bold text-gray-900">
          {price}
          <span className="text-lg text-gray-500 font-normal">/month</span>
        </div>
        <div className="text-sm text-green-600 font-medium mt-1">14-day free trial</div>
        
        <ul className="mt-6 space-y-4 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3 group-hover:text-gray-900 transition-colors">
              <div className="mt-0.5 w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 flex items-center justify-center flex-shrink-0 shadow-lg">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          className="w-full mt-8 py-3 text-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-xl shadow-blue-500/25 hover-lift shimmer" 
          onClick={onSelect}
        >
          Start Free Trial
        </Button>
        
        <p className="text-xs text-gray-500 text-center mt-3">
          No credit card required • Cancel anytime
        </p>
      </CardContent>
      </Card>
    </div>
  )
}


