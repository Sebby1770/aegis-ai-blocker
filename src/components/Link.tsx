import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../router'

type LinkProps = {
  to: string
  className?: string
  children: ReactNode
  onNavigate?: () => void
}

export function Link({ to, className, children, onNavigate }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }

    event.preventDefault()
    onNavigate?.()
    navigate(to)
  }

  return (
    <a href={to} className={className} onClick={handleClick}>
      {children}
    </a>
  )
}
