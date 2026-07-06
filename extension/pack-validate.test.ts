import { describe, expect, it, vi } from 'vitest'
import {
  fetchValidatedPack,
  isAcceptableVersion,
  LIMITS,
  readCappedText,
  sanitizePack,
  toValidDomain,
  // @ts-expect-error — plain JS module shared with the extension
} from './pack-validate.js'
import bundledPack from './rules/pack.json'

describe('toValidDomain', () => {
  it('canonicalizes URLs, casing, www, ports and paths', () => {
    expect(toValidDomain('https://www.ChatGPT.com/some/path')).toBe('chatgpt.com')
    expect(toValidDomain('claude.ai:443')).toBe('claude.ai')
    expect(toValidDomain('  perplexity.ai  ')).toBe('perplexity.ai')
  })

  it('rejects non-domains', () => {
    expect(toValidDomain('')).toBeNull()
    expect(toValidDomain('not a domain')).toBeNull()
    expect(toValidDomain('localhost')).toBeNull()
    expect(toValidDomain(42 as unknown as string)).toBeNull()
    expect(toValidDomain('a'.repeat(300))).toBeNull()
  })
})

describe('sanitizePack', () => {
  it('accepts the bundled pack unchanged in shape', () => {
    const pack = sanitizePack(bundledPack)
    expect(pack).not.toBeNull()
    expect(pack.version).toBe(bundledPack.version)
    expect(pack.policies.length).toBe(bundledPack.policies.length)
    expect(pack.services.length).toBe(bundledPack.services.length)
  })

  it('rejects garbage outright', () => {
    expect(sanitizePack(null)).toBeNull()
    expect(sanitizePack('nope')).toBeNull()
    expect(sanitizePack({})).toBeNull()
    expect(sanitizePack({ version: 'x', policies: [], services: [] })).toBeNull()
  })

  it('drops malformed services and invalid domains but keeps the rest', () => {
    const pack = sanitizePack({
      version: '1',
      policies: [{ id: 'p', name: 'P', tagline: 't', block: ['chat'], strict: true }],
      services: [
        { name: 'Good', category: 'chat', domains: ['good.com', 'not a domain', 'GOOD.com'] },
        { name: 'No domains', category: 'chat', domains: ['???'] },
        'not-an-object',
      ],
    })

    expect(pack).not.toBeNull()
    expect(pack.services).toHaveLength(1)
    expect(pack.services[0].domains).toEqual(['good.com'])
  })

  it('caps totals so a hostile pack cannot balloon the ruleset', () => {
    const services = Array.from({ length: LIMITS.maxServices + 100 }, (_, index) => ({
      name: `S${index}`,
      category: 'chat',
      domains: Array.from({ length: LIMITS.maxDomainsPerService + 10 }, (_, d) => `s${index}-d${d}.com`),
    }))

    const pack = sanitizePack({
      version: '1',
      policies: [{ id: 'p', name: 'P', tagline: 't', block: ['chat'], strict: true }],
      services,
    })

    expect(pack).not.toBeNull()
    const totalDomains = pack.services.reduce(
      (total: number, service: { domains: string[] }) => total + service.domains.length,
      0,
    )
    expect(totalDomains).toBeLessThanOrEqual(LIMITS.maxTotalDomains)
    expect(pack.services.length).toBeLessThanOrEqual(LIMITS.maxServices)
    for (const service of pack.services) {
      expect(service.domains.length).toBeLessThanOrEqual(LIMITS.maxDomainsPerService)
    }
  })

  it('never throws on adversarial shapes', () => {
    const weird = [
      { version: 1, policies: {}, services: 'x' },
      { version: 'v', policies: [null, 1, {}], services: [null, { domains: null }] },
      [],
      () => {},
    ]

    for (const input of weird) {
      expect(() => sanitizePack(input)).not.toThrow()
    }
  })
})

describe('isAcceptableVersion', () => {
  it('accepts newer or equal versions and rejects downgrades', () => {
    expect(isAcceptableVersion('2026.07.01', '2026.06.11')).toBe(true)
    expect(isAcceptableVersion('2026.06.11', '2026.06.11')).toBe(true)
    expect(isAcceptableVersion('2026.05.01', '2026.06.11')).toBe(false)
  })

  it('accepts anything when there is no current version, but never a missing candidate', () => {
    expect(isAcceptableVersion('2026.06.11', '')).toBe(true)
    expect(isAcceptableVersion('', '2026.06.11')).toBe(false)
  })
})

describe('readCappedText', () => {
  it('returns the body when it is within the cap', async () => {
    const body = JSON.stringify({ hello: 'world' })
    const text = await readCappedText(new Response(body))
    expect(JSON.parse(text)).toEqual({ hello: 'world' })
  })

  it('rejects an oversized declared Content-Length before reading', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(LIMITS.maxTotalDomains * 10_000) },
    })
    expect(await readCappedText(response)).toBeNull()
  })

  it('abandons a body that overflows the cap despite a lying Content-Length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(50)))
        controller.close()
      },
    })
    const response = new Response(stream, { headers: { 'content-length': '1' } })
    expect(await readCappedText(response, 10)).toBeNull()
  })
})

describe('fetchValidatedPack', () => {
  it('returns a sanitized pack for an ok response with a valid body', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(bundledPack), { status: 200 }))
    try {
      const pack = await fetchValidatedPack('https://example.test/pack.json')
      expect(pack).not.toBeNull()
      expect(pack.version).toBe(bundledPack.version)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    try {
      expect(await fetchValidatedPack('https://example.test/pack.json')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns null when the body exceeds the size cap', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify(bundledPack), {
          status: 200,
          headers: { 'content-length': String(5_000_000) },
        }),
    )
    try {
      expect(await fetchValidatedPack('https://example.test/pack.json')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns null on invalid JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('not json{', { status: 200 }))
    try {
      expect(await fetchValidatedPack('https://example.test/pack.json')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
