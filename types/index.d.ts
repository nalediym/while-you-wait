// The arcade's $.state contract, self-contained. `live` is where Claude is
// right now; `session` is this session's work stats (never stored: a new
// session starts from zero); `save` is your games and bests, shared by every
// session through $.store; `lcd` says whether the desktop's Client works here.
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

/** This session's work, counted from zero when the session starts. */
export type SessionStats = {
  turns: number // turns Claude completed with an answer
  turnsWhileWaited: number // ...of which you played during
  workMs: number // time Claude spent working
  toolCalls: number
  filesEdited: number // distinct files
  boardsCleared: number // games you finished: 2048 ended, mines cleared, crossword solved
  files: string[] // the paths behind filesEdited
}

export type Scores = {
  best2048Tile: number
  best2048Score: number
  minesFastestMs: number[] // fastest clears, best first, top 5
  crosswordsSolved: string[] // puzzle ids
}

/** Your games and bests: kept across sessions, shared by all of them. No stats. */
export type Save = {
  v: 2
  screen: Screen
  menuCursor: number
  g2048: G2048 | null
  mines: Mines | null
  crossword: Crossword | null
  flagMode: boolean
  scores: Scores
}

export type Lcd = { hasFailed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'while-you-wait': { live: Live; session: SessionStats; save: Save; lcd: Lcd }
  }
}
