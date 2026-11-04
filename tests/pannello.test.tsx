import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ROOT = '/Users/prova/autopilota'
const FROM_PHONE = {
  origin: { kind: 'bridge' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const PANE = {
  plugin: 'notes',
  component: 'Pane',
  requestId: 'appunti',
  props: {
    title: 'Appunti',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// Quello che il motore farebbe sotto la mod: nessuna superficie reale.
function engine(on: On, stored: Record<string, unknown> = {}, notPlaced?: string) {
  const panes = new Set<string>()
  mock.store(on, stored)
  mock.clock(on, { now: Date.UTC(2026, 10, 1, 10, 30) })
  on('session.root', () => ({ value: ROOT }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    if (notPlaced) return { value: { isPlaced: false, reason: notPlaced } }
    panes.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return panes
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`appunti e to do si aggiungono, si spuntano, si eliminano e si recuperano (${surface})`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /No notes yet/ }))?.text).toBe('No notes yet.')

    await ui.input({ key: 'nuova-nota', text: 'Il PID oscilla con onda al traverso' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^Notes ·/ }))?.text).toBe('Notes · 1')

    await ui.input({ key: 'nuovo-todo', text: 'Tarare il guadagno' })
    const row = (await ui.findAll({ type: 'Button' })).find(b => /Tarare/.test(b.text))
    expect(row?.text).toContain('☐')

    await ui.press({ key: row?.key ?? '' })
    const ticked = (await ui.findAll({ type: 'Button' })).find(b => /Tarare/.test(b.text))
    expect(ticked?.text).toContain('☑')
    expect(await ui.find({ key: 'elimina-completati' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^To do ·/ }))?.text).toBe('To do · 0 open')

    const del = (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith('del-n-'))
    await ui.press({ key: del?.key ?? '' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeUndefined()

    await ui.press({ key: 'annulla' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeDefined()
    expect(await ui.find({ key: 'annulla' })).toBeUndefined()

    await ui.press({ key: 'elimina-completati' })
    expect((await ui.findAll({ type: 'Button' })).find(b => /Tarare/.test(b.text))).toBeUndefined()

    await ui.unmount()
  })
}

test('quello salvato riappare in una nuova sessione, su ogni superficie', async ($, on) => {
  engine(on, {
    [`board:${ROOT}`]: {
      notes: [{ id: 'a', text: 'Vela nuova: ordinata', at: 1 }],
      todos: [{ id: 'b', text: 'Comprare la sonda', done: false, at: 2 }],
    },
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Vela nuova/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).some(b => /sonda/.test(b.text))).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^To do ·/ }))?.text).toBe('To do · 1 open')
    await ui.unmount()
  }
})

test('su mobile niente campo di testo: si aggiunge con /nota e /todo', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'mobile', isInteractive: true })

  const nota = await $.command.run({ command: 'note', args: 'Controllare la pompa', ...FROM_PHONE })
  expect(nota.text).toBe('Note saved to the panel.')
  const todo = await $.command.run({ command: 'todo', args: 'Cambiare il fusibile', ...FROM_PHONE })
  expect(todo.text).toBe('Item added to the to-do list.')
  const vuoto = await $.command.run({ command: 'note', args: '   ', ...FROM_PHONE })
  expect(vuoto.text).toContain('/note text')

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /pompa/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).some(b => /fusibile/.test(b.text))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /From your phone/ })).toBeDefined()
  await ui.unmount()
})

test('un salvataggio rovinato non blocca il pannello', async ($, on) => {
  engine(on, { [`board:${ROOT}`]: { notes: [{ testo: 'forma vecchia' }], todos: 'x' } })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No notes yet/ }))?.text).toBe('No notes yet.')
  expect((await ui.find({ type: 'Text', text: /Nothing to do/ }))?.text).toBe('Nothing to do.')
  await ui.unmount()
})

test('dove il pannello non si vede, /notes mostra il motivo e il contenuto in chat', async ($, on) => {
  engine(
    on,
    {
      [`board:${ROOT}`]: {
        notes: [{ id: 'a', text: 'Vela nuova: ordinata', at: 1 }],
        todos: [{ id: 'b', text: 'Comprare la sonda', done: true, at: 2 }],
      },
    },
    'the attached surfaces place no panes',
  )
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const out = await $.command.run({ command: 'notes', args: '', ...FROM_PHONE })
  expect(out.text).toContain('the attached surfaces place no panes')
  expect(out.text).toContain('Vela nuova: ordinata')
  expect(out.text).toContain('☑ Comprare la sonda')
})

test('i due campi hanno la stessa altezza e dicono di premere Invio', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const nota = await ui.find({ key: 'nuova-nota' })
  const todo = await ui.find({ key: 'nuovo-todo' })
  expect(nota?.props.rows).toBe(3)
  expect(todo?.props.rows).toBe(nota?.props.rows)
  expect(nota?.props.placeholder).toBe('New note, press Enter')
  expect(todo?.props.placeholder).toBe('New to-do, press Enter')
  await ui.unmount()
})

