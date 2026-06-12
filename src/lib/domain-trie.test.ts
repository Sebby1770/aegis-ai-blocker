import { describe, expect, it } from 'vitest'
import { buildDomainTrie, matchDomainTrie, trieFor } from './domain-trie'

const rules = ['openai.com', 'claude.ai', 'api.githubcopilot.com', 'gemini.google.com']
const trie = buildDomainTrie(rules)

describe('matchDomainTrie', () => {
  it('matches exact rule domains', () => {
    expect(matchDomainTrie(trie, 'openai.com')).toBe('openai.com')
    expect(matchDomainTrie(trie, 'api.githubcopilot.com')).toBe('api.githubcopilot.com')
  })

  it('matches subdomains at any depth', () => {
    expect(matchDomainTrie(trie, 'api.openai.com')).toBe('openai.com')
    expect(matchDomainTrie(trie, 'a.b.c.claude.ai')).toBe('claude.ai')
    expect(matchDomainTrie(trie, 'proxy.api.githubcopilot.com')).toBe('api.githubcopilot.com')
  })

  it('respects label boundaries — lookalikes never match', () => {
    expect(matchDomainTrie(trie, 'notopenai.com')).toBe('')
    expect(matchDomainTrie(trie, 'claude.ai.evil.com')).toBe('')
    expect(matchDomainTrie(trie, 'openai.com.evil.net')).toBe('')
    expect(matchDomainTrie(trie, 'xgithubcopilot.com')).toBe('')
  })

  it('does not match parents of a rule', () => {
    // gemini.google.com is blocked; google.com itself is not.
    expect(matchDomainTrie(trie, 'google.com')).toBe('')
    expect(matchDomainTrie(trie, 'maps.google.com')).toBe('')
    expect(matchDomainTrie(trie, 'gemini.google.com')).toBe('gemini.google.com')
    expect(matchDomainTrie(trie, 'api.gemini.google.com')).toBe('gemini.google.com')
  })

  it('returns the most general rule when nested rules overlap', () => {
    const nested = buildDomainTrie(['api.openai.com', 'openai.com'])
    expect(matchDomainTrie(nested, 'api.openai.com')).toBe('openai.com')
  })

  it('handles empty input and empty trie', () => {
    expect(matchDomainTrie(trie, '')).toBe('')
    expect(matchDomainTrie(buildDomainTrie([]), 'openai.com')).toBe('')
  })
})

describe('trieFor', () => {
  it('caches by array identity', () => {
    const domains = ['openai.com']
    expect(trieFor(domains)).toBe(trieFor(domains))
  })

  it('builds separate tries for separate arrays', () => {
    expect(trieFor(['openai.com'])).not.toBe(trieFor(['openai.com']))
  })
})
