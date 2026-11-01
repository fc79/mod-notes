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
  mock.store(on, stored)
  mock.clock(on, { now: Date.UTC(2026, 10, 1, 10, 30) })
  on('session.root', () => ({ value: ROOT }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () =>
    notPlaced ? { value: { isPlaced: false, reason: notPlaced } } : { value: { isPlaced: true } },
  )
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`appunti e to do si aggiungono, si spuntano, si eliminano e si recuperano (${surface})`, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Nessun appunto/ }))?.text).toBe('Nessun appunto.')

    await ui.input({ key: 'nuova-nota', text: 'Il PID oscilla con onda al traverso' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^Appunti \(/ }))?.text).toBe('Appunti (1)')

    await ui.input({ key: 'nuovo-todo', text: 'Tarare il guadagno' })
    const row = (await ui.findAll({ type: 'Button' })).find(b => /Tarare/.test(b.text))
    expect(row?.text).toContain('☐')

    await ui.press({ key: row?.key ?? '' })
    const ticked = (await ui.findAll({ type: 'Button' })).find(b => /Tarare/.test(b.text))
    expect(ticked?.text).toContain('☑')
    expect(await ui.find({ key: 'togli-fatte' })).toBeDefined()

    const del = (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith('del-n-'))
    await ui.press({ key: del?.key ?? '' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeUndefined()

    await ui.press({ key: 'annulla' })
    expect(await ui.find({ type: 'Text', text: /oscilla/ })).toBeDefined()
    expect(await ui.find({ key: 'annulla' })).toBeUndefined()

    await ui.press({ key: 'togli-fatte' })
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
    expect((await ui.find({ type: 'Text', text: /^Progetto/ }))?.text).toBe('Progetto: autopilota')
    await ui.unmount()
  }
})

test('su mobile niente campo di testo: si aggiunge con /nota e /todo', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'mobile', isInteractive: true })

  const nota = await $.command.run({ command: 'nota', args: 'Controllare la pompa', ...FROM_PHONE })
  expect(nota.text).toBe('Appunto salvato nel pannello.')
  const todo = await $.command.run({ command: 'todo', args: 'Cambiare il fusibile', ...FROM_PHONE })
  expect(todo.text).toBe('Voce aggiunta alla lista to do.')
  const vuoto = await $.command.run({ command: 'nota', args: '   ', ...FROM_PHONE })
  expect(vuoto.text).toContain('/nota testo')

  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /pompa/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).some(b => /fusibile/.test(b.text))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /Dal telefono/ })).toBeDefined()
  await ui.unmount()
})

test('un salvataggio rovinato non blocca il pannello', async ($, on) => {
  engine(on, { [`board:${ROOT}`]: { notes: [{ testo: 'forma vecchia' }], todos: 'x' } })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Nessun appunto/ }))?.text).toBe('Nessun appunto.')
  expect((await ui.find({ type: 'Text', text: /Nessuna voce/ }))?.text).toBe('Nessuna voce.')
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
  expect(nota?.props.placeholder).toBe('Nuovo appunto, premi Invio')
  expect(todo?.props.placeholder).toBe('Nuova cosa da fare, premi Invio')
  await ui.unmount()
})
