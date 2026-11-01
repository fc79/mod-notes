# appunti-progetto

Una mod per Claude Code che aggiunge un pannello laterale con gli **appunti** e la **lista to do** del progetto su cui stai lavorando. Appunti e lista sono salvati per ogni cartella di progetto, sul tuo computer, e si ricaricano quando riapri una sessione nella stessa cartella.

## Cosa fa

- **Appunti**: scrivi nel campo e premi Invio; ogni appunto ha data e ora, i più recenti in alto.
- **To do**: aggiungi una voce con Invio, la spunti con un clic, le voci fatte vanno in fondo; "Togli le fatte" le rimuove tutte insieme.
- **✕** elimina una voce; **Annulla** recupera l'ultima eliminazione.
- Comandi: `/appunti` apre il pannello, `/nota testo` aggiunge un appunto, `/todo testo` aggiunge una voce. Sull'app mobile, che non ha campi di testo, si usano i comandi.
- Dove il pannello non può essere mostrato, `/appunti` riporta appunti e to do come testo nella conversazione.

## Installazione

Al prompt di una sessione nel terminale:

```
/plugin install appunti-progetto --marketplace fc79/mod-notes
```

Da una shell:

```
claude plugin install appunti-progetto --marketplace fc79/mod-notes
```

Poi rispondi `y` per aggiungere il marketplace e scegli l'ambito (utente).

Nell'app desktop, dove `/plugin` non è disponibile: premi **+** accanto alla casella del prompt, poi **Plugins**, **Add marketplace** con `fc79/mod-notes`, poi **Add plugin**.
