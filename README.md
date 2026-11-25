# Bobo Movie Night

Sito statico basato sul catalogo del progetto [CasaFlix](https://github.com/scageto/CasaFlix).

**Sito pubblicato:** https://movie.curromatteo.it/

## Funzioni

- **Home unificata**: film e serie TV nello stesso catalogo, un'unica ricerca e filtri facoltativi per tipologia, genere e anno.
- Anteprime e locandine con tag **Film** / **Serie TV**; per le serie sono indicati il numero di stagioni e gli episodi disponibili.
- Sinossi, generi, valutazioni e sezioni tematiche.
- **Scheda dedicata per ogni film e serie TV**, con URL condivisibile:
  `watch.html?type=movie&id=1368337` oppure `watch.html?type=tv&id=12345`.
- Riproduzione nella scheda tramite iframe, non nel popup di anteprima.
- Stagioni selezionabili tramite pulsanti, griglia episodi e navigazione precedente/successivo anche fra stagioni.
- **Vix predefinito**, VidSrc opzionale e sperimentale solo nelle impostazioni.
- `referrerpolicy="origin"` per l'incorporamento del player; l'apertura in nuova scheda continua a usare `noopener,noreferrer`.
- Nessuna richiesta TMDB dal browser: la sinossi e le informazioni provengono dai file JSON sincronizzati.

## Friends Edition e player

- Visual identity dark/Y2K, typography, Easter egg di montagna/arrampicata/Faiva, watermark discreto.
- Domanda iniziale di benvenuto: **solo filtro client-side**, non una protezione delle risorse pubbliche.
- Ricerca combinata e filtri spostati sopra la home.
- Player Vix ricaricato con un **nuovo iframe** a ogni episodio: il test `node tests/autonext.cjs` controlla il passaggio effettivo tra URL/iframe e il limite di cinque episodi.
- "Schermo intero Bobo" applicato al contenitore del player per restare aperto quando cambia l'iframe. Il fullscreen nativo interno a Vix è fuori dal controllo della pagina; Safari su iPhone può usare la modalità cinema CSS.
- Riproduzione consecutiva attiva di default, massimo cinque episodi, personalizzabile nelle impostazioni.

## Novità streaming italiane senza token

La sezione **Nuovi sulle piattaforme in Italia** viene aggiornata automaticamente
da `scripts/build_streaming_feed.py` tramite l'indice pubblico
[Streamingfilter](https://streamingfilter.com/it/novita), con massimo due accessi
al giorno attraverso GitHub Actions. Lo script confronta nome, anno e tipo di opera
e pubblica solo corrispondenze univoche con i film e le serie presenti in Bobo:
**nessuna API key e nessun costo**. La fonte viene attribuita nella homepage.

La sezione viene nascosta se il sito esterno non risponde, cambia struttura o
non fornisce corrispondenze valide. Non viene attribuito un titolo a una
piattaforma specifica senza dati verificati.

Il feed opzionale TMDB/JustWatch descritto sotto consente in aggiunta
la suddivisione per Netflix, Prime Video, Disney+ e Apple TV+, ma **non è
necessario per il funzionamento di Bobo**: la home è già aggiornata senza di esso.

## Selezioni streaming Italia (TMDB / JustWatch)

`scripts/build_discovery.py` produce `data/discovery.json` insieme all'aggiornamento CasaFlix, incrociando i risultati TMDB con **soli ID realmente presenti nel catalogo Bobo**. Se configurato, mostra i trend della settimana TMDB e selezioni di titoli **recenti per data di uscita originale** disponibili in abbonamento in Italia su Netflix, Prime Video, Disney+ e Apple TV+.

Per abilitare gli aggiornamenti autentici, aggiungere una sola volta il segreto GitHub Actions:

1. [Repository → Settings → Secrets and variables → Actions](https://github.com/MatteoCurro/bobo-movie-night/settings/secrets/actions).
2. **New repository secret**: `TMDB_READ_ACCESS_TOKEN`.
3. Valore: il token **API Read Access Token** ottenuto da [TMDB → Settings → API](https://www.themoviedb.org/settings/api).
4. Eseguire manualmente [Sync upstream CasaFlix](https://github.com/MatteoCurro/bobo-movie-night/actions/workflows/sync-upstream.yml), oppure attendere il normale aggiornamento programmato.

Il segreto non viene scritto nei file web; senza il token la home mantiene sia le categorie editoriali locali sia il feed Streamingfilter delle novità italiane, senza inventare disponibilità specifiche per piattaforma. Il feed registra **disponibilità per territorio Italia**, non la data effettiva di aggiunta sulle piattaforme. Queste categorie non modificano la provenienza o i diritti dei flussi video esterni.

## Costi GitHub Actions

Il workflow usa runner GitHub standard su repository pubblico: il calcolo resta gratuito e non consuma la quota dei runner privati. Sono previsti aggiornamenti alle 06:15 e 18:15 UTC, oltre ai push su main. La conservazione degli artifact `bobo-gandi-static` è limitata a 7 giorni; lo storage ha una quota separata dai minuti.

## Aggiornamento e deploy

La GitHub Action `.github/workflows/sync-upstream.yml` recupera periodicamente HTML e cataloghi dall'originale e riapplica le personalizzazioni. Frequenza prevista: ogni 12 ore. Il deploy attuale avviene su GitHub Pages in automatico.

**Privacy e Gandi**: GitHub Pages rimane pubblico finché non viene disattivato. La protezione con password server-side su Gandi non è ancora attiva: sono disponibili la [guida e il file di configurazione](deploy/gandi/README.md) e il pacchetto `bobo-gandi-static` scaricabile come artifact del workflow. Pubblicare `.htaccess` e `.htpasswd` su Gandi e disattivare GitHub Pages dopo la verifica del controllo accessi.

I file specifici **`bobo-ui.js`**, **`bobo-ui.css`**, **`watch.html`**, **`bobo-watch.js`** e **`bobo-watch.css`** rimangono nel repository e non vengono sovrascritti dall'upstream.

La selezione VidSrc non è validata come funzionante; non esiste un fallback automatico tra provider. L'app non può rilevare gli errori visualizzati internamente a un iframe di un altro dominio.

## Fonti

Metadati e immagini: [TMDB](https://www.themoviedb.org/), tramite il catalogo sincronizzato da CasaFlix. Questo progetto non è approvato o certificato da TMDB.

Player: servizi esterni; disponibilità e condizioni di accesso dipendono dai rispettivi fornitori.
