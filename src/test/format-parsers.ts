// Independent parsers for every export format, written from each consumer's
// documented grammar rather than from our generator, so tests can prove the
// files are syntactically valid for the tool that loads them and block what
// they claim to. Test support only — never imported by app code.

export type Parsed = { blocks: string[]; allows: string[]; errors: string[] }

// RFC 1123 hostname: 1–63 char labels of [a-z0-9-], no leading/trailing
// hyphen, ≤253 chars, at least two labels.
export function isHostname(value: string) {
  if (value.length > 253 || !value.includes('.')) {
    return false
  }
  return value.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

function contentLines(text: string, commentPrefixes: string[]) {
  return text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line !== '' && !commentPrefixes.some((prefix) => line.startsWith(prefix)))
}

// hosts(5): "IP_address canonical_hostname [aliases...]". Blocking entries
// must point at a null address; each line maps exactly one host here.
export function parseHosts(text: string): Parsed {
  const result: Parsed = { blocks: [], allows: [], errors: [] }
  for (const { line, number } of contentLines(text, ['#'])) {
    const [ip, host, ...rest] = line.split(/\s+/)
    if (!ip || !host || rest.length > 0) {
      result.errors.push(`line ${number}: expected "IP host": ${line}`)
    } else if (!['0.0.0.0', '::'].includes(ip)) {
      result.errors.push(`line ${number}: not a null address: ${ip}`)
    } else if (!isHostname(host)) {
      result.errors.push(`line ${number}: invalid hostname: ${host}`)
    } else {
      result.blocks.push(`${ip} ${host}`)
    }
  }
  return result
}

// dnsmasq(8): --address=/<domain>[/<domain>...]/[<ipaddr>] and
// --server=/<domain>/# ("#" = use the standard upstream servers).
export function parseDnsmasq(text: string): Parsed {
  const result: Parsed = { blocks: [], allows: [], errors: [] }
  for (const { line, number } of contentLines(text, ['#'])) {
    const address = line.match(/^address=\/([^/]+)\/([^/]*)$/)
    const server = line.match(/^server=\/([^/]+)\/#$/)
    if (address) {
      const [, domain, ip] = address
      if (!isHostname(domain)) {
        result.errors.push(`line ${number}: invalid domain: ${domain}`)
      } else if (!['0.0.0.0', '::', '#', ''].includes(ip)) {
        result.errors.push(`line ${number}: not a null/NXDOMAIN answer: ${ip}`)
      } else {
        result.blocks.push(domain)
      }
    } else if (server) {
      if (isHostname(server[1])) {
        result.allows.push(server[1])
      } else {
        result.errors.push(`line ${number}: invalid domain: ${server[1]}`)
      }
    } else {
      result.errors.push(`line ${number}: unrecognized directive: ${line}`)
    }
  }
  return result
}

// AdGuard DNS / uBlock basic rules: `||domain^` blocks the domain and its
// subdomains, `@@||domain^` is an exception. `!` and `#` lines are comments.
export function parseAdguard(text: string): Parsed {
  const result: Parsed = { blocks: [], allows: [], errors: [] }
  for (const { line, number } of contentLines(text, ['!', '# '])) {
    const match = line.match(/^(@@)?\|\|([^^$|/]+)\^$/)
    if (!match) {
      result.errors.push(`line ${number}: not a ||domain^ rule: ${line}`)
    } else if (!isHostname(match[2])) {
      result.errors.push(`line ${number}: invalid domain: ${match[2]}`)
    } else {
      ;(match[1] ? result.allows : result.blocks).push(match[2])
    }
  }
  return result
}

// WebKit content-blocker `url-filter` grammar. WebKit compiles url-filters
// with a restricted regex parser (Source/WebCore/contentextensions/
// URLFilterParser.cpp): only ASCII; `.`, character classes, groups, and the
// `?` `*` `+` quantifiers; `^` only as the first term and `$` only as the last;
// no disjunction (`|`), backreferences, word boundaries, builtin classes
// (\d \w \s …), lookarounds, or counted quantifiers. A single invalid rule
// makes Safari reject the whole rule list.
export function webKitUrlFilterError(pattern: string): string | null {
  if (pattern.length === 0) {
    return 'empty pattern'
  }
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(pattern)) {
    return 'non-ASCII character'
  }
  if (pattern === '.*' || pattern === '^.*' || pattern === '.*$') {
    return 'matches everything'
  }

  let depth = 0
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]

    if (char === '\\') {
      const next = pattern[i + 1]
      if (next === undefined) {
        return 'trailing backslash'
      }
      if (/[0-9]/.test(next)) {
        return `backreference \\${next}`
      }
      if (/[bBdDwWsS]/.test(next)) {
        return `unsupported escape \\${next}`
      }
      i += 1
      continue
    }

    if (char === '[') {
      const close = pattern.indexOf(']', i + 2)
      if (close === -1) {
        return 'unterminated character class'
      }
      if (/\\[dDwWsSbB]/.test(pattern.slice(i, close))) {
        return 'builtin class inside character class'
      }
      i = close
      continue
    }

    if (char === '(') {
      if (pattern[i + 1] === '?') {
        return 'lookaround / non-capturing group'
      }
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth < 0) {
        return 'unbalanced parenthesis'
      }
      continue
    }

    if (char === '|') {
      return 'disjunction (|) is not supported'
    }
    if (char === '{') {
      return 'counted quantifier is not supported'
    }
    if (char === '^' && i !== 0) {
      return 'start-of-line (^) must be the first term'
    }
    if (char === '$' && (i !== pattern.length - 1 || depth !== 0)) {
      return 'end-of-line ($) must be the last term'
    }
  }

  return depth === 0 ? null : 'unbalanced parenthesis'
}

