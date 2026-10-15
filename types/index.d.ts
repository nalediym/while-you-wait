// The arcade's $.state contract, self-contained. `live` is where Claude is
// right now; `save` is everything you'd want back next time (mirrored to
// $.store); `lcd` says whether the desktop's Client LCD works here.
// Game logic and the model import these types from here.

export type Dir = 'up' | 'down' | 'left' | 'right'

export type G2048 = {
  board: number[] // 16 cells, row-major, 0 = empty
  score: number
  seed: number
  moves: number
  isOver: boolean
  hasWon: boolean // reached 2048 at least once (you may keep going)
}

export type MinesStatus = 'ready' | 'playing' | 'won' | 'lost'

export type Mines = {
  w: number
  h: number
  mineCount: number
  mines: number[] // cell indices; empty until the first reveal (the first click is always safe)
  revealed: boolean[]
  flagged: boolean[]
  status: MinesStatus
  cursor: number
  seed: number
  elapsedMs: number // play time banked so far
  runningSince: number | null // when the clock last resumed; null while paused
  exploded: number | null
}

export type Direction = 'across' | 'down'

export type Crossword = {
  puzzleId: string
  letters: string[] // 25 cells: '' empty, '#' block, else A-Z
  cursor: number
  dir: Direction
  isSolved: boolean
}

export type Screen = 'menu' | '2048' | 'mines' | 'crossword' | 'scores'

/** Where Claude is: the arcade is playable only while `working`. */
export type Phase = 'idle' | 'working' | 'attention'
export type Banner = 'done' | 'needs-you' | null

export type Live = {
  phase: Phase
  turnId: string | null
  turnStartedAt: number | null
  offeredTurnId: string | null // the turn the pane already offered itself in
  banner: Banner
  playedThisTurn: boolean
}

export type Tally = {
  turns: number // turns Claude completed with an answer
  turnsWhileWaited: number // ...of which you played during
  workMs: number // time Claude spent working
  toolCalls: number
  filesEdited: number // distinct files, per day
  boardsCleared: number // games finished: 2048 ended, mines cleared, crossword solved
}

export type Stats = { day: string; today: Tally; allTime: Tally; todayFiles: string[] }

export type Scores = {
  best2048Tile: number
  best2048Score: number
  minesFastestMs: number[] // fastest clears, best first, top 5
  crosswordsSolved: string[] // puzzle ids
}

export type Save = {
  v: 1
  screen: Screen
  menuCursor: number
  g2048: G2048 | null
  mines: Mines | null
  crossword: Crossword | null
  flagMode: boolean
  scores: Scores
  stats: Stats
}

export type Lcd = { hasFailed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'while-you-wait': { live: Live; save: Save; lcd: Lcd }
  }
}
