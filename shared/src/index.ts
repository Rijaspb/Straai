// Shared code used by both frontend and backend

export type UserRole = 'admin' | 'member'

export interface PlanLimits {
  maxReportsPerMonth: number
  maxQuickWinsPerDay: number
}

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  maxReportsPerMonth: 50,
  maxQuickWinsPerDay: 10,
}

export function formatCurrency(amountInCents: number, currency: string = 'USD'): string {
  const amount = amountInCents / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}


