// The factory floor behind the conversation: a works skyline along the foot of
// the screen with smoking chimneys, lit windows, a running conveyor and two
// meshing gears, on a blueprint grid. One SVG, animated by its own CSS.
//
// Its colors are mid-tones at low opacity, so the same drawing reads on the
// light and on the dark ground of the factory look.

export const SCENE = 'factory-floor'
export const SCENE_ALT =
  'A factory skyline with smoking chimneys, lit windows, a conveyor belt and turning gears on a blueprint grid'

const WIDTH = 1600
const HEIGHT = 1000
const GROUND = 930
const BLOCK = 400

const n = (value: number) => String(Math.round(value * 10) / 10)

// A gear's outline around the origin: `teeth` flat-topped teeth, and a hub.
function gear(radius: number, teeth: number): string {
  const depth = radius * 0.16
  const step = (Math.PI * 2) / teeth
  const points: string[] = []
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const at = tooth * step
    for (const [turn, reach] of [
      [0, radius - depth],
      [0.15, radius],
      [0.45, radius],
      [0.6, radius - depth],
    ] as const) {
      const angle = at + turn * step
      points.push(`${n(Math.cos(angle) * reach)} ${n(Math.sin(angle) * reach)}`)
    }
  }
  const hub = radius * 0.32
  return `M${points.join('L')}ZM${n(hub)} 0A${n(hub)} ${n(hub)} 0 1 0 ${n(-hub)} 0A${n(hub)} ${n(hub)} 0 1 0 ${n(hub)} 0Z`
}

function smoke(x: number, top: number, delay: number): string {
  return [0, 1, 2, 3]
    .map(
      puff =>
        `<circle class="smoke" cx="${x}" cy="${top}" r="13" style="animation-delay:${n(delay + puff * 2.25)}s"/>`,
    )
    .join('')
}

// One works: a sawtooth hall, an office block and two chimneys, 400 wide,
// standing on y = 0 and rising into negative y.
function works(index: number): string {
  const tall = 190 + (index % 3) * 26
  const stack = 250 + ((index * 2) % 3) * 30
  const windows: string[] = []
  for (let bay = 0; bay < 4; bay += 1) {
    windows.push(`<rect class="lit" x="${18 + bay * 55}" y="-84" width="30" height="24" style="animation-delay:${n((index * 3 + bay) * 1.7)}s"/>`)
  }
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const y = -tall + 22 + row * 32
      if (y > -30) continue
      windows.push(`<rect class="lit" x="${244 + column * 30}" y="${y}" width="16" height="18" style="animation-delay:${n((index + row * 2 + column) * 2.3)}s"/>`)
    }
  }
  return [
    `<path class="wall" d="M0 0V-110L55 -150V-110L110 -150V-110L165 -150V-110L220 -150V0Z"/>`,
    `<rect class="wall" x="232" y="${-tall}" width="72" height="${tall}"/>`,
    `<path class="wall" d="M318 0L325 ${-stack}H347L354 0Z"/>`,
    `<rect class="band" x="325" y="${-stack + 14}" width="22" height="9"/>`,
    `<rect class="band" x="324.5" y="${-stack + 34}" width="23" height="9"/>`,
    `<path class="wall" d="M364 0L369 ${-stack + 80}H385L390 0Z"/>`,
    `<rect class="band" x="369" y="${-stack + 92}" width="16" height="8"/>`,
    windows.join(''),
    smoke(336, -stack - 8, index * 1.3),
    smoke(377, -stack + 72, index * 1.3 + 4.1),
  ].join('')
}

function skyline(): string {
  const blocks: string[] = []
  for (let index = 0; index < WIDTH / BLOCK; index += 1) {
    // Every other works is mirrored, so the row does not read as a stamp.
    const place =
      index % 2 === 0
        ? `translate(${index * BLOCK} ${GROUND})`
        : `translate(${(index + 1) * BLOCK} ${GROUND}) scale(-1 1)`
    blocks.push(`<g transform="${place}">${works(index)}</g>`)
  }
  return blocks.join('')
}

