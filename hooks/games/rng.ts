// Seeded RNG (mulberry32). The seed lives in each game's saved state, so a
// resumed game deals exactly the tiles / mines it would have dealt anyway.

export type Rolled = { value: number; seed: number }

export const roll = (seed: number): Rolled => {
  const next = (seed + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next }
}

/** An integer in [0, n). */
export const rollInt = (seed: number, n: number): Rolled => {
  const r = roll(seed)
  return { value: Math.floor(r.value * n), seed: r.seed }
}
