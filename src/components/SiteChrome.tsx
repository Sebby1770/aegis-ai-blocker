import { useEffect, useRef } from 'react'
import { defaultDomainCount } from '../lib/marketing'

// Site-wide "mission control" chrome for marketing pages: a HUD perimeter
// bezel, a faint film grain, and an additive reticle cursor that locks onto
// interactive elements. All purely decorative (pointer-events: none) and
// disabled on touch / reduced-motion, so the native cursor and content are
// never affected.
export function SiteChrome() {
  const reticleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const reticle = reticleRef.current
    if (!reticle) {
      return
    }

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduce) {
      return
    }

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let x = targetX
    let y = targetY
    let raf = 0
    let shown = false

    const lockSelector =
      'a,button,input,summary,label,[role="tab"],.policy-card,.device-option,.category-row,.mode-pill,.faq-item'

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX
      targetY = event.clientY
      if (!shown) {
        shown = true
        x = targetX
        y = targetY
        reticle.classList.add('is-on')
      }
      const target = event.target as Element | null
      const locked = Boolean(target?.closest?.(lockSelector))
      reticle.classList.toggle('is-locked', locked)
    }

    const onLeave = () => {
      shown = false
      reticle.classList.remove('is-on')
    }

    const loop = () => {
      x += (targetX - x) * 0.2
      y += (targetY - y) * 0.2
      reticle.style.setProperty('--rx', `${x}px`)
      reticle.style.setProperty('--ry', `${y}px`)
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    loop()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  // Pointer-follow spotlight for cards marked `.spotlight`. One delegated
  // listener updates the hovered card's --mx/--my so a radial glow tracks the
  // cursor (see App.css). Fine-pointer only; a no-op on touch.
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (!fine) {
      return
    }

    const onMove = (event: PointerEvent) => {
      const target = event.target as Element | null
      const card = target?.closest?.('.spotlight') as HTMLElement | null
      if (!card) {
        return
      }
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
      card.style.setProperty('--my', `${event.clientY - rect.top}px`)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <>
      <div className="hud-frame" aria-hidden="true">
        <span className="hud-corner hud-tl" />
        <span className="hud-corner hud-tr" />
        <span className="hud-corner hud-bl" />
        <span className="hud-corner hud-br" />
        <span className="hud-readout">
          AEGIS · PERIMETER ACTIVE · {defaultDomainCount} DOMAINS CONTAINED
        </span>
      </div>
      <div className="grain" aria-hidden="true" />
      <div ref={reticleRef} className="reticle" aria-hidden="true" />
    </>
  )
}
