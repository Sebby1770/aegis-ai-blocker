import { useEffect, useRef, useState } from 'react'

// True when the user asked for less motion, or when the platform can't observe
// intersections — in both cases callers should skip animation and show the
// final state immediately.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  if (typeof IntersectionObserver === 'undefined') {
    return true
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Fires once, when the element first scrolls into view. Reduced-motion users
// (and unsupported platforms) start "in view" so nothing is ever gated behind
// an animation that won't run.
export function useInView<T extends Element = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(prefersReducedMotion)

  useEffect(() => {
    if (inView) {
      return
    }
    const element = ref.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [inView])

  return { ref, inView }
}
