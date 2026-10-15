#!/usr/bin/env bun
// Backtracking filler for 5x5 mini crosswords.
//
//   bun scripts/gen-crossword.ts --pattern corners2 --seed 7 --count 5
//   bun scripts/gen-crossword.ts --grid '#....,.....,.....,.....,....#' --count 3
//   bun scripts/gen-crossword.ts --list            # show built-in patterns
//
// Options:
//   --pattern <name>   built-in block pattern (default: corners2)
//   --grid <rows>      custom pattern, 5 comma-separated rows ('#' block, '.' open,
//                      or a fixed letter A-Z to seed the fill)
//   --seed <n>         RNG seed (default 1)
//   --count <n>        number of distinct fills to print (default 5)
//   --avoid <words>    comma-separated answers to exclude
//   --avoid-used <n>   exclude answers already used >= n times in data/crosswords.json
//   --max-nodes <n>    search budget per fill attempt (default 200000)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SIZE = 5;

export const PATTERNS: Record<string, readonly string[]> = {
  open: [".....", ".....", ".....", ".....", "....."],
  corners2: ["#....", ".....", ".....", ".....", "....#"],
  corners2b: ["....#", ".....", ".....", ".....", "#...."],
  corners4: ["#...#", ".....", ".....", ".....", "#...#"],
  stairs: ["##...", "#....", ".....", "....#", "...##"],
  stairsb: ["...##", "....#", ".....", "#....", "##..."],
  sides: ["#....", "#....", ".....", "....#", "....#"],
  sidesb: ["....#", "....#", ".....", "#....", "#...."],
};

type Slot = { dir: "across" | "down"; cells: number[] };

export function slotsFor(pattern: readonly string[]): Slot[] {
  const open = (r: number, c: number) =>
    r >= 0 && r < SIZE && c >= 0 && c < SIZE && pattern[r]![c] !== "#";
  const slots: Slot[] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      if (!open(r, c - 1) && open(r, c + 1)) {
        const cells: number[] = [];
        for (let k = c; open(r, k); k++) cells.push(r * SIZE + k);
        slots.push({ dir: "across", cells });
      }
      if (!open(r - 1, c) && open(r + 1, c)) {
        const cells: number[] = [];
        for (let k = r; open(k, c); k++) cells.push(k * SIZE + c);
        slots.push({ dir: "down", cells });
      }
    }
  return slots;
}

/** Every open cell must sit in an across run >= 3 and a down run >= 3. */
export function patternProblems(pattern: readonly string[]): string[] {
  const problems: string[] = [];
  if (pattern.length !== SIZE || pattern.some((r) => r.length !== SIZE))
    return ["pattern must be 5 rows of 5"];
  const slots = slotsFor(pattern);
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (pattern[Math.floor(i / SIZE)]![i % SIZE] === "#") continue;
    for (const dir of ["across", "down"] as const) {
      const s = slots.find((s) => s.dir === dir && s.cells.includes(i));
      if (!s || s.cells.length < 3)
        problems.push(`cell r${Math.floor(i / SIZE)}c${i % SIZE} has ${dir} run < 3`);
    }
  }
  return problems;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadWords(): string[] {
  return readFileSync(join(ROOT, "scripts/wordlist.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter((w) => /^[A-Z]{3,5}$/.test(w));
}

class Index {
  byLen = new Map<number, string[]>();
  // key `${len}:${pos}:${letter}` -> set of words
  byPos = new Map<string, Set<string>>();
  constructor(words: string[]) {
    for (const w of words) {
      const list = this.byLen.get(w.length) ?? [];
      list.push(w);
      this.byLen.set(w.length, list);
      for (let i = 0; i < w.length; i++) {
        const k = `${w.length}:${i}:${w[i]}`;
        const s = this.byPos.get(k) ?? new Set();
        s.add(w);
        this.byPos.set(k, s);
      }
    }
  }
  /** pattern like "A..E." */
  matches(pat: string): string[] {
    const fixed: Set<string>[] = [];
    for (let i = 0; i < pat.length; i++)
      if (pat[i] !== ".") fixed.push(this.byPos.get(`${pat.length}:${i}:${pat[i]}`) ?? new Set());
    if (fixed.length === 0) return this.byLen.get(pat.length) ?? [];
    fixed.sort((a, b) => a.size - b.size);
    const [first, ...rest] = fixed;
    const out: string[] = [];
    for (const w of first!) if (rest.every((s) => s.has(w))) out.push(w);
    return out;
  }
}

export function fill(
  pattern: readonly string[],
  words: string[],
  rand: () => number,
  maxNodes = 200_000,
): string[] | null {
  const idx = new Index(words);
  const slots = slotsFor(pattern);
  const grid: string[] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) grid.push(pattern[r]![c]!);
  const used = new Set<string>();
  const filled = new Array<boolean>(slots.length).fill(false);
  let nodes = 0;

  const patOf = (s: Slot) => s.cells.map((i) => grid[i]).join("");

  const shuffle = <T>(a: T[]): T[] => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [b[i], b[j]] = [b[j]!, b[i]!];
    }
    return b;
  };

  const solve = (): boolean => {
    if (++nodes > maxNodes) return false;
    // pick the unfilled slot with the fewest candidates
    let best = -1;
    let bestCands: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (filled[i]) continue;
      const pat = patOf(slots[i]!);
      const cands = pat.includes(".")
        ? idx.matches(pat).filter((w) => !used.has(w))
        : used.has(pat) || !idx.matches(pat).length ? [] : [pat];
      if (cands.length === 0) return false;
      if (best === -1 || cands.length < bestCands.length) {
        best = i;
        bestCands = cands;
      }
    }
    if (best === -1) return true;
    const slot = slots[best]!;
    const prev = slot.cells.map((i) => grid[i]!);
    for (const w of shuffle(bestCands).slice(0, 60)) {
      slot.cells.forEach((cell, k) => (grid[cell] = w[k]!));
      used.add(w);
      filled[best] = true;
      if (solve()) return true;
      filled[best] = false;
      used.delete(w);
      slot.cells.forEach((cell, k) => (grid[cell] = prev[k]!));
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  if (!solve()) return null;
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) rows.push(grid.slice(r * SIZE, r * SIZE + SIZE).join(""));
  return rows;
}

