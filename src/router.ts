import { useEffect, useState } from 'react'

// Minimal history-based router; the Link component lives in components/Link.

export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return pathname
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search + window.location.hash) {
    return
  }

  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}
