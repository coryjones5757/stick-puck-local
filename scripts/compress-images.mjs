/**
 * Compress rink photos and hero images for production.
 * Converts large PNGs to WebP at quality 82 targeting ~100-150 KB.
 * Outputs new .webp files alongside the originals.
 * Run once: node scripts/compress-images.mjs
 */
import sharp from 'sharp'
import { readdirSync, statSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const RINK_DIR = join(root, 'public', 'rinks')
const PUBLIC_DIR = join(root, 'public')

// Hero images to compress (keep as WebP alongside original)
const HERO_IMAGES = [
  'hero-outdoor-rink-ai.png',
  'hero-peaks-player-5-ai.png',
  'saltypuck.png',
]

async function compressImage(src, dest, opts = {}) {
  const { quality = 82, width } = opts
  const before = statSync(src).size
  const s = sharp(src)
  if (width) s.resize({ width, withoutEnlargement: true })
  await s.webp({ quality }).toFile(dest)
  const after = statSync(dest).size
  const pct = Math.round((1 - after / before) * 100)
  console.log(`  ${basename(src)} → ${basename(dest)}  ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB  (-${pct}%)`)
}

// --- Rink photos ---
console.log('\n📸 Rink photos:')
const rinkFiles = readdirSync(RINK_DIR).filter(f => f.endsWith('.png') && f !== '.DS_Store')
for (const file of rinkFiles) {
  const src = join(RINK_DIR, file)
  const dest = join(RINK_DIR, file.replace(/\.png$/, '.webp'))
  if (existsSync(dest)) {
    console.log(`  ${file} → already exists, skipping`)
    continue
  }
  await compressImage(src, dest, { quality: 82, width: 800 })
}

// --- Hero / brand images ---
console.log('\n🖼  Hero & brand images:')
for (const file of HERO_IMAGES) {
  const src = join(PUBLIC_DIR, file)
  if (!existsSync(src)) { console.log(`  ${file} NOT FOUND, skipping`); continue }
  const dest = join(PUBLIC_DIR, file.replace(/\.png$/, '.webp'))
  if (existsSync(dest)) { console.log(`  ${file} → already exists, skipping`); continue }
  // OG image: keep at 1200px width for social sharing
  const width = file.startsWith('hero-outdoor') ? 1200 : 800
  await compressImage(src, dest, { quality: 85, width })
}

// --- favicon 32x32 PNG (for <link rel="icon" sizes="32x32"> in index.html) ---
console.log('\n🔖 Favicon 32×32:')
const faviconSrc = join(PUBLIC_DIR, 'saltypuck.svg')
const faviconDest = join(PUBLIC_DIR, 'favicon-32.png')
if (existsSync(faviconSrc) && !existsSync(faviconDest)) {
  await sharp(faviconSrc).resize(32, 32).png().toFile(faviconDest)
  console.log(`  saltypuck.svg → favicon-32.png (${Math.round(statSync(faviconDest).size / 1024)}KB)`)
} else {
  console.log('  favicon-32.png already exists or SVG not found, skipping')
}

console.log('\n✅ Done.')
