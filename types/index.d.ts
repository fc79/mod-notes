export type Note = { id: string; text: string; at: number }
export type Todo = { id: string; text: string; done: boolean; at: number }
export type Board = { notes: Note[]; todos: Todo[] }
export type Removed = { notes: Note[]; todos: Todo[] }
export type Drafts = { note: string; todo: string }
export type Collapsed = { todo: boolean; note: boolean }
// The item being edited, with the text typed so far.
export type Editing = { kind: 'todo' | 'note'; id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'notes': {
      board: Shaped<Board>
      project: string
      removed: Removed | null
      drafts: Drafts
      collapsed: Collapsed
      editing: Editing | null
    }
  }
}
