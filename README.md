# notes

A Claude Code mod that adds a side panel with **notes** and a **to-do list** for the project you are working on. Notes and to-dos are saved per project folder, on your computer, and come back when you open a new session in the same folder.

The panel's interface is in Italian ("Appunti" = notes, "To do" = to-do list).

## Features

- **To do**: type in the field and press Enter (or **+**) to add an item. Click an item to tick it; done items move to the bottom. **Elimina completati** ("delete completed") removes all done items at once.
- **Appunti** (notes): type in the field and press Enter (or **+**). Each note shows its date and time, newest first.
- **✕** deletes an item; **Annulla** ("undo") brings back the last deletion. It appears in the title row of the section the deletion came from.
- **Collapse and expand**: click the triangle next to a section title to collapse it (▸, only the title stays) or expand it (▾). The choice is saved.
- **Hide and show**: `/notes` hides or shows the panel; the panel's ✕ also hides it. A hidden panel stays hidden in later sessions until you run `/notes` again. The mod stays loaded: `/nota` and `/todo` keep saving while the panel is hidden.
- Where the panel cannot be shown (for example a session with no surface), `/notes` prints the notes and to-dos as text in the conversation.

## Commands

| Command | What it does |
| --- | --- |
| `/notes` | Shows or hides the panel |
| `/nota text` | Adds a note |
| `/todo text` | Adds a to-do item |

On the mobile app, which has no text fields in panels, add items with `/nota` and `/todo`.

## Install

At the prompt of a terminal session:

```
/plugin install notes --marketplace fc79/mod-notes
```

From a shell:

```
claude plugin install notes --marketplace fc79/mod-notes
```

Answer `y` to add the marketplace and pick the scope (user).

In the desktop app, where `/plugin` is not available: press **+** next to the prompt box, then **Plugins**, **Add marketplace** with `fc79/mod-notes`, then **Add plugin**.

## Update

```
claude plugin update notes
```

Then start a new session.

## Where data is stored

In Claude Code's per-plugin store on your computer (`~/.claude/plugins/store/`), one entry per project folder. Nothing is sent anywhere else.

## Notes on the look

The section boxes use the same border colour as the desktop app's own cards in the dark theme (`#222222`). The margin between the panel edge and the boxes is set by the app and cannot be changed by a mod.
