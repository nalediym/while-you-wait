#!/usr/bin/env bun
// Dev tool: renders the arcade pane, as the desktop would draw its tree, to
// an HTML contact sheet. Copies the mod to a scratch folder with
// scripts/preview/snapshots.tsx as a test, runs `claude plugin test` there,
// and turns each `@@SNAP` tree into HTML (1 cell = 1ch x 1.25em).
//   bun scripts/preview.ts [--cols 40] [--out preview.html]
import { $ } from 'bun'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1]! : def
}
const cols = Number(opt('cols', '40'))
const out = resolve(opt('out', join(process.env.TMPDIR ?? tmpdir(), 'while-you-wait-preview.html')))
const root = resolve(import.meta.dir, '..')
const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'wyw-preview-'))

await $`/bin/cp -R ${root}/.claude-plugin ${root}/hooks ${root}/types ${work}/`.quiet()
await $`mkdir -p ${work}/tests && /bin/cp ${root}/tests/harness.ts ${work}/tests/harness.ts`.quiet()
writeFileSync(join(work, 'tests/snapshots.test.tsx'), readFileSync(join(root, 'scripts/preview/snapshots.tsx'), 'utf8').replace('__COLS__', String(cols)))
const run = await $`claude plugin test ${work}`.nothrow().quiet()
const text = run.stdout.toString() + run.stderr.toString()
const snaps = [...text.matchAll(/^@@SNAP (\S+) (.*)$/gm)].map(m => ({ name: m[1]!, tree: JSON.parse(m[2]!) }))
if (snaps.length === 0) {
  console.error(text)
  process.exit(1)
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const cell = (n: unknown, axis: 'x' | 'y') => (typeof n === 'number' ? (axis === 'x' ? `${n}ch` : `${n * 1.25}em`) : String(n))

const html = (node: unknown): string => {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return esc(String(node))
  if (Array.isArray(node)) return node.map(html).join('')
  const n = node as Node
  const p = n.props ?? {}
  const kids = html(n.children)
  const st: string[] = []
  if (n.type === 'Box' || n.type === 'Lcd') {
    st.push('display:flex', `flex-direction:${p.flexDirection ?? 'row'}`)
    if (p.display === 'none') st.push('display:none')
    if (p.backgroundColor) st.push(`background:${p.backgroundColor}`)
    if (p.justifyContent) st.push(`justify-content:${p.justifyContent}`)
    if (p.alignItems) st.push(`align-items:${p.alignItems}`)
    if (p.alignSelf) st.push(`align-self:${p.alignSelf}`)
    if (p.width !== undefined) st.push(`width:${cell(p.width, 'x')};flex:none`)
    if (p.height !== undefined) st.push(`height:${cell(p.height, 'y')}`)
    if (p.columnGap) st.push(`column-gap:${cell(p.columnGap, 'x')}`)
    if (p.rowGap) st.push(`row-gap:${cell(p.rowGap, 'y')}`)
    const pad = (k: string, v: unknown, ax: 'x' | 'y') => v !== undefined && st.push(`${k}:${cell(v, ax)}`)
    pad('padding', p.padding === undefined ? undefined : p.padding, 'y')
    if (p.paddingX !== undefined) st.push(`padding-left:${cell(p.paddingX, 'x')};padding-right:${cell(p.paddingX, 'x')}`)
    if (p.paddingY !== undefined) st.push(`padding-top:${cell(p.paddingY, 'y')};padding-bottom:${cell(p.paddingY, 'y')}`)
    if (p.marginTop !== undefined) st.push(`margin-top:${cell(p.marginTop, 'y')}`)
    if (p.marginBottom !== undefined) st.push(`margin-bottom:${cell(p.marginBottom, 'y')}`)
    if (p.marginY !== undefined) st.push(`margin-top:${cell(p.marginY, 'y')};margin-bottom:${cell(p.marginY, 'y')}`)
    if (p.borderStyle) st.push(`border:${p.borderStyle === 'bold' ? 3 : 1}px solid ${p.borderColor ?? '#888'}`)
    return `<div class="${n.type === 'Lcd' ? 'lcd' : ''}" style="${st.join(';')}">${kids}</div>`
  }
  if (n.type === 'Text') {
    if (p.color) st.push(`color:${p.color}`)
    if (p.backgroundColor) st.push(`background:${p.backgroundColor}`)
    if (p.bold) st.push('font-weight:700')
    if (p.dimColor) st.push('opacity:.6')
    st.push(p.wrap === 'wrap' ? 'white-space:pre-wrap' : 'white-space:pre')
    return `<span style="${st.join(';')}">${kids}</span>`
  }
  if (n.type === 'Button') {
    const label = (p.label as string | undefined) ?? kids
    const cls = p.plain ? 'plain' : p.variant === 'primary' ? 'primary' : ''
    const hk = p.hotkey ? `<sup>${p.hotkey}</sup>` : ''
    return `<button class="${cls}" title="key=${esc(String(p.key ?? ''))}">${label}${hk}</button>`
  }
  return `<span title="${n.type}">${kids}</span>`
}

const page = `<!doctype html><meta charset="utf-8"><title>while-you-wait preview</title>
<style>
body{margin:0;padding:16px;background:#1b1b1f;color:#ddd;font:13px/1.25 ui-monospace,Menlo,monospace}
.sheet{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
.frame{width:${cols + 4}ch;background:#262629;border:1px solid #444;border-radius:8px;padding:8px}
.frame h2{font:600 11px system-ui;color:#999;margin:0 0 6px;text-transform:uppercase;letter-spacing:.08em}
.frame>div{width:${cols}ch}
span{line-height:1.25em;min-height:1.25em}
button{font:12px system-ui;margin:1px;border-radius:5px;border:1px solid #0f380f;background:#e9efe0;color:#0f380f;padding:1px 6px}
button.primary{background:#0f380f;color:#9bbc0f}
button.plain{background:transparent;border:none;color:#0f380f;padding:0;text-align:left;font:13px/1.25 ui-monospace,Menlo,monospace}
button sup{opacity:.5;font-size:9px;margin-left:2px}
.lcd{outline:1px dashed rgba(255,0,0,.35)}
</style><div class="sheet">${snaps.map(s => `<div class="frame"><h2>${s.name}</h2>${html(s.tree)}</div>`).join('')}</div>`
writeFileSync(out, page)
console.log(`${snaps.length} snapshots -> ${out}`)