function conveyor(): string {
  const rollers: string[] = []
  for (let x = 20; x < WIDTH; x += 40) {
    rollers.push(`<circle class="line" cx="${x}" cy="${GROUND + 22}" r="6"/>`)
  }
  const crates: string[] = []
  for (let x = -200; x < WIDTH; x += 200) {
    crates.push(`<rect class="crate" x="${x + 30}" y="${GROUND - 12}" width="34" height="24" rx="2"/>`)
    crates.push(`<rect class="crate small" x="${x + 122}" y="${GROUND - 4}" width="24" height="16" rx="2"/>`)
  }
  return [
    `<g class="belt">${crates.join('')}</g>`,
    `<path class="line" d="M0 ${GROUND + 13}H${WIDTH}M0 ${GROUND + 31}H${WIDTH}"/>`,
    rollers.join(''),
    `<rect x="0" y="${GROUND + 42}" width="${WIDTH}" height="${HEIGHT - GROUND - 42}" fill="url(#hazard)"/>`,
  ].join('')
}

const STYLE = `
.wall{fill:#7f8c99;fill-opacity:.2;stroke:#7f8c99;stroke-opacity:.5;stroke-width:1.5}
.line{fill:none;stroke:#7f8c99;stroke-opacity:.5;stroke-width:1.5}
.band{fill:#e8590c;fill-opacity:.6}
.lit{fill:#f08c3a;fill-opacity:.55;animation:flicker 9s ease-in-out infinite}
.crate{fill:#e8590c;fill-opacity:.4;stroke:#e8590c;stroke-opacity:.7;stroke-width:1.5}
.crate.small{fill:#7f8c99;fill-opacity:.3;stroke:#7f8c99}
.belt{animation:roll 6s linear infinite}
.smoke{fill:#7f8c99;opacity:0;transform-box:fill-box;transform-origin:center;animation:rise 9s ease-out infinite}
.gear{fill:#7f8c99;fill-opacity:.1;fill-rule:evenodd;stroke:#7f8c99;stroke-opacity:.3;stroke-width:1.5;transform-box:fill-box;transform-origin:center}
.gear.big{animation:turn 60s linear infinite}
.gear.little{animation:turn 30s linear infinite reverse}
@keyframes roll{to{transform:translateX(200px)}}
@keyframes rise{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:.3}100%{opacity:0;transform:translate(46px,-210px) scale(3.2)}}
@keyframes flicker{0%,100%{fill-opacity:.55}46%{fill-opacity:.55}50%{fill-opacity:.15}54%{fill-opacity:.6}}
@keyframes turn{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.smoke{opacity:.18}}
`.replace(/\n/g, '')

// The foot of the drawing is pinned to the foot of the screen, and the row of
// works runs the whole width, so a tall phone and a wide window both show it.
export const FACTORY_SCENE = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMax slice">`,
  `<style>${STYLE}</style>`,
  '<defs>',
  '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7f8c99" stroke-opacity=".16"/></pattern>',
  '<pattern id="plan" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200 0H0V200" fill="none" stroke="#7f8c99" stroke-opacity=".22" stroke-width="1.5"/></pattern>',
  '<pattern id="hazard" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="20" height="40" fill="#e8590c" fill-opacity=".55"/><rect x="20" width="20" height="40" fill="#1a2129" fill-opacity=".55"/></pattern>',
  '</defs>',
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>`,
  `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#plan)"/>`,
  `<g transform="translate(1385 560)"><path class="gear big" d="${gear(150, 16)}"/></g>`,
  `<g transform="translate(1168 470)"><path class="gear little" d="${gear(84, 9)}"/></g>`,
  `<g transform="translate(190 610)"><path class="gear little" d="${gear(110, 12)}"/></g>`,
  skyline(),
  conveyor(),
  '</svg>',
].join('')
