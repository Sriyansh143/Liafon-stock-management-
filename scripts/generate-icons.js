// Generate PNG icons from the SVG logo for PWA installation.
// iOS Safari requires PNG icons (it ignores SVG), so we generate
// 192x192 and 512x512 PNGs from the SVG source.
//
// Run: npx tsx scripts/generate-icons.ts
// (or: node scripts/generate-icons.js after transpiling)

const sharp = require('sharp')
const { readFileSync } = require('fs')
const { join } = require('path')

const svgPath = join(process.cwd(), 'public', 'logo.svg')
const publicDir = join(process.cwd(), 'public')

const svgBuffer = readFileSync(svgPath)

async function generate() {
  // 192x192 — required by PWA spec (Android Chrome install icon)
  await sharp(svgBuffer).resize(192, 192).png().toFile(join(publicDir, 'icon-192.png'))
  console.log('✓ icon-192.png')

  // 512x512 — required by PWA spec (splash screen + Android)
  await sharp(svgBuffer).resize(512, 512).png().toFile(join(publicDir, 'icon-512.png'))
  console.log('✓ icon-512.png')

  // 180x180 — Apple touch icon (iOS home screen)
  await sharp(svgBuffer).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')

  // 32x32 — favicon
  await sharp(svgBuffer).resize(32, 32).png().toFile(join(publicDir, 'favicon-32.png'))
  console.log('✓ favicon-32.png')

  console.log('\nAll PWA icons generated successfully.')
}

generate().catch(console.error)
