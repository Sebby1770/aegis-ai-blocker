// Generates the extension's PNG icons (16/48/128) with zero dependencies:
// a minimal PNG encoder (IHDR/IDAT/IEND + CRC32, zlib from node:zlib) drawing
// the Aegis mark — a teal→cyan gradient rounded square with a white shield.
// Deterministic pixels; run `node scripts/generate-extension-icons.mjs`.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'extension/icons')

// --- Minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // compression 0, filter 0, interlace 0

  // Raw scanlines, filter byte 0 per row.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Drawing ----------------------------------------------------------------

const TEAL = [0x0d, 0x8f, 0x83]
const CYAN = [0x38, 0xbd, 0xf8]

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Signed distance to a rounded square centred in the unit box.
function roundedSquare(u, v, half, radius) {
  const dx = Math.abs(u - 0.5) - (half - radius)
  const dy = Math.abs(v - 0.5) - (half - radius)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius
}

// 1 inside the shield silhouette, 0 outside. A flat-topped shield that tapers
// to a point, defined in normalized coordinates.
function shieldCoverage(u, v) {
  const top = 0.26
  const waist = 0.56
  const tip = 0.8

  if (v < top || v > tip) {
    return 0
  }

  const maxHalf = 0.24
  let half
  if (v <= waist) {
    // Slight outward bow between top and waist.
    const t = (v - top) / (waist - top)
    half = maxHalf * (0.92 + 0.08 * Math.sin(t * Math.PI))
  } else {
    const t = (v - waist) / (tip - waist)
    half = maxHalf * (1 - t) * (1 - 0.25 * t)
  }

  return Math.abs(u - 0.5) <= half ? 1 : 0
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const samples = 3 // supersampling grid per axis

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgCoverage = 0
      let shield = 0

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) / samples) / size
          const v = (y + (sy + 0.5) / samples) / size

          if (roundedSquare(u, v, 0.48, 0.15) <= 0) {
            bgCoverage += 1
            shield += shieldCoverage(u, v)
          }
        }
      }

      const total = samples * samples
      const alpha = bgCoverage / total
      if (alpha === 0) {
        continue
      }

      const t = (x / size + y / size) / 2
      const shieldMix = shield / total

      // Gradient background, blended toward near-white where the shield sits.
      const r = lerp(lerp(TEAL[0], CYAN[0], t), 0xf4, shieldMix)
      const g = lerp(lerp(TEAL[1], CYAN[1], t), 0xfd, shieldMix)
      const b = lerp(lerp(TEAL[2], CYAN[2], t), 0xfb, shieldMix)

      const offset = (y * size + x) * 4
      rgba[offset] = Math.round(r)
      rgba[offset + 1] = Math.round(g)
      rgba[offset + 2] = Math.round(b)
      rgba[offset + 3] = Math.round(alpha * 255)
    }
  }

  return encodePng(size, rgba)
}

await mkdir(outDir, { recursive: true })

for (const size of [16, 48, 128]) {
  await writeFile(path.join(outDir, `icon-${size}.png`), draw(size))
}

console.log(`Wrote extension/icons/icon-{16,48,128}.png`)
