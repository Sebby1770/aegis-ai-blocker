import { describe, expect, it } from 'vitest'
import { buildExport, resolveRules, rulePack, toValidDomain } from './blocklists'
import { explainDomain } from './explain'
import { defaultSettings, parseSettings, sanitizeDomainList, serializeSettings } from './rules-storage'

const allEnabled = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))

describe('toValidDomain', () => {
  it('accepts and normalizes real domains', () => {
    expect(toValidDomain('https://www.GitHub.com/path')).toBe('github.com')
    expect(toValidDomain('api.openai.com')).toBe('api.openai.com')
    expect(toValidDomain('sub.domain.co.uk')).toBe('sub.domain.co.uk')
  })

  it('rejects junk that normalizeDomain would otherwise pass through', () => {
    expect(toValidDomain('not a valid domain!!')).toBeNull()
    expect(toValidDomain('localhost')).toBeNull() // no TLD
    expect(toValidDomain('')).toBeNull()
    expect(toValidDomain('....')).toBeNull()
  })

  it('keeps invalid entries out of stored exception lists', () => {
    expect(sanitizeDomainList(['ok.com', 'not a domain!!', 'also-ok.io'])).toEqual([
      'ok.com',
      'also-ok.io',
    ])
  })
})

describe('resolveRules', () => {
  it('removes an allow exception from the blocked set and surfaces it', () => {
    const { blocked, allowed } = resolveRules({
      enabledCategories: allEnabled,
      strictMode: false,
      allowDomains: ['chatgpt.com'],
    })
    expect(blocked).not.toContain('chatgpt.com')
    expect(allowed).toContain('chatgpt.com')
  })

  it('adds custom block domains to the blocked set', () => {
    const { blocked } = resolveRules({
      enabledCategories: allEnabled,
      strictMode: false,
      blockDomains: ['my-internal-ai.example.com'],
    })
    expect(blocked).toContain('my-internal-ai.example.com')
  })

  it('lets allow win over block on conflict', () => {
    const { blocked, allowed } = resolveRules({
      enabledCategories: allEnabled,
      strictMode: false,
      allowDomains: ['conflict.example.com'],
      blockDomains: ['conflict.example.com'],
    })
    expect(blocked).not.toContain('conflict.example.com')
    expect(allowed).toContain('conflict.example.com')
  })

  it('normalizes exception inputs', () => {
    const { blocked, allowed } = resolveRules({
      enabledCategories: allEnabled,
      strictMode: false,
      allowDomains: ['HTTPS://www.ChatGPT.com/some/path'],
    })
    expect(allowed).toContain('chatgpt.com')
    expect(blocked).not.toContain('chatgpt.com')
  })
})

describe('buildExport with allow exceptions', () => {
  it('AdGuard emits @@ allow rules', () => {
    const output = buildExport('adguard', ['a.com'], ['b.com'])
    expect(output).toContain('||a.com^')
    expect(output).toContain('@@||b.com^')
  })

  it('dnsmasq routes allowed domains to the default resolver', () => {
    const output = buildExport('dnsmasq', ['a.com'], ['b.com'])
    expect(output).toContain('address=/a.com/0.0.0.0')
    expect(output).toContain('server=/b.com/#')
  })

  it('Safari appends ignore-previous-rules after the block rules', () => {
    const parsed = JSON.parse(buildExport('safari', ['a.com'], ['b.com'])) as Array<{
      trigger: { 'url-filter': string }
      action: { type: string }
    }>
    expect(parsed[0]!.action.type).toBe('block')
    const allow = parsed.find((rule) => rule.action.type === 'ignore-previous-rules')
    expect(allow).toBeDefined()
    expect(allow!.trigger['url-filter']).toContain('b\\.com')
    // The allow rule must come last so Safari's last-match wins.
    expect(parsed[parsed.length - 1]!.action.type).toBe('ignore-previous-rules')
  })

  it('hosts and plain note exceptions they cannot express', () => {
    expect(buildExport('hosts', ['a.com'], ['b.com'])).toContain('allow exception')
    expect(buildExport('plain', ['a.com'], ['b.com'])).toContain('allow exception')
  })

  it('omits allow lines when there are no exceptions (back-compat)', () => {
    expect(buildExport('adguard', ['a.com'])).not.toContain('@@')
    const safari = JSON.parse(buildExport('safari', ['a.com'])) as unknown[]
    expect(safari).toHaveLength(1)
  })
})

describe('explainDomain with exceptions', () => {
  it('reports an allow exception as allowed even if the pack would block it', () => {
    const result = explainDomain('chatgpt.com', false, { allow: ['chatgpt.com'] })
    expect(result.status).toBe('allowed')
    expect(result.reason).toContain('allowed by your exceptions')
  })

  it('honors allow exceptions by parent domain', () => {
    const result = explainDomain('api.chatgpt.com', false, { allow: ['chatgpt.com'] })
    expect(result.status).toBe('allowed')
    expect(result.reason).toContain('allow rule for chatgpt.com')
  })

  it('reports a custom block as blocked', () => {
    const result = explainDomain('example.com', false, { block: ['example.com'] })
    expect(result.status).toBe('blocked')
    expect(result.reason).toContain('custom rule')
  })

  it('lets allow take precedence over block', () => {
    const result = explainDomain('x.com', false, { allow: ['x.com'], block: ['x.com'] })
    expect(result.status).toBe('allowed')
  })

  it('behaves exactly as before with no exceptions', () => {
    expect(explainDomain('chatgpt.com', false).status).toBe('blocked')
  })
})

describe('parseSettings exception handling', () => {
  it('defaults include empty exception lists', () => {
    const defaults = defaultSettings()
    expect(defaults.allowDomains).toEqual([])
    expect(defaults.blockDomains).toEqual([])
  })

  it('sanitizes, normalizes and de-duplicates exception lists', () => {
    const parsed = parseSettings(
      JSON.stringify({
        allowDomains: ['HTTPS://www.GitHub.com/', 'github.com', '', 42, 'copilot.com'],
        blockDomains: ['Foo.Example.com'],
      }),
    )
    expect(parsed.allowDomains).toEqual(['github.com', 'copilot.com'])
    expect(parsed.blockDomains).toEqual(['foo.example.com'])
  })

  it('drops a domain from block when it is also allowed (allow wins)', () => {
    const parsed = parseSettings(
      JSON.stringify({ allowDomains: ['dual.com'], blockDomains: ['dual.com', 'only-block.com'] }),
    )
    expect(parsed.allowDomains).toContain('dual.com')
    expect(parsed.blockDomains).not.toContain('dual.com')
    expect(parsed.blockDomains).toContain('only-block.com')
  })

  it('round-trips exceptions through serialize/parse', () => {
    const settings = defaultSettings()
    settings.allowDomains = ['github.com']
    settings.blockDomains = ['internal.example.com']
    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })
})
