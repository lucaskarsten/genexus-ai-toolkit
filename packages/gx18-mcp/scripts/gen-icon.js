#!/usr/bin/env node
// Generates assets/icon.ico (32×32 32bpp) — Nara the labrador
// Also generates src/ui/favicon-b64.ts for the web UI favicon
// No npm dependencies — pure Buffer manipulation
'use strict'

const fs   = require('fs')
const path = require('path')

const W = 32, H = 32
const rgba = new Uint8ClampedArray(W * H * 4)

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function px(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const i = (y * W + x) * 4
  const ea = a / 255, ia = 1 - ea
  rgba[i]   = rgba[i]   * ia + r * ea
  rgba[i+1] = rgba[i+1] * ia + g * ea
  rgba[i+2] = rgba[i+2] * ia + b * ea
  rgba[i+3] = 255
}

function circle(cx, cy, rad, r, g, b, a = 255) {
  for (let dy = -rad-1; dy <= rad+1; dy++) {
    for (let dx = -rad-1; dx <= rad+1; dx++) {
      const d = Math.sqrt(dx*dx + dy*dy)
      const aa = Math.max(0, Math.min(1, rad + 0.5 - d))
      if (aa > 0) px(cx+dx, cy+dy, r, g, b, a * aa)
    }
  }
}

function ellipse(cx, cy, rx, ry, r, g, b, a = 255) {
  cx = Math.round(cx); cy = Math.round(cy)
  const mx = Math.ceil(rx + 1), my = Math.ceil(ry + 1)
  const sc = Math.min(rx, ry)
  for (let dy = -my; dy <= my; dy++) {
    for (let dx = -mx; dx <= mx; dx++) {
      const nd = Math.sqrt((dx/rx)*(dx/rx) + (dy/ry)*(dy/ry))
      const aa = Math.max(0, Math.min(1, (1 - nd) * sc + 0.5))
      if (aa > 0) px(cx+dx, cy+dy, r, g, b, a * aa)
    }
  }
}

function ellipseRot(cx, cy, rx, ry, angle, r, g, b, a = 255) {
  const cos = Math.cos(-angle), sin = Math.sin(-angle)
  const mx = Math.ceil(Math.max(rx, ry) + 1)
  const sc = Math.min(rx, ry)
  for (let dy = -mx; dy <= mx; dy++) {
    for (let dx = -mx; dx <= mx; dx++) {
      const rdx = dx * cos - dy * sin
      const rdy = dx * sin + dy * cos
      const nd = Math.sqrt((rdx/rx)*(rdx/rx) + (rdy/ry)*(rdy/ry))
      const aa = Math.max(0, Math.min(1, (1 - nd) * sc + 0.5))
      if (aa > 0) px(Math.round(cx)+dx, Math.round(cy)+dy, r, g, b, a * aa)
    }
  }
}

// ── Background (linear gradient top-left #60C8F5 → bottom-right #2E8FD4) ─────

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H - 2)
    px(x, y,
      Math.round(96  + (46  - 96)  * t),
      Math.round(200 + (143 - 200) * t),
      Math.round(245 + (212 - 245) * t))
  }
}

// ── Nara (labrador, 32×32 — all coords scaled from 128px SVG by ×0.25) ───────

const DEG = Math.PI / 180

// Ears (behind head — draw first so head covers inner edge)
ellipseRot( 6, 18.5, 4, 7, -10*DEG, 200, 186, 160)
ellipseRot(26, 18.5, 4, 7,  10*DEG, 200, 186, 160)

// Head
circle(16, 15, 10, 244, 239, 230)

// Muzzle (lighter area)
ellipse(16, 19.5, 5, 4, 253, 250, 247)

// Cheeks blush (subtle)
circle( 9.25, 17.5, 2.5, 249, 168, 212, 90)
circle(22.75, 17.5, 2.5, 249, 168, 212, 90)

