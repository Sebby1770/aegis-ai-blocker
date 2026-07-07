import type { ReactNode } from 'react'

export type HeadlineSegment = { text: string; highlight?: boolean }

type Props = {
  segments: HeadlineSegment[]
  as?: 'h1' | 'h2' | 'p' | 'span'
  className?: string
}

type Word = { word: string; highlight: boolean }

function toWords(segments: HeadlineSegment[]): Word[] {
  const words: Word[] = []
  for (const segment of segments) {
    for (const chunk of segment.text.split(/\s+/)) {
      if (chunk.length > 0) {
        words.push({ word: chunk, highlight: Boolean(segment.highlight) })
      }
    }
  }
  return words
}

// Renders text as individual words that rise + fade in on mount with a small
// per-word stagger — the ReactBits "SplitText" look, done with pure CSS so it
// needs no observer for above-the-fold headings. Highlighted words keep the
// brand gradient. Under reduced motion the words are simply shown (the entrance
// animation lives inside a prefers-reduced-motion: no-preference query).
export function SplitText({ segments, as = 'span', className = '' }: Props) {
  const words = toWords(segments)
  const Tag = as

  const children: ReactNode[] = []
  words.forEach((entry, index) => {
    children.push(
      <span className="split-word" style={{ animationDelay: `${index * 55}ms` }} key={`w${index}`}>
        {entry.highlight ? <span className="grad-text">{entry.word}</span> : entry.word}
      </span>,
    )
    if (index < words.length - 1) {
      children.push(' ')
    }
  })

  return <Tag className={`split-text ${className}`.trim()}>{children}</Tag>
}
