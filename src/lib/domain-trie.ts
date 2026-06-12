// Suffix trie over reversed domain labels. Matching a hostname costs
// O(label count) regardless of rule pack size, where the previous linear scan
// cost O(rules). At 118 domains both are instant; this keeps the domain
// tester and exports instant if the pack grows to OISD-style six-figure lists.

type TrieNode = {
  // Set when a rule domain ends at this node, holding the full rule text.
  rule: string | null
  children: Map<string, TrieNode>
}

export type DomainTrie = TrieNode

function newNode(): TrieNode {
  return { rule: null, children: new Map() }
}

export function buildDomainTrie(domains: string[]): DomainTrie {
  const root = newNode()

  for (const domain of domains) {
    const labels = domain.split('.')
    let node = root

    for (let i = labels.length - 1; i >= 0; i -= 1) {
      const label = labels[i]!
      let child = node.children.get(label)

      if (!child) {
        child = newNode()
        node.children.set(label, child)
      }

      node = child
    }

    node.rule = domain
  }

  return root
}

// Returns the most general (shortest-suffix) rule covering the hostname, or
// empty string. A rule matches when the hostname equals it or is a subdomain
// of it — label boundaries are respected, so "notopenai.com" never matches an
// "openai.com" rule.
export function matchDomainTrie(trie: DomainTrie, hostname: string): string {
  if (!hostname) {
    return ''
  }

  const labels = hostname.split('.')
  let node: TrieNode = trie

  for (let i = labels.length - 1; i >= 0; i -= 1) {
    const child = node.children.get(labels[i]!)

    if (!child) {
      return ''
    }

    if (child.rule) {
      return child.rule
    }

    node = child
  }

  return ''
}

const trieCache = new WeakMap<string[], DomainTrie>()

// Memoized per domain-list identity: React components memoize the active
// domain array, so repeat lookups against the same rules reuse one trie.
export function trieFor(domains: string[]): DomainTrie {
  let trie = trieCache.get(domains)

  if (!trie) {
    trie = buildDomainTrie(domains)
    trieCache.set(domains, trie)
  }

  return trie
}
