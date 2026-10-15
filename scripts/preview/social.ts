#!/usr/bin/env bun
// Writes the repo's social preview (docs/social-preview.svg, and .png when
// rsvg-convert is installed): 1280x640, the handheld mid-2048 beside the name,
// all drawn by the plugin's own code and pixel font. Upload the PNG in the
// repo's Settings → General → Social preview.
//   bun scripts/preview/social.ts
import { $ } from 'bun'
import { writeFileSync } from 'node:fs'
import * as G2048 from '../../hooks/games/g2048'
import { PUZZLES } from '../../hooks/games/puzzles'
import * as M from '../../hooks/model'
import { drawDevice } from '../../hooks/ui/device'
import { GB } from '../../hooks/ui/palette'
import { Typesetter } from '../../hooks/ui/pixelfont'

const W = 1280
const H = 640
const DESK = '#121110'
const TEXT = '#ebe7e0'
const MUTED = '#9a948b'

// The video's opening frame: two 512s about to merge, one agent still working.
const T0 = new Date(2026, 9, 15, 15, 30).getTime()
const g = { ...G2048.newGame(7), board: [2, 8, 16, 4, 4, 32, 64, 2, 8, 128, 256, 16, 512, 512, 32, 4], score: 9876 }
const live = { ...M.turnStarted(M.freshLive(), 't', T0), agents: 1 }
const device = drawDevice({ save: { ...M.freshSave(), screen: '2048', g2048: g }, live, session: M.freshSession(), now: T0, puzzles: PUZZLES }).svg

const dw = 500
const dh = Math.round((dw * 192) / 200)
const dx = 700
const dy = Math.round((H - dh) / 2)

const t = new Typesetter()
const x = 80
const text =
  t.text('WHILE-YOU-WAIT', x, 158, GB.lightest, 7) +
  t.text('A TINY ARCADE THAT ONLY', x, 262, TEXT, 4) +
  t.text('PLAYS WHILE CLAUDE WORKS.', x, 310, TEXT, 4) +
  t.text('2048 · MINESWEEPER · CROSSWORDS', x, 392, MUTED, 2) +
  t.text('A CLAUDE CODE PLUGIN', x, 420, MUTED, 2) +
  t.text('GITHUB.COM/NALEDIYM/WHILE-YOU-WAIT', x, 474, GB.light, 2)

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<defs>${t.defs()}` +
  `<radialGradient id="glow"><stop offset="0" stop-color="${GB.lightest}" stop-opacity=".16"/><stop offset="1" stop-color="${GB.lightest}" stop-opacity="0"/></radialGradient>` +
  `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>` +
  `<rect width="${W}" height="${H}" fill="${DESK}"/>` +
  `<circle cx="${dx + dw / 2}" cy="${dy + dh * 0.45}" r="${dw * 0.75}" fill="url(#glow)"/>` +
  `<rect x="${dx + 24}" y="${dy + 40}" width="${dw - 48}" height="${dh - 30}" rx="30" fill="#000" opacity=".55" filter="url(#shadow)"/>` +
  `<g shape-rendering="crispEdges">${text}</g>` +
  device.replace(/width="\d+" height="\d+"/, `x="${dx}" y="${dy}" width="${dw}" height="${dh}"`) +
  '</svg>'

writeFileSync('docs/social-preview.svg', svg)
const png = await $`rsvg-convert -w ${W} -h ${H} docs/social-preview.svg -o docs/social-preview.png`.nothrow().quiet()
console.log(png.exitCode === 0 ? 'docs/social-preview.svg + .png' : 'docs/social-preview.svg (install rsvg-convert for the .png)')
