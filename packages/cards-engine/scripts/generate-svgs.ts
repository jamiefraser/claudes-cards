/**
 * Programmatic SVG generator for Phase 10 card deck.
 * Generates all 60 card faces + 1 back = 61 SVG files.
 *
 * Visual spec from SPEC.md §13 Story 2.3:
 * - Card size: 250×350 viewBox
 * - Rounded corners: rx="15"
 * - Number cards: colored background, large centered number, corner numbers, shape symbol
 * - Wild cards: black background, "W" letter, rainbow gradient border
 * - Skip cards: charcoal background, ⊘ symbol
 * - Back: dark blue with card platform logo pattern
 *
 * Original design — does NOT reproduce Mattel's specific card layout, typography, or back design.
 */

import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.resolve(__dirname, '../svg/phase10');

// Card dimensions
const W = 250;
const H = 350;
const RX = 15;

// Color palette (original, not Mattel-specific)
const COLOR_MAP: Record<string, { bg: string; dark: string; symbol: string }> = {
  red:    { bg: '#E8453C', dark: '#B71C1C', symbol: '◆' },
  blue:   { bg: '#1565C0', dark: '#0D47A1', symbol: '●' },
  green:  { bg: '#2E7D32', dark: '#1B5E20', symbol: '■' },
  yellow: { bg: '#F9A825', dark: '#F57F17', symbol: '▲' },
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeSvg(filename: string, content: string): void {
  const filepath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`  Generated: ${filename}`);
}

/**
 * Generates the SVG for a Phase 10 number card.
 * Original design: solid color background, large centered number,
 * small corner numbers, shape symbol in opposite corners.
 */
function numberCardSvg(color: string, num: number): string {
  const { bg, dark, symbol } = COLOR_MAP[color]!;
  const numStr = String(num);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Card background -->
  <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}" fill="${bg}" stroke="${dark}" stroke-width="3"/>
  <!-- White inset border -->
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="10" ry="10" fill="none" stroke="white" stroke-width="2" opacity="0.6"/>

  <!-- Top-left corner number -->
  <text x="18" y="42" font-family="Arial Black, sans-serif" font-size="28" font-weight="900" fill="white" text-anchor="start">${numStr}</text>
  <!-- Top-left corner symbol -->
  <text x="18" y="68" font-family="Arial, sans-serif" font-size="18" fill="white" text-anchor="start" opacity="0.9">${symbol}</text>

  <!-- Large centered number -->
  <text x="${W / 2}" y="${H / 2 + 30}" font-family="Arial Black, sans-serif" font-size="110" font-weight="900" fill="white" text-anchor="middle">${numStr}</text>

  <!-- Bottom-right corner number (rotated 180°) -->
  <text x="${W - 18}" y="${H - 48}" font-family="Arial Black, sans-serif" font-size="28" font-weight="900" fill="white" text-anchor="end">${numStr}</text>
  <!-- Bottom-right corner symbol -->
  <text x="${W - 18}" y="${H - 22}" font-family="Arial, sans-serif" font-size="18" fill="white" text-anchor="end" opacity="0.9">${symbol}</text>
