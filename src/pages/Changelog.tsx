import type { ReactNode } from 'react'
import { PageShell } from '../components/PageShell'
import changelogRaw from '../../CHANGELOG.md?raw'

type Block =
  | { type: 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul'; items: string[] }

// CHANGELOG.md is the single source of truth; this parses the small markdown
// subset it uses (headings, bullets, wrapped lines) into React elements, so
// nothing is ever injected as HTML.
function parseChangelog(source: string): Block[] {
  const blocks: Block[] = []

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trimEnd()
    const last = blocks[blocks.length - 1]

    if (!line.trim() || line.startsWith('# ')) {
      continue
    }

    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
    } else if (line.trimStart().startsWith('- ')) {
      const item = line.trimStart().slice(2)

      if (last?.type === 'ul') {
        last.items.push(item)
      } else {
        blocks.push({ type: 'ul', items: [item] })
      }
    } else if (rawLine.startsWith('  ') && last?.type === 'ul' && last.items.length > 0) {
      last.items[last.items.length - 1] += ` ${line.trim()}`
    } else if (last?.type === 'p') {
      last.text += ` ${line.trim()}`
    } else {
      blocks.push({ type: 'p', text: line.trim() })
    }
  }

  return blocks
}

// Renders `inline code` spans without any HTML injection.
function inline(text: string): ReactNode[] {
  return text.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))
}

const blocks = parseChangelog(changelogRaw)

export function Changelog() {
  return (
    <PageShell title="Changelog" intro="Every product and rule pack release, newest first.">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h2':
            return <h2 key={index}>{block.text}</h2>
          case 'h3':
            return <h3 key={index}>{block.text}</h3>
          case 'ul':
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </ul>
            )
          default:
            return <p key={index}>{inline(block.text)}</p>
        }
      })}
    </PageShell>
  )
}