test('ogni sezione è un riquadro, to do sopra, campo sotto la lista', async ($, on) => {
  engine(on, {
    [`board:${ROOT}`]: { notes: [], todos: [{ id: 'b', text: 'Comprare la sonda', done: false, at: 2 }] },
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const titles = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(titles.findIndex(t => t.startsWith('To do'))).toBeLessThan(
    titles.findIndex(t => t.startsWith('Notes')),
  )
  const boxes = (await ui.findAll({ type: 'Box' })).filter(x => x.props.borderStyle === 'round')
  expect(boxes.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /^Progetto/ })).toBeUndefined()

  // Annulla compare nella sezione da cui si è eliminato.
  const del = (await ui.findAll({ type: 'Button' })).find(x => x.key?.startsWith('del-t-'))
  await ui.press({ key: del?.key ?? '' })
  expect(await ui.find({ key: 'annulla' })).toBeDefined()
  await ui.press({ key: 'annulla' })
  expect((await ui.findAll({ type: 'Button' })).some(x => /sonda/.test(x.text))).toBe(true)
  await ui.unmount()
})

// I Box del pannello di sempre (contenitore, riquadri, righe), contati sul disegno senza nulla sotto.
const BOXES = 13

const CMD = { args: '', ...FROM_PHONE }

test('/notes nasconde e riapre il pannello; nascosto resta nascosto alla sessione dopo', async ($, on) => {
  const stored: Record<string, unknown> = {}
  const panes = engine(on, stored)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(panes.has('appunti')).toBe(true)

  const hide = await $.command.run({ command: 'notes', ...CMD })
  expect(hide.text).toContain('hidden')
  expect(panes.has('appunti')).toBe(false)

  // Con il pannello nascosto /todo salva senza riaprirlo.
  await $.command.run({ command: 'todo', ...CMD, args: 'Provare il filtro' })
  expect(panes.has('appunti')).toBe(false)

  // Nuova sessione: non si riapre da solo.
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(panes.has('appunti')).toBe(false)

  const show = await $.command.run({ command: 'notes', ...CMD })
  expect(show.text).toBe('Notes panel open.')
  expect(panes.has('appunti')).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Button' })).some(b => /filtro/.test(b.text))).toBe(true)
  await ui.unmount()
})

test('i riquadri si compattano e si estendono, e restano così nella sessione dopo', async ($, on) => {
  const stored: Record<string, unknown> = {
    [`board:${ROOT}`]: {
      notes: [{ id: 'a', text: 'Vela nuova: ordinata', at: 1 }],
      todos: [{ id: 'b', text: 'Comprare la sonda', done: true, at: 2 }],
    },
  }
  engine(on, stored)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'sezione-todo' })
  expect((await ui.find({ key: 'sezione-todo' }))?.text).toBe('▸')
  expect((await ui.findAll({ type: 'Button' })).some(b => /sonda/.test(b.text))).toBe(false)
  expect(await ui.find({ key: 'nuovo-todo' })).toBeUndefined()
  expect(await ui.find({ key: 'elimina-completati' })).toBeUndefined()
  // L'altro riquadro resta esteso.
  expect(await ui.find({ type: 'Text', text: /Vela nuova/ })).toBeDefined()
  await ui.unmount()

  // Nuova sessione: To do è ancora compattato.
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'sezione-todo' }))?.text).toBe('▸')
  await ui.press({ key: 'sezione-todo' })
  expect((await ui.findAll({ type: 'Button' })).some(b => /sonda/.test(b.text))).toBe(true)
  await ui.unmount()
})

test('senza nulla sotto il pannello è quello di sempre: nessun elemento in più', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toEqual(['To do · 0 open', 'Nothing to do.', 'Notes · 0', 'No notes yet.'])
  expect((await ui.findAll({ type: 'Box' })).length).toBe(BOXES)
  await ui.unmount()
})

test('quello che un\'altra mod disegna sotto va dopo To do e Notes', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'Pane', requestId: 'appunti' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>Sezione di un'altra mod</Text>
      </Box>
    )
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toEqual([
    'To do · 0 open',
    'Nothing to do.',
    'Notes · 0',
    'No notes yet.',
    "Sezione di un'altra mod",
  ])
  await ui.unmount()
})

test('se sotto c\'è un albero che non disegna nulla, il pannello non cambia', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'Pane', requestId: 'appunti' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Box' })).length).toBe(BOXES)
  await ui.unmount()
})

test('se quello che sta sotto fallisce, notes si disegna lo stesso', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'Pane', requestId: 'appunti' }, () => {
    throw new Error('rotto')
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toEqual(['To do · 0 open', 'Nothing to do.', 'Notes · 0', 'No notes yet.'])
  await ui.unmount()
})
