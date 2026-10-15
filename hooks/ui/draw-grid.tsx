// Draws a Grid with Box and Text, for the plain fallback pane.

import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'
import type { Grid } from './grid'

export type GridElements = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

const center = (s: string, w: number): string => {
  const pad = Math.max(0, w - s.length)
  return ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(Math.ceil(pad / 2))
}

export const drawGrid = ({ Box, Text }: GridElements, g: Grid): RenderElement => {
  const rows: Grid['cells'][] = []
  for (let i = 0; i < g.cells.length; i += g.cols) rows.push(g.cells.slice(i, i + g.cols))
  return (
    <Box flexDirection="column" backgroundColor={g.line} rowGap={g.gapY} alignSelf="flex-start">
      {rows.map(row => (
        <Box flexDirection="row" columnGap={g.gapX}>
          {row.map(cell => {
            const lines: string[] = Array(g.ch).fill(' '.repeat(g.cw))
            const mid = Math.floor((g.ch - (cell.sup ? 0 : 1)) / 2)
            lines[Math.min(g.ch - 1, cell.sup ? Math.max(1, mid) : mid)] = center(cell.t, g.cw)
            if (cell.sup) lines[0] = cell.sup.padEnd(g.cw).slice(0, g.cw)
            return (
              <Box flexDirection="column" width={g.cw} height={g.ch} backgroundColor={cell.bg}>
                {lines.map((line, k) => (
                  <Text color={cell.fg} backgroundColor={cell.bg} bold={k > 0 || !cell.sup ? cell.bold : false} wrap="truncate">
                    {line}
                  </Text>
                ))}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
