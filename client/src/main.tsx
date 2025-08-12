import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// Progressive enhancement: ultra-smooth reveal-on-scroll without changing layout
function setupRevealAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const selector = [
    '.surface',
    '.elev-1',
    '.elev-2',
    '.rounded-xl',
    '.rounded-lg',
    'button',
    'input',
    'textarea',
    '[role=listitem]'
  ].join(',')

  const markAndObserve = (elements: Element[], observer: IntersectionObserver) => {
    elements.forEach((el) => {
      if (!(el as HTMLElement).classList.contains('will-reveal')) {
        (el as HTMLElement).classList.add('will-reveal')
        observer.observe(el)
      }
    })
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          ;(entry.target as HTMLElement).classList.add('reveal-visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  )

  // Initial batch
  markAndObserve(Array.from(document.querySelectorAll(selector)), observer)

  // Observe future nodes (e.g., route/page changes, lists)
  const mo = new MutationObserver(() => {
    markAndObserve(Array.from(document.querySelectorAll(selector)), observer)
  })
  mo.observe(document.body, { childList: true, subtree: true })
}

requestAnimationFrame(setupRevealAnimations)