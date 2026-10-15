#!/usr/bin/env bun
// Validates data/crosswords.json. Exits non-zero on any rule violation.
//   bun scripts/check-crosswords.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SIZE = 5;
const MAX_CLUE = 60;
const MAX_REUSE = 2; // an answer may appear in at most this many puzzles (warning only)

type Puzzle = {
  id: string;
  title: string;
  grid: string[];
  clues: { across: Record<string, string>; down: Record<string, string> };
};

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

const words = new Set(
  readFileSync(join(ROOT, "scripts/wordlist.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean),
);

let data: unknown;
try {
  data = JSON.parse(readFileSync(join(ROOT, "data/crosswords.json"), "utf8"));
} catch (e) {
  console.error(`cannot read data/crosswords.json: ${(e as Error).message}`);
  process.exit(1);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

if (!isObj(data) || data.version !== 1 || !Array.isArray(data.puzzles)) {
  console.error('top level must be {"version":1,"puzzles":[...]}');
  process.exit(1);
}
const extraTop = Object.keys(data).filter((k) => k !== "version" && k !== "puzzles");
if (extraTop.length) err("top level", `unexpected keys ${extraTop.join(", ")}`);

type Entry = { num: number; dir: "across" | "down"; answer: string };

/** Standard numbering; returns entries plus per-cell run lengths. */
function analyse(grid: string[]): { entries: Entry[]; runs: { across: number[]; down: number[] } } {
  const open = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && grid[r]![c] !== "#";
  const entries: Entry[] = [];
  const runs = { across: new Array<number>(SIZE * SIZE).fill(0), down: new Array<number>(SIZE * SIZE).fill(0) };
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      const startsA = !open(r, c - 1) && open(r, c + 1);
      const startsD = !open(r - 1, c) && open(r + 1, c);
      if (!startsA && !startsD) continue;
      n++;
      if (startsA) {
        let k = c;
        let s = "";
        while (open(r, k)) s += grid[r]![k++];
        entries.push({ num: n, dir: "across", answer: s });
      }
      if (startsD) {
        let k = r;
        let s = "";
        while (open(k, c)) s += grid[k++]![c];
        entries.push({ num: n, dir: "down", answer: s });
      }
    }
  // run length through every open cell, both directions
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      let a = 1;
      for (let k = c - 1; open(r, k); k--) a++;
      for (let k = c + 1; open(r, k); k++) a++;
      let d = 1;
      for (let k = r - 1; open(k, c); k--) d++;
      for (let k = r + 1; open(k, c); k++) d++;
      runs.across[r * SIZE + c] = a;
      runs.down[r * SIZE + c] = d;
    }
  return { entries, runs };
}

const ids = new Set<string>();
const answerUse = new Map<string, string[]>();
const summaries: string[] = [];

(data.puzzles as unknown[]).forEach((raw, i) => {
  const expectedId = `cw-${String(i + 1).padStart(3, "0")}`;
  if (!isObj(raw)) return err(`puzzle[${i}]`, "not an object");
  const p = raw as unknown as Puzzle;
  const where = typeof p.id === "string" ? p.id : `puzzle[${i}]`;

  const extra = Object.keys(raw).filter((k) => !["id", "title", "grid", "clues"].includes(k));
  if (extra.length) err(where, `unexpected keys ${extra.join(", ")}`);

  if (typeof p.id !== "string") err(where, "missing id");
  else {
    if (ids.has(p.id)) err(where, "duplicate id");
    ids.add(p.id);
    if (p.id !== expectedId) err(where, `id out of order, expected ${expectedId}`);
  }
  if (typeof p.title !== "string" || !p.title.trim()) err(where, "missing title");

  // shape + charset
  if (!Array.isArray(p.grid) || p.grid.length !== SIZE) return err(where, `grid must have ${SIZE} rows`);
  let shapeOk = true;
  p.grid.forEach((row, r) => {
    if (typeof row !== "string" || row.length !== SIZE) {
      err(where, `row ${r} must be a ${SIZE}-char string`);
      shapeOk = false;
    } else if (!/^[A-Z#]+$/.test(row)) {
      err(where, `row ${r} "${row}" has chars outside A-Z and #`);
      shapeOk = false;
    }
  });
  if (!shapeOk) return;

  const { entries, runs } = analyse(p.grid);

  // every open cell in across >= 3 and down >= 3
  for (let cell = 0; cell < SIZE * SIZE; cell++) {
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    if (p.grid[r]![c] === "#") continue;
    if (runs.across[cell]! < 3) err(where, `cell r${r}c${c} across run is ${runs.across[cell]} (< 3)`);
    if (runs.down[cell]! < 3) err(where, `cell r${r}c${c} down run is ${runs.down[cell]} (< 3)`);
  }

  // clues vs numbering, both directions
  if (!isObj(p.clues) || !isObj(p.clues.across) || !isObj(p.clues.down)) return err(where, "clues must have across and down objects");
  const extraClueKeys = Object.keys(p.clues).filter((k) => k !== "across" && k !== "down");
  if (extraClueKeys.length) err(where, `unexpected clue keys ${extraClueKeys.join(", ")}`);
  for (const dir of ["across", "down"] as const) {
    const expected = new Set(entries.filter((e) => e.dir === dir).map((e) => String(e.num)));
    const got = p.clues[dir];
    for (const k of expected) if (!(k in got)) err(where, `missing ${dir} clue ${k}`);
    for (const [k, v] of Object.entries(got)) {
      if (!expected.has(k)) err(where, `extra ${dir} clue ${k} (no such entry)`);
      if (typeof v !== "string" || !v.trim()) err(where, `${dir} ${k} clue is empty`);
      else if (v.length > MAX_CLUE) err(where, `${dir} ${k} clue is ${v.length} chars (> ${MAX_CLUE})`);
    }
  }

  // answers: in wordlist, no dup within puzzle
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.answer.length < 3) err(where, `${e.num}-${e.dir} "${e.answer}" shorter than 3`);
    if (!words.has(e.answer)) err(where, `${e.num}-${e.dir} "${e.answer}" not in wordlist.txt`);
    if (seen.has(e.answer)) err(where, `"${e.answer}" appears twice`);
    seen.add(e.answer);
    const uses = answerUse.get(e.answer) ?? [];
    uses.push(where);
    answerUse.set(e.answer, uses);
  }

  const blocks = p.grid.join("").split("#").length - 1;
  const a = entries.filter((e) => e.dir === "across").map((e) => e.answer);
  const d = entries.filter((e) => e.dir === "down").map((e) => e.answer);
  summaries.push(
    `${where}  ${String(p.title).padEnd(16)} ${blocks} blk  ${a.length}A/${d.length}D  ${a.join(" ")} | ${d.join(" ")}`,
  );
});

for (const [w, uses] of answerUse)
  if (uses.length > MAX_REUSE) warnings.push(`"${w}" used in ${uses.length} puzzles (${uses.join(", ")})`);

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in data/crosswords.json:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
for (const s of summaries) console.log(s);
for (const w of warnings) console.warn(`warn: ${w}`);
console.log(`ok: ${summaries.length} puzzles valid`);
