import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Collapsed, Drafts, Note, Removed, Todo } from '../types'

const PANE = 'appunti'
const FIELD_ROWS = 3
const EMPTY: Board = { notes: [], todos: [] }

// Cambia l'etichetta se cambiano i campi: un valore salvato da una versione
// precedente viene letto come vuoto invece che con la forma sbagliata.
const board = atom({ plugin: 'notes', key: 'board' } as const, EMPTY, {
  shape: 'board-1',
})
const project = atom({ plugin: 'notes', key: 'project' } as const, '')
const removed = atom({ plugin: 'notes', key: 'removed' } as const, null)
const drafts = atom({ plugin: 'notes', key: 'drafts' } as const, {
  note: '',
  todo: '',
} as Drafts)

// Quali riquadri sono compattati: vale per tutti i progetti e resta tra le sessioni.
const OPEN_BOTH: Collapsed = { todo: false, note: false }
const collapsed = atom({ plugin: 'notes', key: 'collapsed' } as const, OPEN_BOTH)
const COLLAPSED_KEY = 'collapsed'

function toCollapsed(raw: unknown): Collapsed {
  if (!raw || typeof raw !== 'object') return OPEN_BOTH
  const c = raw as { todo?: unknown; note?: unknown }
  return { todo: c.todo === true, note: c.note === true }
}

async function toggleSection($: EngineInterface, which: keyof Collapsed) {
  const next = await update($, collapsed, c => ({ ...c, [which]: !c[which] }))
  await $.store.set(COLLAPSED_KEY, next)
}

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
  const lines = [`Notes (${notes.length})`]
  if (notes.length === 0) lines.push('  No notes yet.')
  for (const n of notes) lines.push(`  ${when(n.at)}  ${n.text}`)
  lines.push('', `To do (${open.length} open${done.length ? `, ${done.length} done` : ''})`)
  if (b.todos.length === 0) lines.push('  Nothing to do.')
  for (const t of [...open, ...done]) lines.push(`  ${t.done ? '☑' : '☐'} ${t.text}`)
  lines.push('', 'Add with /note text and /todo text.')
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

// "Nascosto" vale per tutti i progetti e sopravvive alle sessioni: chi chiude
// il pannello non se lo vede riaprire da solo alla sessione successiva.
const HIDDEN_KEY = 'hidden'

