import { describe, expect, it } from 'vitest'
import generatedAdguard from '../../rules/generated/adguard.txt?raw'
import generatedDnsmasq from '../../rules/generated/dnsmasq.conf?raw'
import generatedPlain from '../../rules/generated/domains.txt?raw'
import generatedHosts from '../../rules/generated/hosts.txt?raw'
import {
  isHostname,
  matchesDomainOrSubdomain,
  parseAdguard,
  parseDnsmasq,
  parseHosts,
  parseSafari,
  safariBlocks,
  webKitUrlFilterError,
} from '../test/format-parsers'
import { buildExport, getActiveDomains, resolveRules, rulePack, type ExportFormat } from './blocklists'
import { explainDomain } from './explain'

// Every export format, validated by an independent parser written from the
// consuming tool's grammar, then checked for what it actually blocks.

const allCategories = Object.fromEntries(rulePack.categories.map((category) => [category.id, true]))
const defaultDomains = getActiveDomains(allCategories, false)
const strictDomains = getActiveDomains(allCategories, true)

const withExceptions = resolveRules({
  enabledCategories: allCategories,
  strictMode: true,
  allowDomains: ['chatgpt.com', 'docs.anthropic.com'],
  blockDomains: ['my-ai.example.com'],
})

function parse(format: ExportFormat, text: string) {
  switch (format) {
    case 'adguard':
      return parseAdguard(text)
    case 'hosts':
      return parseHosts(text)
    case 'dnsmasq':
      return parseDnsmasq(text)
    case 'plain':
      return {
        blocks: text.split('\n').filter((line) => line && !line.startsWith('#')),
        allows: [],
        errors: text
          .split('\n')
          .filter((line) => line && !line.startsWith('#') && !isHostname(line))
          .map((line) => `invalid hostname: ${line}`),
      }
    case 'safari': {
      const { rules, errors } = parseSafari(text)
      return {
        blocks: rules.filter((rule) => rule.action.type === 'block').map((rule) => rule.trigger['url-filter']),
        allows: rules.filter((rule) => rule.action.type !== 'block').map((rule) => rule.trigger['url-filter']),
        errors,
      }
    }
  }
}

const FORMATS: ExportFormat[] = ['adguard', 'hosts', 'dnsmasq', 'plain', 'safari']

describe('export syntax (independent parsers)', () => {
  it.each(FORMATS)('%s: the default, strict, and exception exports parse with zero errors', (format) => {
    for (const [domains, allowed] of [
      [defaultDomains, []],
      [strictDomains, []],
      [withExceptions.blocked, withExceptions.allowed],
    ] as const) {
      const parsed = parse(format, buildExport(format, [...domains], [...allowed]))
      expect(parsed.errors).toEqual([])
      expect(parsed.blocks.length).toBeGreaterThanOrEqual(domains.length)
    }
  })

  it('hosts maps every domain to both the IPv4 and IPv6 null address', () => {
    const { blocks } = parseHosts(buildExport('hosts', defaultDomains))
    for (const domain of defaultDomains) {
      expect(blocks).toContain(`0.0.0.0 ${domain}`)
      expect(blocks).toContain(`:: ${domain}`)
    }
  })

  it('AdGuard and dnsmasq express allow exceptions as real exception rules', () => {
    expect(parseAdguard(buildExport('adguard', withExceptions.blocked, withExceptions.allowed)).allows).toEqual(
      withExceptions.allowed,
    )
    expect(parseDnsmasq(buildExport('dnsmasq', withExceptions.blocked, withExceptions.allowed)).allows).toEqual(
      withExceptions.allowed,
    )
  })
})

describe('WebKit url-filter grammar checker', () => {
  it.each([
    ['^https?://([^/]+\\.)?openai\\.com(/|$)', 'disjunction'],
    ['^https?://openai\\.com$/', 'end-of-line'],
    ['openai\\.com\\b', 'unsupported escape'],
    ['^https://(?=x)', 'lookaround'],
    ['a{2}', 'counted quantifier'],
    ['x^y', 'start-of-line'],
  ])('rejects %s (%s)', (pattern, reason) => {
    expect(webKitUrlFilterError(pattern)).toContain(reason)
  })

  it('accepts patterns inside the supported subset', () => {
    expect(webKitUrlFilterError('^[htpsw]+://([^/]*[.@])?openai\\.com\\.?[/:]')).toBeNull()
    expect(webKitUrlFilterError('.*\\.gif$')).toBeNull()
  })
})