export function entriesOf(grid: readonly string[]): { across: string[]; down: string[] } {
  const slots = slotsFor(grid);
  const flat = grid.join("");
  const get = (s: Slot) => s.cells.map((i) => flat[i]).join("");
  return {
    across: slots.filter((s) => s.dir === "across").map(get),
    down: slots.filter((s) => s.dir === "down").map(get),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.main) {
  if (process.argv.includes("--list")) {
    for (const [name, p] of Object.entries(PATTERNS)) console.log(`${name.padEnd(10)} ${p.join(" ")}`);
    process.exit(0);
  }
  const pattern = arg("grid")?.split(",") ?? PATTERNS[arg("pattern") ?? "corners2"];
  if (!pattern) {
    console.error(`unknown pattern; try --list`);
    process.exit(2);
  }
  const problems = patternProblems(pattern);
  if (problems.length) {
    console.error(`bad pattern:\n  ${problems.join("\n  ")}`);
    process.exit(2);
  }
  const seed = Number(arg("seed") ?? 1);
  const count = Number(arg("count") ?? 5);
  const maxNodes = Number(arg("max-nodes") ?? 200_000);
  const avoid = new Set((arg("avoid") ?? "").split(",").filter(Boolean).map((w) => w.toUpperCase()));
  const usedLimit = arg("avoid-used");
  const dataPath = join(ROOT, "data/crosswords.json");
  if (usedLimit && existsSync(dataPath)) {
    const tally = new Map<string, number>();
    const data = JSON.parse(readFileSync(dataPath, "utf8")) as { puzzles: { grid: string[] }[] };
    for (const p of data.puzzles) {
      const e = entriesOf(p.grid);
      for (const w of [...e.across, ...e.down]) tally.set(w, (tally.get(w) ?? 0) + 1);
    }
    for (const [w, n] of tally) if (n >= Number(usedLimit)) avoid.add(w);
  }
  const words = loadWords().filter((w) => !avoid.has(w));
  const rand = mulberry32(seed);
  const seen = new Set<string>();
  let attempts = 0;
  while (seen.size < count && attempts < count * 20) {
    attempts++;
    const g = fill(pattern, words, rand, maxNodes);
    if (!g) continue;
    const key = g.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const e = entriesOf(g);
    console.log(`${g.join(" ")}   A: ${e.across.join(" ")}   D: ${e.down.join(" ")}`);
  }
  if (seen.size === 0) {
    console.error("no fill found");
    process.exit(1);
  }
}