// Eyes
circle(12, 13.75, 2.5, 45, 27, 14)
circle(20, 13.75, 2.5, 45, 27, 14)
// Eye highlights
circle(12.75, 12.75, 0.9, 255, 255, 255)
circle(20.75, 12.75, 0.9, 255, 255, 255)

// Nose
ellipse(16, 18.5, 2.5, 1.75, 28, 17, 8)

// Tongue
ellipse(16, 22.75, 2.5, 1.75, 244, 114, 182)

// ── Rounded-rect clip (r=5) applied last so it always masks corners ───────────

const RX = 5
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = x < RX ? RX : x > W-1-RX ? W-1-RX : x
    const cy = y < RX ? RX : y > H-1-RX ? H-1-RX : y
    if ((x !== cx || y !== cy) && Math.hypot(x-cx, y-cy) > RX)
      rgba[(y*W+x)*4+3] = 0
  }
}

// ── ICO encoding ──────────────────────────────────────────────────────────────

const dibHeader = Buffer.alloc(40)
dibHeader.writeUInt32LE(40, 0)
dibHeader.writeInt32LE(W, 4)
dibHeader.writeInt32LE(H * 2, 8)   // doubled for ICO format
dibHeader.writeUInt16LE(1, 12)
dibHeader.writeUInt16LE(32, 14)    // 32bpp
dibHeader.writeUInt32LE(0, 16)     // BI_RGB
dibHeader.writeUInt32LE(W * H * 4, 20)

const pixelData = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const srcRow = H - 1 - y   // ICO is bottom-up
    const src = (srcRow * W + x) * 4
    const dst = (y * W + x) * 4
    pixelData[dst + 0] = rgba[src + 2]   // B
    pixelData[dst + 1] = rgba[src + 1]   // G
    pixelData[dst + 2] = rgba[src + 0]   // R
    pixelData[dst + 3] = rgba[src + 3]   // A
  }
}

const andMask    = Buffer.alloc(128, 0)
const imageData  = Buffer.concat([dibHeader, pixelData, andMask])
const bytesInRes = imageData.length

const iconDir = Buffer.alloc(6)
iconDir.writeUInt16LE(0, 0)
iconDir.writeUInt16LE(1, 2)   // type = ICO
iconDir.writeUInt16LE(1, 4)   // count = 1

const dirEntry = Buffer.alloc(16)
dirEntry.writeUInt8(W, 0)
dirEntry.writeUInt8(H, 1)
dirEntry.writeUInt8(0, 2)
dirEntry.writeUInt8(0, 3)
dirEntry.writeUInt16LE(1, 4)
dirEntry.writeUInt16LE(32, 6)
dirEntry.writeUInt32LE(bytesInRes, 8)
dirEntry.writeUInt32LE(6 + 16, 12)

const ico = Buffer.concat([iconDir, dirEntry, imageData])

const outIco = path.join(__dirname, '..', 'assets', 'icon.ico')
fs.mkdirSync(path.dirname(outIco), { recursive: true })
fs.writeFileSync(outIco, ico)
console.log(`Generated: ${outIco}  (${ico.length} bytes)`)

// ── favicon-b64.ts for the web UI ─────────────────────────────────────────────

const svgPath = path.join(__dirname, '..', '..', '..', 'assets', 'icon.svg')
if (fs.existsSync(svgPath)) {
  const b64 = Buffer.from(fs.readFileSync(svgPath)).toString('base64')
  const ts = [
    '// Auto-generated by scripts/gen-icon.js — do not edit manually',
    `export const FAVICON_SVG_DATA = 'data:image/svg+xml;base64,${b64}'`,
    '',
  ].join('\n')
  const tsPath = path.join(__dirname, '..', 'src', 'ui', 'favicon-b64.ts')
  fs.writeFileSync(tsPath, ts, 'utf8')
  console.log(`Generated: ${tsPath}`)
}
