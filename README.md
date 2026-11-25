# Bobo Movie Night

Sito statico basato sul catalogo del progetto [CasaFlix](https://github.com/scageto/CasaFlix).

**Sito pubblicato:** https://matteocurro.github.io/bobo-movie-night/

## Funzioni

- Catalogo con anteprime, sinossi, generi, valutazioni e sezioni tematiche.
- **Scheda dedicata per ogni film e serie TV**, con URL condivisibile:
  `watch.html?type=movie&id=1368337` oppure `watch.html?type=tv&id=12345`.
- Riproduzione nella scheda tramite iframe, non nel popup di anteprima.
- Stagioni selezionabili tramite pulsanti, griglia episodi e navigazione precedente/successivo anche fra stagioni.
- **Vix predefinito**, VidSrc opzionale e sperimentale solo nelle impostazioni.
- `referrerpolicy="origin"` per l'incorporamento del player; l'apertura in nuova scheda continua a usare `noopener,noreferrer`.
- Nessuna richiesta TMDB dal browser: la sinossi e le informazioni provengono dai file JSON sincronizzati.

## Aggiornamento e deploy

La GitHub Action `.github/workflows/sync-upstream.yml` recupera periodicamente HTML e cataloghi dall'originale e riapplica le personalizzazioni. Frequenza prevista: ogni 12 ore. Il deploy avviene su GitHub Pages in automatico.

I file specifici **`bobo-ui.js`**, **`bobo-ui.css`**, **`watch.html`**, **`bobo-watch.js`** e **`bobo-watch.css`** rimangono nel repository e non vengono sovrascritti dall'upstream.

La selezione VidSrc non è validata come funzionante; non esiste un fallback automatico tra provider. L'app non può rilevare gli errori visualizzati internamente a un iframe di un altro dominio.

## Fonti

Metadati e immagini: [TMDB](https://www.themoviedb.org/), tramite il catalogo sincronizzato da CasaFlix. Questo progetto non è approvato o certificato da TMDB.

Player: servizi esterni; disponibilità e condizioni di accesso dipendono dai rispettivi fornitori.
