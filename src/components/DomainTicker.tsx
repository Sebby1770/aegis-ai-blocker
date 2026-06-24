import { rulePack } from '../lib/blocklists'

// A marquee of AI domains being held at the perimeter. Decorative, so it is
// aria-hidden and pauses under reduced motion (handled in CSS). The list is
// duplicated once so the loop is seamless.
const domains = Array.from(
  new Set(
    rulePack.categories
      .flatMap((category) => category.services)
      .flatMap((service) => service.domains)
      .filter((domain) => domain.length <= 20),
  ),
).slice(0, 26)

export function DomainTicker() {
  const items = [...domains, ...domains]

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {items.map((domain, index) => (
          <span className="ticker-item" key={`${domain}-${index}`}>
            <span className="ticker-dot" />
            BLOCKED <code>{domain}</code>
          </span>
        ))}
      </div>
    </div>
  )
}
