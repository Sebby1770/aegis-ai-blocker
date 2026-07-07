import { useEffect, useRef } from 'react'
import { defaultDomainCount } from '../lib/marketing'

// Site-wide "mission control" chrome for marketing pages: a HUD perimeter
// bezel, a faint film grain, and an additive reticle cursor that locks onto
// interactive elements. All purely decorative (pointer-events: none) and
// disabled on touch / reduced-motion, so the native cursor and content are
// never affected.
export function SiteChrome() {
  const reticleRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLSpanElement | null>(null)

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

  // One delegated pointer listener drives three card/CTA effects:
  //   • spotlight  — a radial glow tracks the cursor across `.spotlight` cards,
  //   • 3D tilt    — those cards (except full-width `.cta-band`) lean toward the
  //                  cursor, and
  //   • magnetic   — `.magnetic` buttons are gently pulled toward the cursor.
  // Fine-pointer + no-reduced-motion only; a complete no-op on touch, and every
  // element is reset the moment the pointer leaves it.
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduce) {
      return
    }

    let activeCard: HTMLElement | null = null
    let activeMagnet: HTMLElement | null = null

    const clear = (element: HTMLElement | null) => {
      if (element) {
        element.style.transform = ''
      }
    }

    const onMove = (event: PointerEvent) => {
      const target = event.target as Element | null

      const card = (target?.closest?.('.spotlight') as HTMLElement | null) ?? null
      if (card !== activeCard) {
        clear(activeCard)
        activeCard = card
      }
      if (card) {
        const rect = card.getBoundingClientRect()
        const mx = event.clientX - rect.left
        const my = event.clientY - rect.top
        card.style.setProperty('--mx', `${mx}px`)
        card.style.setProperty('--my', `${my}px`)

        if (!card.classList.contains('cta-band')) {
          const px = mx / rect.width - 0.5
          const py = my / rect.height - 0.5
          card.style.transform =
            `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) ` +
            `rotateY(${(px * 5).toFixed(2)}deg) translateY(-4px)`
        }
      }

      const magnet = (target?.closest?.('.magnetic') as HTMLElement | null) ?? null
      if (magnet !== activeMagnet) {
        clear(activeMagnet)
        activeMagnet = magnet
      }
      if (magnet) {
        const rect = magnet.getBoundingClientRect()
        const dx = event.clientX - (rect.left + rect.width / 2)
        const dy = event.clientY - (rect.top + rect.height / 2)
        magnet.style.transform = `translate(${(dx * 0.22).toFixed(1)}px, ${(dy * 0.32).toFixed(1)}px)`
      }
    }

    const onLeave = () => {
      clear(activeCard)
      clear(activeMagnet)
      activeCard = null
      activeMagnet = null
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  // Thin scroll-progress bar across the top of the viewport.
  useEffect(() => {
    const bar = progressRef.current
    if (!bar) {
      return
    }

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      bar.style.transform = `scaleX(${progress})`
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <>
      <div className="scroll-progress" aria-hidden="true">
        <span ref={progressRef} />
      </div>
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
