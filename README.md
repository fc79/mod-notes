# notes

Una mod per Claude Code che aggiunge un pannello laterale con gli **appunti** e la **lista to do** del progetto su cui stai lavorando. Appunti e lista sono salvati per ogni cartella di progetto, sul tuo computer, e si ricaricano quando riapri una sessione nella stessa cartella.

## Cosa fa

- **Appunti**: scrivi nel campo e premi Invio o **aggiungi**; ogni appunto ha data e ora, i più recenti in alto.
- **To do**: aggiungi una voce con Invio o **aggiungi**, la spunti con un clic, le voci fatte vanno in fondo; "Elimina completati" le rimuove tutte insieme.
- **✕** elimina una voce; **Annulla** recupera l'ultima eliminazione.
- Comandi: `/notes` mostra o nasconde il pannello, `/nota testo` aggiunge un appunto, `/todo testo` aggiunge una voce. Sull'app mobile, che non ha campi di testo, si usano i comandi.
- Dove il pannello non può essere mostrato, `/notes` riporta appunti e to do come testo nella conversazione.
- Clicca sul titolo di un riquadro (To do o Appunti) per compattarlo (▸, resta solo il titolo) o estenderlo (▾). La scelta resta salvata.
- Se nascondi il pannello (con `/notes` o con la X), resta nascosto anche nelle sessioni successive finché non lo riapri con `/notes`. La mod resta caricata: `/nota` e `/todo` continuano a salvare.

## Installazione

Al prompt di una sessione nel terminale:

```
/plugin install notes --marketplace fc79/mod-notes
```

Da una shell:

```
claude plugin install notes --marketplace fc79/mod-notes
```

Poi rispondi `y` per aggiungere il marketplace e scegli l'ambito (utente).

Nell'app desktop, dove `/plugin` non è disponibile: premi **+** accanto alla casella del prompt, poi **Plugins**, **Add marketplace** con `fc79/mod-notes`, poi **Add plugin**.