async function isHidden($: EngineInterface) {
  return (await $.store.get(HIDDEN_KEY)) === true
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

async function openPane($: EngineInterface, focus: boolean) {
  const root = await read($, project)
  const title = root ? `Notes · ${folderName(root)}` : 'Notes'
  return $.ui.open(focus ? { id: PANE, title, focus: true } : { id: PANE, title })
}

// Vero se l'albero disegna qualcosa: né vuoto, né solo contenitori senza figli.
// Ciò che sta sotto il pannello può essere nulla, e il motore non lo garantisce.
function drawsSomething(tree: unknown): boolean {
  if (typeof tree === 'string') return tree.length > 0
  if (typeof tree === 'number') return true
  if (Array.isArray(tree)) return tree.some(drawsSomething)
  if (!tree || typeof tree !== 'object') return false
  const node = tree as { type?: unknown; children?: unknown; props?: { children?: unknown } }
  if (typeof node.type !== 'string') return false
  // Box e Text valgono per ciò che contengono (i figli possono stare anche in props);
  // ogni altro elemento (Button, Input...) disegna.
  if (node.type === 'Box' || node.type === 'Text') {
    return drawsSomething(node.children) || drawsSomething(node.props?.children)
  }
  return true
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
    const folded = await $.store.get(COLLAPSED_KEY)
    await update($, collapsed, () => toCollapsed(folded))
    if (root) {
      const stored = await $.store.get(storeKey(root))
      await update($, board, () => toBoard(stored))
    }

    try {
      await $.command.register({
        name: 'notes',
        description: 'Show or hide the panel with the project notes and to-do list',
      })
    } catch (err) {
      $.ui.log(`notes: command not registered (${String(err)})`)
    }
    try {
      await $.command.register({
        name: 'note',
        description: 'Add a note to the project',
        argumentHint: '[text]',
      })
    } catch (err) {
      $.ui.log(`notes: command not registered (${String(err)})`)
    }
    try {
      await $.command.register({
        name: 'todo',
        description: 'Add an item to the project to-do list',
        argumentHint: '[text]',
      })
    } catch (err) {
      $.ui.log(`notes: command not registered (${String(err)})`)
    }

    if (!(await isHidden($))) void openPane($, false)

    return next(e)
  })

  // /notes mostra o nasconde il pannello; la mod resta caricata e /nota e /todo
  // continuano a salvare anche col pannello nascosto.
  on('command.run', { command: 'notes' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })
      return { text: 'Notes panel hidden. Show it again with /notes.' }
    }
    await $.store.set(HIDDEN_KEY, false)
    const opened = await openPane($, true)
    if (opened.isPlaced) return { text: 'Notes panel open.' }

    // Dove il pannello non può essere mostrato, appunti e to do vanno in chat.
    const b = await read($, board)
    return {
      text:
        `The panel cannot be shown here. Reason given by Claude Code: ${opened.reason}\n\n` +
        asText(b),
    }
  })

  // Chiuso con la X o con /notes: resta nascosto finché non si riapre con /notes.
  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && e.origin.kind !== 'unload') await $.store.set(HIDDEN_KEY, true)
    return result
  })

  on('command.run', { command: 'note' }, async ($, e) => {
    if (await addNote($, e.args)) {
      if (!(await isHidden($))) await openPane($, false)
      return { text: 'Note saved to the panel.' }
    }
    await openPane($, true)
    return { text: 'Type the note in the panel, or: /note text' }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    if (await addTodo($, e.args)) {
      if (!(await isHidden($))) await openPane($, false)
      return { text: 'Item added to the to-do list.' }
    }
    await openPane($, true)
    return { text: 'Type the item in the panel, or: /todo text' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const last = await read($, removed)
    const draft = await read($, drafts)
    const fold = await read($, collapsed)

    const notes = [...b.notes].sort((x, y) => y.at - x.at)
    const open = b.todos.filter(t => !t.done).sort((x, y) => x.at - y.at)
    const done = b.todos.filter(t => t.done).sort((x, y) => x.at - y.at)

    // "Annulla" compare nella riga del titolo della sezione da cui è stato
    // eliminato qualcosa: così niente spinge giù il resto del pannello.
    const undoIn: 'todo' | 'note' | null = !last
      ? null
      : last.todos.length > 0
        ? 'todo'
        : last.notes.length > 0
          ? 'note'
          : null
    const undoButton = <Button key="annulla" label="Undo" onPress={() => undo($)} />

    // Il campo di testo esiste dove la superficie lo disegna (non su mobile).
    // I due campi hanno la stessa altezza e occupano tutta la larghezza.
    const field = (key: 'nuova-nota' | 'nuovo-todo', placeholder: string) => {
      if (e.surface === 'mobile') return null
      const { Input } = $.ui.resolve(e)
      const isNote = key === 'nuova-nota'
      return (
        <Box width="100%" marginTop={1}>
          <Input
            key={key}
            placeholder={placeholder}
            rows={FIELD_ROWS}
            value={isNote ? draft.note : draft.todo}
            submitLabel="+"
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

    // Ogni sezione è un riquadro: titolo con i comandi a destra, lista, campo.
    // Ogni sezione è un riquadro come quelli dell'app: il titolo con il
    // triangolino la compatta (resta solo il titolo) o la estende.
    const section = (
      which: keyof Collapsed,
      title: string,
      actions: (JSX.Element | null)[],
      body: (JSX.Element | null)[],
      input: JSX.Element | null,
    ) => {
      const isFolded = fold[which]
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="#222222" paddingX={2} gap={1}>
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            {/* Il titolo è testo semplice, così parte dallo stesso punto dei titoli
                dell'app; il triangolino accanto compatta o estende il riquadro. */}
            <Box flexDirection="row">
              <Text>{title}</Text>
              <Button
                key={`sezione-${which}`}
                plain
                dimColor
                label={isFolded ? '▸' : '▾'}
                onPress={() => toggleSection($, which)}
              />
            </Box>
            {isFolded ? null : (
              <Box flexDirection="row" gap={2}>
                {actions}
              </Box>
            )}
          </Box>
          {isFolded ? null : (
            <Box flexDirection="column" gap={1}>
              {body}
            </Box>
          )}
          {isFolded ? null : input}
        </Box>
      )
    }

    const todoRows =
      b.todos.length === 0
        ? [<Text key="vuoto-t" dimColor>Nothing to do.</Text>]
        : [...open, ...done].map(t => (
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
          ))

    const noteRows =
      notes.length === 0
        ? [<Text key="vuoto-n" dimColor>No notes yet.</Text>]
        : notes.map(n => (
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
          ))

    // Altre mod possono aggiungere riquadri in fondo al pannello: quello che
    // disegnano sotto di noi va dopo i nostri. Se sotto non c'è nulla, o fallisce,
    // il pannello resta com'è.
    let below: unknown = null
    try {
      below = await next(e)
    } catch {
      below = null
    }

    // Il margine intorno ai riquadri lo decide l'app (il pannello taglia
    // quello che esce): un margine negativo qui fa sparire il bordo destro.
    return (
      <Box flexDirection="column" gap={1}>
        {section(
          'todo',
          `To do · ${open.length} open`,
          [
            undoIn === 'todo' ? undoButton : null,
            done.length > 0 ? (
              <Button
                key="elimina-completati"
                plain
                label="Clear completed"
                onPress={() => remove($, { notes: [], todos: done })}
              />
            ) : null,
          ],
          todoRows,
          field('nuovo-todo', 'New to-do, press Enter'),
        )}

        {section(
          'note',
          `Notes · ${notes.length}`,
          [undoIn === 'note' ? undoButton : null],
          noteRows,
          field('nuova-nota', 'New note, press Enter'),
        )}

        {drawsSomething(below) ? (below as JSX.Element) : null}

        {e.surface === 'mobile' ? (
          <Text dimColor>From your phone, add with /note text and /todo text.</Text>
        ) : null}
      </Box>
    )
  })
}
