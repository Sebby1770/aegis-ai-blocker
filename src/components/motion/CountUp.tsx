import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion, useInView } from './useInView'

type Props = {
  end: number
  duration?: number
  className?: string
}

// Counts up from zero to `end` the first time it scrolls into view. Reduced
// motion shows the final value instantly (lazy initial state — never a
// set-state-in-effect). Uses requestAnimationFrame timestamps, so no clock.
export function CountUp({ end, duration = 1500, className }: Props) {
  const { ref, inView } = useInView<HTMLSpanElement>()
  const [value, setValue] = useState(() => (prefersReducedMotion() ? end : 0))
  const started = useRef(false)

  useEffect(() => {
    if (!inView || started.current || prefersReducedMotion()) {
      return
    }
    started.current = true

    let raf = 0
    let startTs = 0
    const tick = (ts: number) => {
      if (!startTs) {
        startTs = ts
      }
      const progress = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(end * eased))
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, end, duration])

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
    </span>
  )
}