const SAFARI_ACTIONS = new Set([
  'block',
  'block-cookies',
  'css-display-none',
  'ignore-previous-rules',
  'make-https',
  'notify',
  'redirect',
  'modify-headers',
])

const SAFARI_TRIGGER_KEYS = new Set([
  'url-filter',
  'url-filter-is-case-sensitive',
  'if-domain',
  'unless-domain',
  'resource-type',
  'load-type',
  'if-top-url',
  'unless-top-url',
  'if-frame-url',
  'unless-frame-url',
  'load-context',
  'request-method',
])

export type SafariRule = { trigger: { 'url-filter': string }; action: { type: string } }

export function parseSafari(text: string): { rules: SafariRule[]; errors: string[] } {
  const errors: string[] = []
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { rules: [], errors: [`invalid JSON: ${String(error)}`] }
  }

  if (!Array.isArray(json)) {
    return { rules: [], errors: ['top level must be an array of rules'] }
  }
  if (json.length > 150_000) {
    errors.push(`${json.length} rules exceeds Safari's 150,000-rule limit`)
  }

  json.forEach((rule, index) => {
    const trigger = (rule as SafariRule)?.trigger as Record<string, unknown> | undefined
    const action = (rule as SafariRule)?.action as Record<string, unknown> | undefined
    if (!trigger || typeof trigger['url-filter'] !== 'string') {
      errors.push(`rule ${index}: trigger.url-filter is required`)
      return
    }
    for (const key of Object.keys(trigger)) {
      if (!SAFARI_TRIGGER_KEYS.has(key)) {
        errors.push(`rule ${index}: unknown trigger key ${key}`)
      }
    }
    if (!action || typeof action.type !== 'string' || !SAFARI_ACTIONS.has(action.type)) {
      errors.push(`rule ${index}: unknown action ${JSON.stringify(action)}`)
    }
    const filterError = webKitUrlFilterError(trigger['url-filter'])
    if (filterError) {
      errors.push(`rule ${index} (${trigger['url-filter']}): ${filterError}`)
    }
  })

  return { rules: json as SafariRule[], errors }
}

// Evaluates a parsed Safari rule list against a URL the way WebKit does:
// url-filters are matched case-insensitively against the normalized URL, and
// the LAST matching rule wins (ignore-previous-rules lifts earlier blocks).
export function safariBlocks(rules: SafariRule[], url: string) {
  const href = new URL(url).href
  let blocked = false
  for (const rule of rules) {
    if (new RegExp(rule.trigger['url-filter'], 'i').test(href)) {
      blocked = rule.action.type === 'block' ? true : rule.action.type === 'ignore-previous-rules' ? false : blocked
    }
  }
  return blocked
}

// Suffix-match semantics shared by AdGuard `||d^`, dnsmasq `address=/d/`, and
// the extension: the host itself or any subdomain. Exceptions win for the most
// specific match in dnsmasq, and always in AdGuard.
export function matchesDomainOrSubdomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`)
}
