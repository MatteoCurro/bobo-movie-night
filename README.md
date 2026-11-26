# Bobo Movie Night

Applicazione web per esplorare film e serie TV. Il frontend è statico; catalogo, indici e selezioni editoriali sono generati periodicamente da processi di sincronizzazione.

## Architettura

- **Frontend:** HTML, CSS e JavaScript senza framework di runtime.
- **Catalogo:** documenti JSON versionati in `data/`; indici per episodi, persone, crediti, premi e suggerimenti.
- **Sincronizzazione:** script Python in `scripts/`, con aggiornamenti incrementali e conservazione dei dati precedenti.
- **Account:** servizio PHP separato in `backend/`, distribuito indipendentemente dal frontend.
- **Distribuzione:** workflow in `.github/workflows/`; i file pubblicabili vengono selezionati nella directory temporanea `_site/`.

## Organizzazione

| Percorso | Contenuto |
| --- | --- |
| `index.html`, `discover.html`, `watch.html` | Navigazione e schede dei titoli |
| `person.html`, `director.html`, `awards.html` | Persone, registi e riconoscimenti |
| `bobo-*.js`, `bobo-*.css` | Componenti dell'interfaccia |
| `data/` | Catalogo e indici destinati al client |
| `scripts/` | Acquisizione, normalizzazione e generazione dei dati |
| `backend/` | Servizio account, non incluso nel pacchetto statico |
| `tests/` | Test di regressione e verifiche di integrazione |

## Verifiche e rilascio

I controlli sono eseguiti tramite GitHub Actions. Per una verifica locale di alcuni componenti:

```bash
python3 tests/cinema.py
python3 tests/story-connections.py
node tests/watch-dossier.cjs
```

Il workflow produce un sito statico e un artefatto di distribuzione contenente solo file necessari al frontend. Il controllo `scripts/audit_distribution.py` verifica i file tracciati e il contenuto del pacchetto.

## Configurazione e sicurezza

Le credenziali sono gestite esclusivamente nell'ambiente di esecuzione o sul server. Nessun file di configurazione locale, stato degli utenti o materiale di accesso deve essere versionato o distribuito con il frontend. Le integrazioni opzionali mantengono i dati già disponibili in caso di indisponibilità della sorgente.

## Fonti e attribuzioni

Metadati, immagini e dati editoriali possono provenire da fornitori differenti. Le attribuzioni applicabili sono conservate nelle rispettive informazioni di progetto e nella pagina `informazioni.html`. I collegamenti a servizi esterni non implicano affiliazione o disponibilità garantita dei contenuti.