</svg>`;
}

/**
 * Generates the SVG for a Phase 10 Wild card.
 * Original design: black background, large "W", rainbow gradient border.
 */
function wildCardSvg(instanceIndex: number): string {
  const gradId = `rainbow-${instanceIndex}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#FF0000"/>
      <stop offset="16%"  stop-color="#FF8000"/>
      <stop offset="33%"  stop-color="#FFFF00"/>
      <stop offset="50%"  stop-color="#00CC00"/>
      <stop offset="66%"  stop-color="#0066FF"/>
      <stop offset="83%"  stop-color="#8800FF"/>
      <stop offset="100%" stop-color="#FF0000"/>
    </linearGradient>
  </defs>

  <!-- Rainbow gradient border frame -->
  <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}" fill="url(#${gradId})"/>
  <!-- Black card body (inset from border) -->
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="11" ry="11" fill="#111111"/>

  <!-- Top-left label -->
  <text x="18" y="42" font-family="Arial Black, sans-serif" font-size="26" font-weight="900" fill="white" text-anchor="start">W</text>
  <text x="18" y="64" font-family="Arial, sans-serif" font-size="13" fill="#CCCCCC" text-anchor="start">WILD</text>

  <!-- Large centered W -->
  <text x="${W / 2}" y="${H / 2 + 40}" font-family="Arial Black, sans-serif" font-size="120" font-weight="900" fill="white" text-anchor="middle">W</text>

  <!-- Bottom-right label -->
  <text x="${W - 18}" y="${H - 48}" font-family="Arial Black, sans-serif" font-size="26" font-weight="900" fill="white" text-anchor="end">W</text>
  <text x="${W - 18}" y="${H - 26}" font-family="Arial, sans-serif" font-size="13" fill="#CCCCCC" text-anchor="end">WILD</text>
</svg>`;
}

/**
 * Generates the SVG for a Phase 10 Skip card.
 * Original design: charcoal background, large ⊘ symbol.
 */
function skipCardSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Charcoal background -->
  <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}" fill="#37474F" stroke="#263238" stroke-width="3"/>
  <!-- Inner border -->
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="10" ry="10" fill="none" stroke="#90A4AE" stroke-width="2" opacity="0.6"/>

  <!-- Top-left label -->
  <text x="18" y="44" font-family="Arial, sans-serif" font-size="28" fill="white" text-anchor="start">⊘</text>
  <text x="18" y="66" font-family="Arial, sans-serif" font-size="12" fill="#B0BEC5" text-anchor="start">SKIP</text>

  <!-- Large centered skip symbol -->
  <text x="${W / 2}" y="${H / 2 + 45}" font-family="Arial, sans-serif" font-size="120" fill="white" text-anchor="middle">⊘</text>

  <!-- Bottom-right label -->
  <text x="${W - 18}" y="${H - 48}" font-family="Arial, sans-serif" font-size="28" fill="white" text-anchor="end">⊘</text>
  <text x="${W - 18}" y="${H - 26}" font-family="Arial, sans-serif" font-size="12" fill="#B0BEC5" text-anchor="end">SKIP</text>
</svg>`;
}

/**
 * Generates the SVG for the card back.
 * Original design: dark navy background with a diamond tile pattern and center emblem.
 * Does NOT reproduce Mattel's card back design.
 */
function backSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <pattern id="tile" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
      <rect width="30" height="30" fill="#0D2B5E"/>
      <polygon points="15,2 28,15 15,28 2,15" fill="none" stroke="#1A4A99" stroke-width="1" opacity="0.6"/>
      <circle cx="15" cy="15" r="2" fill="#1A4A99" opacity="0.4"/>
    </pattern>
    <clipPath id="card-clip">
      <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}"/>
    </clipPath>
  </defs>

  <!-- Dark navy base -->
  <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}" fill="#0D2B5E"/>
  <!-- Tile pattern overlay -->
  <rect width="${W}" height="${H}" fill="url(#tile)" clip-path="url(#card-clip)"/>
  <!-- Border -->
  <rect width="${W}" height="${H}" rx="${RX}" ry="${RX}" fill="none" stroke="#1A4A99" stroke-width="4"/>

  <!-- Center emblem: stylized CP (Card Platform) -->
  <circle cx="${W / 2}" cy="${H / 2}" r="52" fill="#0D2B5E" stroke="#4A7EC7" stroke-width="3"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="44" fill="none" stroke="#2A5A9A" stroke-width="1" opacity="0.5"/>
  <!-- C -->
  <path d="M 98 165 A 27 27 0 1 1 98 185" fill="none" stroke="#7BB3F0" stroke-width="5" stroke-linecap="round"/>
  <!-- P -->
  <line x1="132" y1="152" x2="132" y2="198" stroke="#7BB3F0" stroke-width="5" stroke-linecap="round"/>
  <path d="M 132 152 Q 155 152 155 165 Q 155 175 132 175" fill="none" stroke="#7BB3F0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// ---- Main generation ----

console.log('Generating Phase 10 SVG cards...');
ensureDir(OUT_DIR);

const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// Number cards: 4 colors × 12 numbers = 48
for (const color of COLORS) {
  for (let n = 1; n <= 12; n++) {
    writeSvg(`${color}-${n}.svg`, numberCardSvg(color, n));
  }
}

// Wild cards: 8
for (let i = 1; i <= 8; i++) {
  writeSvg(`wild-${i}.svg`, wildCardSvg(i));
}

// Skip cards: 4
for (let i = 1; i <= 4; i++) {
  writeSvg(`skip-${i}.svg`, skipCardSvg());
}

// Back
writeSvg('back.svg', backSvg());

console.log(`\nDone! Generated 61 SVG files in ${OUT_DIR}`);
