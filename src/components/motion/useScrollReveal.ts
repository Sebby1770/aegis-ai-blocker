import { useEffect } from 'react'

// Reveals every [data-reveal] element as it scrolls into view by toggling
// `.in-view`. Re-scans whenever `key` changes (i.e. on route change) so each
// page's sections animate in. Reduced-motion / unsupported platforms reveal
// everything immediately. The initial hidden state lives inside a
// prefers-reduced-motion: no-preference query (App.css), so content is never
// gated behind an animation that won't run.
export function useScrollReveal(key: string) {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (elements.length === 0) {
      return
    }

    const reduce =
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce) {
      elements.forEach((element) => element.classList.add('in-view'))
      return
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [key])
}
