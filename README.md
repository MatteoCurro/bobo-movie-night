# Bobo Movie Night

Sito statico Bobo, con **catalogo e aggiornamenti autonomi**. Il primo archivio è stato importato da CasaFlix; non viene più effettuato alcun download dalla sua repository. Metadati incrementali e arricchimenti sono gestiti dal progetto Bobo.

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

`scripts/build_discovery.py` produce `data/discovery.json` insieme all'aggiornamento autonomo, incrociando i risultati TMDB con **soli ID realmente presenti nel catalogo Bobo**. Se configurato, mostra i trend della settimana TMDB e selezioni di titoli **recenti per data di uscita originale** disponibili in abbonamento in Italia su Netflix, Prime Video, Disney+ e Apple TV+.

Per abilitare gli aggiornamenti autentici, aggiungere una sola volta il segreto GitHub Actions:

1. [Repository → Settings → Secrets and variables → Actions](https://github.com/MatteoCurro/bobo-movie-night/settings/secrets/actions).
2. **New repository secret**: `TMDB_READ_ACCESS_TOKEN`.
3. Valore: il token **API Read Access Token** ottenuto da [TMDB → Settings → API](https://www.themoviedb.org/settings/api).
4. Eseguire manualmente [Bobo · Catalogo autonomo](https://github.com/MatteoCurro/bobo-movie-night/actions/workflows/sync-upstream.yml), oppure attendere il normale aggiornamento programmato.

Il segreto non viene scritto nei file web. **Senza token il catalogo esistente rimane interamente utilizzabile, ma non possono essere scoperti nuovi titoli direttamente da TMDB**; nelle esecuzioni compare un avviso esplicito. L'indice Streamingfilter resta facoltativo e distinto dal catalogo. Il feed registra **disponibilità per territorio Italia**, non la data effettiva di aggiunta sulle piattaforme. Queste categorie non modificano la provenienza o i diritti dei flussi video esterni.

## Catalogo autonomo e indici estendibili

- **Archivio centrale**: `data/movies.json` e `data/tv.json`, compatibili con il frontend corrente; ID TMDB come chiave primaria. Il sync non riscrive automaticamente metadati esistenti con valori vuoti.
- **Storia di catalogo**: `data/catalog-ledger.json` registra la prima/ultima volta in cui un ID è stato osservato, senza dipendere dalla presenza attuale nel feed.
- **Locandine**: `data/poster-index.json` associa tipo + ID alla locandina, utile anche al backend Gandi.
- **Arricchimenti**: `data/enrichment.json` contiene i fatti compatti sui provider italiani, con `source` e `observed_at` per ciascun gruppo.
- **Episodi**: `data/episodes/<tmdb_id>.json` contiene i nomi completi, le immagini e le stagioni già esaminate di una singola serie. Il frontend scarica soltanto il file della serie aperta, non tutti gli episodi delle altre serie; se manca la foto dell'episodio usa una piccola locandina della serie.
- **Backfill**: ogni sincronizzazione esamina fino a 80 serie dall'intero archivio (non soltanto dai trend), con massimo 140 richieste per le singole stagioni. Una quota del lavoro completa le stagioni rimaste incomplete; gli indici già acquisiti vengono preservati e i dati disponibili vengono rinnovati periodicamente.
- **Diagnostica**: `data/catalog-status.json` registra le acquisizioni riuscite; il workflow mantiene i file precedenti se la fonte è irraggiungibile.

Non si tratta di un database relazionale: sono piccoli indici JSON versionati. Il **catalogo base** è aggiornato per ID dai feed TMDB; l'**arricchimento episodico** scorre invece progressivamente tutte le serie già archiviate. Non è una risincronizzazione integrale dei dati storici a ogni esecuzione. I provider indicano la disponibilità segnalata in Italia, non la provenienza del video né la data di ingresso nel servizio.

## Newsletter e amministrazione

Da **Impostazioni account**, soltanto l'utente con ruolo `admin` vede **Inviami la newsletter di prova**. Il server verifica la sessione e invia la copia esclusivamente all'email verificata dell'admin, senza consumare il turno di venerdì. Nel club gli account verificati ricevono la newsletter per impostazione iniziale, ma `Newsletter → Salva preferenza` e il link in ogni email permettono la disiscrizione immediata. Le disiscrizioni già esplicite restano rispettate. Il sistema di invio programmato richiede `BOBO_NEWSLETTER_SECRET` configurato sia su GitHub sia su Gandi.

## Costi GitHub Actions

Il workflow usa runner GitHub standard su repository pubblico: il calcolo resta gratuito e non consuma la quota dei runner privati. Sono previsti aggiornamenti alle 06:15 e 18:15 UTC, oltre ai push su main. La conservazione degli artifact `bobo-gandi-static` è limitata a 7 giorni; lo storage ha una quota separata dai minuti.

## Aggiornamento e deploy

La GitHub Action `.github/workflows/sync-upstream.yml` (nome storico del file) esegue `scripts/sync_tmdb_catalog.py`: interroga le API TMDB, conserva tutti i titoli esistenti e aggiunge/aggiorna solo gli ID osservati. Il catalogo non viene mai eliminato quando un provider fallisce. Frequenza prevista: ogni 12 ore. Il deploy avviene su GitHub Pages.

**Privacy e Gandi**: GitHub Pages rimane pubblico finché non viene disattivato. La protezione con password server-side su Gandi non è ancora attiva: sono disponibili la [guida e il file di configurazione](deploy/gandi/README.md) e il pacchetto `bobo-gandi-static` scaricabile come artifact del workflow. Pubblicare `.htaccess` e `.htpasswd` su Gandi e disattivare GitHub Pages dopo la verifica del controllo accessi.

I file specifici **`bobo-ui.js`**, **`bobo-ui.css`**, **`watch.html`**, **`bobo-watch.js`** e **`bobo-watch.css`** rimangono nel repository e non vengono sovrascritti da fonti esterne.

La selezione VidSrc non è validata come funzionante; non esiste un fallback automatico tra provider. L'app non può rilevare gli errori visualizzati internamente a un iframe di un altro dominio.

## Fonti

Metadati e immagini: [TMDB](https://www.themoviedb.org/). L'archivio iniziale è stato derivato da CasaFlix; successivamente è gestito da Bobo. Questo progetto non è approvato o certificato da TMDB.

Player: servizi esterni; disponibilità e condizioni di accesso dipendono dai rispettivi fornitori.