describe('Safari content blocker semantics', () => {
  // FINDING: the Safari export used `(/|$)` after the domain. WebKit's
  // content-blocker compiler rejects disjunctions and a non-final `$`, and one
  // invalid rule fails the whole list — so the Safari export never loaded.
  it('every url-filter is accepted by WebKit', () => {
    const { errors } = parseSafari(buildExport('safari', strictDomains, ['github.com']))
    expect(errors).toEqual([])
  })

  const safari = parseSafari(buildExport('safari', defaultDomains, [])).rules

  it.each(['chatgpt.com', 'claude.ai', 'gemini.google.com', 'api.openai.com'])('blocks every way of reaching %s', (domain) => {
    for (const url of [
      `https://${domain}/`,
      `https://${domain}`,
      `http://${domain}:8080/path`,
      `https://sub.${domain}/x?y=1`,
      `https://${domain}./`,
      `https://user:pass@${domain}/`,
      `wss://${domain}/socket`,
    ]) {
      expect({ url, blocked: safariBlocks(safari, url) }).toEqual({ url, blocked: true })
    }
  })

  it.each(['chatgpt.com', 'claude.ai'])('does not block lookalikes or mentions of %s', (domain) => {
    for (const url of [
      `https://not${domain}/`,
      `https://${domain}.evil.example/`,
      `https://evil.example/?next=https://${domain}/`,
      `https://evil.example/${domain}/`,
      `https://evil.example/#${domain}`,
    ]) {
      expect({ url, blocked: safariBlocks(safari, url) }).toEqual({ url, blocked: false })
    }
  })

  it('ignore-previous-rules lifts the block for allow exceptions (and their subdomains)', () => {
    const rules = parseSafari(buildExport('safari', withExceptions.blocked, withExceptions.allowed)).rules
    expect(safariBlocks(rules, 'https://chatgpt.com/')).toBe(false)
    expect(safariBlocks(rules, 'https://www.chatgpt.com/')).toBe(false)
    expect(safariBlocks(rules, 'https://docs.anthropic.com/')).toBe(false)
    expect(safariBlocks(rules, 'https://console.anthropic.com/')).toBe(true)
    expect(safariBlocks(rules, 'https://my-ai.example.com/')).toBe(true)
  })
})

describe('generated files match the library exactly (no generator drift)', () => {
  it.each([
    ['adguard', generatedAdguard],
    ['hosts', generatedHosts],
    ['dnsmasq', generatedDnsmasq],
    ['plain', generatedPlain],
  ] as const)('rules/generated %s', (format, text) => {
    expect(parse(format, text).errors).toEqual([])
    expect(text).toBe(buildExport(format, defaultDomains))
  })
})

// What a DNS-level consumer of each export decides for `host`, modelled from
// the format's documented semantics.
function decide(format: ExportFormat, text: string, host: string): boolean {
  switch (format) {
    case 'adguard': {
      const { blocks, allows } = parseAdguard(text)
      if (allows.some((domain) => matchesDomainOrSubdomain(host, domain))) {
        return false
      }
      return blocks.some((domain) => matchesDomainOrSubdomain(host, domain))
    }
    case 'dnsmasq': {
      // dnsmasq applies the most specific matching domain.
      const { blocks, allows } = parseDnsmasq(text)
      const best = [...blocks.map((d) => ({ d, block: true })), ...allows.map((d) => ({ d, block: false }))]
        .filter(({ d }) => matchesDomainOrSubdomain(host, d))
        .sort((a, b) => b.d.length - a.d.length)[0]
      return best?.block ?? false
    }
    case 'hosts':
      return parseHosts(text).blocks.includes(`0.0.0.0 ${host}`)
    case 'plain':
      return parse('plain', text).blocks.includes(host)
    case 'safari':
      return safariBlocks(parseSafari(text).rules, `https://${host}/`)
  }
}

describe('every export agrees with the dashboard explanation', () => {
  const scenarios = [
    { name: 'no exceptions', allow: [] as string[], block: [] as string[] },
    { name: 'exact allow', allow: ['chatgpt.com'], block: [] },
    // FINDING: allowing a parent domain (openai.com) lifted its listed
    // subdomains in the dashboard, extension, AdGuard and Safari, but the
    // hosts / dnsmasq / plain exports still blocked api.openai.com etc.
    { name: 'parent allow', allow: ['openai.com', 'google.com'], block: [] },
    { name: 'custom block', allow: [], block: ['my-ai.example.com'] },
  ]

  // Hosts and plain lists are exact-match by nature: they can only speak for
  // the listed hostnames themselves.
  const listed = ['chatgpt.com', 'openai.com', 'api.openai.com', 'platform.openai.com', 'gemini.google.com', 'claude.ai', 'my-ai.example.com']
  const unlisted = ['sub.chatgpt.com', 'files.oaiusercontent.com', 'mail.google.com', 'github.com', 'notchatgpt.com']

  it.each(scenarios)('$name', ({ allow, block }) => {
    const resolved = resolveRules({ enabledCategories: allCategories, strictMode: true, allowDomains: allow, blockDomains: block })

    for (const format of FORMATS) {
      const text = buildExport(format, resolved.blocked, resolved.allowed)
      const hosts = format === 'hosts' || format === 'plain' ? listed : [...listed, ...unlisted]

      for (const host of hosts) {
        const dashboardBlocks = explainDomain(host, true, { allow, block }).status !== 'allowed'
        expect({ format, host, blocked: decide(format, text, host) }).toEqual({ format, host, blocked: dashboardBlocks })
      }
    }
  })
})
