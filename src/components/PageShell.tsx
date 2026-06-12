import { MarketingHeader } from './MarketingHeader'

type PageShellProps = {
  title: string
  intro?: string
  children: React.ReactNode
}

export function PageShell({ title, intro, children }: PageShellProps) {
  return (
    <div className="legal-page">
      <MarketingHeader />
      <article className="legal-body">
        <h1>{title}</h1>
        {intro ? <p className="legal-updated">{intro}</p> : null}
        {children}
      </article>
    </div>
  )
}
