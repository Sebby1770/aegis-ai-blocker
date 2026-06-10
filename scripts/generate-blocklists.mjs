import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourcePath = path.join(root, 'src/data/ai-services.json')
const outputDir = path.join(root, 'rules/generated')

const rulePack = JSON.parse(await readFile(sourcePath, 'utf8'))

const domains = Array.from(
  new Set(
    rulePack.categories.flatMap((category) =>
      category.services.flatMap((service) => (service.strictOnly ? [] : service.domains)),
    ),
  ),
).sort((a, b) => a.localeCompare(b))

const header = (name) =>
  [
    `# Aegis AI Blocker - ${name}`,
    `# Rule pack: ${rulePack.version}`,
    `# Updated: ${rulePack.updatedAt}`,
    `# ${rulePack.disclaimer}`,
    '',
  ].join('\n')

await mkdir(outputDir, { recursive: true })

await writeFile(
  path.join(outputDir, 'adguard.txt'),
  `${header('AdGuard/uBlock DNS filters')}${domains.map((domain) => `||${domain}^`).join('\n')}\n`,
)

await writeFile(
  path.join(outputDir, 'hosts.txt'),
  `${header('Hosts file')}${domains
    .map((domain) => [`0.0.0.0 ${domain}`, `:: ${domain}`].join('\n'))
    .join('\n')}\n`,
)

await writeFile(
  path.join(outputDir, 'dnsmasq.conf'),
  `${header('dnsmasq')}${domains.map((domain) => `address=/${domain}/0.0.0.0`).join('\n')}\n`,
)

await writeFile(path.join(outputDir, 'domains.txt'), `${header('Plain domains')}${domains.join('\n')}\n`)

console.log(`Generated ${domains.length} default domains in ${path.relative(root, outputDir)}`)
