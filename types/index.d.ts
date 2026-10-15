// The arcade's $.state contract, self-contained. `live` is where Claude is
// right now; `session` is this session's work stats (never stored: a new
// session starts from zero); `save` is your games and bests, shared by every
// session through $.store. Game logic and the model import these types from here.

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
  phase: Phase // working while your turn runs OR any of this session's agents still does
  turnId: string | null
  isTurnRunning: boolean // your main conversation's turn
  agents: number // this session's agents still running (background ones, once your turn ends)
  busySince: number | null // when Claude last got busy (turn or agents); null while idle
  offeredFor: number | null // the busySince the pane already offered itself for
  banner: Banner
  playedThisTurn: boolean
  testMode: boolean // /games test: playable whatever Claude is doing; this session only
  keyboardMode: boolean // the ⌨ button: keys typed go to the game; this session only
}

/** One line of the debug timeline (store key debug-timeline, devTools only): what happened, and the state after. */
export type TraceEntry = { at: number; event: string; phase: Phase; agents: number; isTurnRunning: boolean; testMode: boolean; note?: string }

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

declare module 'claude-code' {
  interface PluginState {
    'while-you-wait': { live: Live; session: SessionStats; save: Save }
  }
}
