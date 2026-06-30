import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JS module shared with the extension service worker
import { buildDnrRules, RESOURCE_TYPES, resolveBlockedDomains } from './enforce.js'
import pack from './rules/pack.json'

type Pack = typeof pack

const ALL_DOMAINS = new Set(pack.services.flatMap((service) => service.domains))

describe('resolveBlockedDomains', () => {
  it('strict-no-ai blocks every service (including strict-only) under strict mode', () => {
    const { blocked } = resolveBlockedDomains(pack as Pack, { activePolicyId: 'strict-no-ai' })
    expect(blocked).toContain('chatgpt.com')
    expect(blocked).toContain('huggingface.co') // strict-only, included because the policy is strict
    expect(new Set(blocked).size).toBe(blocked.length) // de-duplicated
    expect(blocked.every((domain) => ALL_DOMAINS.has(domain))).toBe(true)
  })

  it('focus blocks chat/search/creative but leaves coding tools reachable', () => {
    const { blocked } = resolveBlockedDomains(pack as Pack, { activePolicyId: 'focus' })
    expect(blocked).toContain('chatgpt.com') // chat blocked
    expect(blocked).toContain('perplexity.ai') // search blocked
    expect(blocked).not.toContain('cursor.com') // coding allowed under Focus
  })

  it('omits strict-only services when the policy is not strict', () => {
    const { blocked } = resolveBlockedDomains(pack as Pack, { activePolicyId: 'focus' })
    expect(blocked).not.toContain('huggingface.co')
  })

  it('paused enforces nothing from the pack', () => {
    const { blocked } = resolveBlockedDomains(pack as Pack, { activePolicyId: 'strict-no-ai', paused: true })
    expect(blocked).toEqual([])
  })

  it('allow exceptions win over the policy', () => {
    const { blocked, allowed } = resolveBlockedDomains(pack as Pack, {
      activePolicyId: 'strict-no-ai',
      allowDomains: ['chatgpt.com'],
    })
    expect(blocked).not.toContain('chatgpt.com')
    expect(allowed).toContain('chatgpt.com')
  })

  it('block exceptions add domains beyond the pack, even when paused', () => {
    const { blocked } = resolveBlockedDomains(pack as Pack, {
      paused: true,
      blockDomains: ['internal-ai.example.com'],
    })
    expect(blocked).toEqual(['internal-ai.example.com'])
  })

  it('falls back to strict-no-ai for an unknown policy id', () => {
    const fallback = resolveBlockedDomains(pack as Pack, { activePolicyId: 'does-not-exist' })
    const strict = resolveBlockedDomains(pack as Pack, { activePolicyId: 'strict-no-ai' })
    expect(fallback.blocked).toEqual(strict.blocked)
  })
})

describe('buildDnrRules', () => {
  it('emits valid, uniquely-identified block and allow rules', () => {
    const rules = buildDnrRules({ blocked: ['chatgpt.com', 'claude.ai'], allowed: ['github.com'] })
    const ids = rules.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)

    const block = rules.find((rule) => rule.condition.urlFilter === '||chatgpt.com^')
    expect(block?.action.type).toBe('block')
    expect(block?.priority).toBe(1)
    expect(block?.condition.resourceTypes).toEqual(RESOURCE_TYPES)

    const allow = rules.find((rule) => rule.action.type === 'allow')
    expect(allow?.priority).toBe(2) // allow overrides block
    expect(allow?.condition.urlFilter).toBe('||github.com^')
  })
})
