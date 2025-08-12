import React from 'react'

type Source = 'shopify' | 'klaviyo' | 'mixed' | 'derived' | undefined

export function MetricBadge({ source }: { source: Source }) {
  if (!source) return null
  const label = source === 'shopify' ? 'Verified by Shopify' : source === 'klaviyo' ? 'Verified by Klaviyo' : source === 'mixed' ? 'Verified' : 'Derived'
  const cls =
    source === 'shopify'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : source === 'klaviyo'
      ? 'border-teal-300 bg-teal-50 text-teal-700'
      : source === 'mixed'
      ? 'border-blue-300 bg-blue-50 text-blue-700'
      : 'border-gray-300 bg-gray-50 text-gray-600'
  const dot =
    source === 'shopify'
      ? 'bg-emerald-500'
      : source === 'klaviyo'
      ? 'bg-teal-500'
      : source === 'mixed'
      ? 'bg-blue-500'
      : 'bg-gray-400'
  return (
    <span className={`inline-flex items-center gap-1.5 border text-[10px] px-2 py-0.5 rounded-full ${cls}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}


