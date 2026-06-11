import { describe, expect, it } from 'vitest'
import {
  buildExport,
  extensionForFormat,
  getActiveDomains,
  getActiveServices,
  isDomainBlocked,
  normalizeDomain,
  rulePack,
} from './blocklists'

const allEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))
const noneEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, false]))

describe('normalizeDomain', () => {
  it('strips protocol, path, casing, and www', () => {
    expect(normalizeDomain('https://www.ChatGPT.com/some/path?q=1')).toBe('chatgpt.com')
    expect(normalizeDomain('claude.ai')).toBe('claude.ai')
    expect(normalizeDomain('  HTTP://Perplexity.AI  ')).toBe('perplexity.ai')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeDomain('')).toBe('')
    expect(normalizeDomain('   ')).toBe('')
  })
})

describe('isDomainBlocked', () => {
  const domains = ['openai.com', 'claude.ai']

  it('matches exact domains and subdomains', () => {
    expect(isDomainBlocked('openai.com', domains).blocked).toBe(true)
    expect(isDomainBlocked('docs.openai.com', domains).blocked).toBe(true)
    expect(isDomainBlocked('https://claude.ai/new', domains).blocked).toBe(true)
  })

  it('does not match lookalike suffixes', () => {
    expect(isDomainBlocked('notopenai.com', domains).blocked).toBe(false)
    expect(isDomainBlocked('claude.ai.evil.com', domains).blocked).toBe(false)
  })

  it('reports the matched domain', () => {
    expect(isDomainBlocked('api.openai.com', domains).matchedDomain).toBe('openai.com')
  })
})

describe('getActiveDomains', () => {
  it('returns a sorted, deduplicated list', () => {
    const domains = getActiveDomains(allEnabled, false)
    expect(domains.length).toBeGreaterThan(0)
    expect(domains).toEqual([...new Set(domains)].sort((a, b) => a.localeCompare(b)))
  })

  it('returns nothing when all categories are off', () => {
    expect(getActiveDomains(noneEnabled, true)).toEqual([])
  })

  it('strict mode adds strict-only services', () => {
    const defaultCount = getActiveDomains(allEnabled, false).length
    const strictCount = getActiveDomains(allEnabled, true).length
    expect(strictCount).toBeGreaterThan(defaultCount)
  })

  it('strict-only services are excluded by default', () => {
    const services = getActiveServices(allEnabled, false)
    expect(services.every((service) => !service.strictOnly)).toBe(true)
  })
})

describe('buildExport', () => {
  const domains = ['chatgpt.com', 'claude.ai']

  it('builds AdGuard rules', () => {
    const output = buildExport('adguard', domains)
    expect(output).toContain('||chatgpt.com^')
    expect(output).toContain('||claude.ai^')
  })

  it('builds hosts entries for IPv4 and IPv6', () => {
    const output = buildExport('hosts', domains)
    expect(output).toContain('0.0.0.0 chatgpt.com')
    expect(output).toContain(':: chatgpt.com')
  })

  it('builds dnsmasq addresses', () => {
    expect(buildExport('dnsmasq', domains)).toContain('address=/claude.ai/0.0.0.0')
  })

  it('builds plain domain lists', () => {
    expect(buildExport('plain', domains)).toContain('chatgpt.com\nclaude.ai')
  })

  it('builds valid Safari content blocker JSON with escaped dots', () => {
    const output = buildExport('safari', domains)
    const parsed = JSON.parse(output) as Array<{
      trigger: { 'url-filter': string }
      action: { type: string }
    }>

    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.action.type).toBe('block')
    expect(parsed[0]!.trigger['url-filter']).toContain('chatgpt\\.com')
  })

  it('maps formats to file extensions', () => {
    expect(extensionForFormat('safari')).toBe('json')
    expect(extensionForFormat('adguard')).toBe('txt')
  })
})
