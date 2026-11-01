import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Drafts, Note, Removed, Todo } from '../types'

const PANE = 'appunti'
const FIELD_ROWS = 3
const EMPTY: Board = { notes: [], todos: [] }

// Cambia l'etichetta se cambiano i campi: un valore salvato da una versione
// precedente viene letto come vuoto invece che con la forma sbagliata.
const board = atom({ plugin: 'appunti-progetto', key: 'board' } as const, EMPTY, {
  shape: 'board-1',
})
const project = atom({ plugin: 'appunti-progetto', key: 'project' } as const, '')
const removed = atom({ plugin: 'appunti-progetto', key: 'removed' } as const, null)
const drafts = atom({ plugin: 'appunti-progetto', key: 'drafts' } as const, {
  note: '',
  todo: '',
} as Drafts)

const storeKey = (root: string) => `board:${root}`
const folderName = (root: string) => root.split('/').filter(Boolean).pop() ?? root

// Legge con prudenza quello che c'è nel salvataggio: scarta voci malformate.
function toBoard(raw: unknown): Board {
  if (!raw || typeof raw !== 'object') return EMPTY
  const data = raw as { notes?: unknown; todos?: unknown }
  const notes = Array.isArray(data.notes)
    ? data.notes.filter(
        (n): n is Note =>
          !!n &&
          typeof n.id === 'string' &&
          typeof n.text === 'string' &&
          typeof n.at === 'number',
      )
    : []
  const todos = Array.isArray(data.todos)
    ? data.todos.filter(
        (t): t is Todo =>
          !!t &&
          typeof t.id === 'string' &&
          typeof t.text === 'string' &&
          typeof t.done === 'boolean' &&
          typeof t.at === 'number',
      )
    : []
  return { notes, todos }
}

function two(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function when(ms: number) {
  const d = new Date(ms)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

function asText(b: Board) {
  const notes = [...b.notes].sort((x, y) => y.at - x.at)
  const open = b.todos.filter(t => !t.done).sort((x, y) => x.at - y.at)
  const done = b.todos.filter(t => t.done).sort((x, y) => x.at - y.at)
  const lines = [`Appunti (${notes.length})`]
  if (notes.length === 0) lines.push('  Nessun appunto.')
  for (const n of notes) lines.push(`  ${when(n.at)}  ${n.text}`)
  lines.push('', `To do (${open.length} da fare${done.length ? `, ${done.length} fatte` : ''})`)
  if (b.todos.length === 0) lines.push('  Nessuna voce.')
  for (const t of [...open, ...done]) lines.push(`  ${t.done ? '☑' : '☐'} ${t.text}`)
  lines.push('', 'Aggiungi con /nota testo e /todo testo.')
  return lines.join('\n')
}

async function newId($: EngineInterface) {
  const now = await $.clock.now()
  return { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: now }
}

// Ogni modifica passa da qui: aggiorna il pannello e salva su disco.
async function change($: EngineInterface, fn: (b: Board) => Board) {
  const saved = await update($, board, fn)
  const root = await read($, project)
  if (root) await $.store.set(storeKey(root), saved)
  return saved
}

async function addNote($: EngineInterface, text: string) {
  const clean = text.trim()
  if (!clean) return false
  const { id, at } = await newId($)
  await change($, b => ({ ...b, notes: [...b.notes, { id, text: clean, at }] }))
  return true
}

async function addTodo($: EngineInterface, text: string) {
  const clean = text.trim()
  if (!clean) return false
  const { id, at } = await newId($)
  await change($, b => ({ ...b, todos: [...b.todos, { id, text: clean, done: false, at }] }))
  return true
}

async function remove($: EngineInterface, what: Removed) {
  const noteIds = new Set(what.notes.map(n => n.id))
  const todoIds = new Set(what.todos.map(t => t.id))
  await change($, b => ({
    notes: b.notes.filter(n => !noteIds.has(n.id)),
    todos: b.todos.filter(t => !todoIds.has(t.id)),
  }))
  await update($, removed, () => what)
}

async function undo($: EngineInterface) {
  const last = await read($, removed)
  if (!last) return
  await change($, b => ({
    notes: [...b.notes, ...last.notes.filter(n => !b.notes.some(x => x.id === n.id))],
    todos: [...b.todos, ...last.todos.filter(t => !b.todos.some(x => x.id === t.id))],
  }))
  await update($, removed, () => null)
}

async function openPane($: EngineInterface, focus: boolean) {
  const root = await read($, project)
  const title = root ? `Appunti · ${folderName(root)}` : 'Appunti'
  return $.ui.open(focus ? { id: PANE, title, focus: true } : { id: PANE, title })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let root = ''
    try {
      root = await $.session.root()
    } catch {
      root = ''
    }
    await update($, project, () => root)
    if (root) {
      const stored = await $.store.get(storeKey(root))
      await update($, board, () => toBoard(stored))
    }

    try {
      await $.command.register({
        name: 'appunti',
        description: 'Apre il pannello con appunti e to do del progetto',
      })
    } catch {}
    try {
      await $.command.register({
        name: 'nota',
        description: 'Aggiunge un appunto al progetto',
        argumentHint: '[testo]',
      })
    } catch {}
    try {
      await $.command.register({
        name: 'todo',
        description: 'Aggiunge una voce alla lista to do del progetto',
        argumentHint: '[testo]',
      })
    } catch {}

    void openPane($, false)

    return next(e)
  })

  on('command.run', { command: 'appunti' }, async $ => {
    const opened = await openPane($, true)
    if (opened.isPlaced) return { text: 'Pannello appunti aperto.' }

    // Dove il pannello non può essere mostrato, appunti e to do vanno in chat.
    const b = await read($, board)
    return {
      text:
        `Il pannello non può essere mostrato qui. Motivo dato da Claude Code: ${opened.reason}\n\n` +
        asText(b),
    }
  })

  on('command.run', { command: 'nota' }, async ($, e) => {
    if (await addNote($, e.args)) {
      await openPane($, false)
      return { text: 'Appunto salvato nel pannello.' }
    }
    await openPane($, true)
    return { text: 'Scrivi l’appunto nel pannello, oppure: /nota testo' }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    if (await addTodo($, e.args)) {
      await openPane($, false)
      return { text: 'Voce aggiunta alla lista to do.' }
    }
    await openPane($, true)
    return { text: 'Scrivi la voce nel pannello, oppure: /todo testo' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const root = await read($, project)
    const last = await read($, removed)
    const draft = await read($, drafts)

    const notes = [...b.notes].sort((x, y) => y.at - x.at)
    const open = b.todos.filter(t => !t.done).sort((x, y) => x.at - y.at)
    const done = b.todos.filter(t => t.done).sort((x, y) => x.at - y.at)

    // Il campo di testo esiste dove la superficie lo disegna (non su mobile).
    // I due campi hanno la stessa altezza e occupano tutta la larghezza.
    const field = (key: 'nuova-nota' | 'nuovo-todo', placeholder: string) => {
      if (e.surface === 'mobile') return null
      const { Input } = $.ui.resolve(e)
      const isNote = key === 'nuova-nota'
      return (
        <Box width="100%">
        <Input
          key={key}
          placeholder={placeholder}
          rows={FIELD_ROWS}
          value={isNote ? draft.note : draft.todo}
          submitLabel="aggiungi"
          onInput={value =>
            void update($, drafts, d => (isNote ? { ...d, note: value } : { ...d, todo: value }))
          }
          onSubmit={async value => {
            const added = isNote ? await addNote($, value) : await addTodo($, value)
            if (added) {
              await update($, drafts, d => (isNote ? { ...d, note: '' } : { ...d, todo: '' }))
            }
          }}
        />
        </Box>
      )
    }

    const undoLabel = last
      ? last.notes.length + last.todos.length === 1
        ? 'Eliminato 1 elemento'
        : `Eliminati ${last.notes.length + last.todos.length} elementi`
      : ''

    return (
      <Box flexDirection="column" gap={1}>
        {root ? <Text dimColor>Progetto: {folderName(root)}</Text> : null}

        {last ? (
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Text dimColor>{undoLabel}</Text>
            <Button key="annulla" label="Annulla" onPress={() => undo($)} />
          </Box>
        ) : null}

        <Box flexDirection="column">
          <Text bold>Appunti ({notes.length})</Text>
          {field('nuova-nota', 'Nuovo appunto, premi Invio')}
          {notes.length === 0 ? <Text dimColor>Nessun appunto.</Text> : null}
          {notes.map(n => (
            <Box key={`n-${n.id}`} flexDirection="row" justifyContent="space-between" gap={1}>
              <Box flexDirection="column" flexShrink={1}>
                <Text dimColor>{when(n.at)}</Text>
                <Text wrap="wrap">{n.text}</Text>
              </Box>
              <Button
                key={`del-n-${n.id}`}
                plain
                dimColor
                label="✕"
                onPress={() => remove($, { notes: [n], todos: [] })}
              />
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>
            To do ({open.length} da fare{done.length ? `, ${done.length} fatte` : ''})
          </Text>
          {field('nuovo-todo', 'Nuova cosa da fare, premi Invio')}
          {b.todos.length === 0 ? <Text dimColor>Nessuna voce.</Text> : null}
          {[...open, ...done].map(t => (
            <Box key={`t-${t.id}`} flexDirection="row" justifyContent="space-between" gap={1}>
              <Button
                key={`spunta-${t.id}`}
                plain
                onPress={() =>
                  change($, bb => ({
                    ...bb,
                    todos: bb.todos.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  }))
                }
              >
                {t.done ? '☑ ' : '☐ '}
                <Text strikethrough={t.done} dimColor={t.done}>
                  {t.text}
                </Text>
              </Button>
              <Button
                key={`del-t-${t.id}`}
                plain
                dimColor
                label="✕"
                onPress={() => remove($, { notes: [], todos: [t] })}
              />
            </Box>
          ))}
          {done.length > 0 ? (
            <Button
              key="togli-fatte"
              label={`Togli le fatte (${done.length})`}
              onPress={() => remove($, { notes: [], todos: done })}
            />
          ) : null}
        </Box>

        {e.surface === 'mobile' ? (
          <Text dimColor>Dal telefono aggiungi con /nota testo e /todo testo.</Text>
        ) : null}
      </Box>
    )
  })
}
