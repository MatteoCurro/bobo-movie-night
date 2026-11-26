# Fonti cinematografiche incrementali

Le pagine caricano soltanto lo shard necessario dall'archivio cinematografico.
Nessuno scraping viene eseguito nel browser e non sono necessari segreti frontend.

## Premi Oscar

- Archivio storico: raccolta MIT già integrata, fino al 2023.
- Cerimonie recenti: importazione da [DLu/oscar_data](https://github.com/DLu/oscar_data),
  dataset derivato dall'Academy Awards Database, licenza BSD-2-Clause.
- [mfisher911/oscar-noms](https://github.com/mfisher911/oscar-noms)
  è stato valutato come parser annuale: non conserva il risultato
  vincitore/candidato e Wikipedia può bloccare richieste automatiche.
  Perciò è stata adottata una fonte con ID IMDb, non un join per titolo.

Lo snapshot viene verificato ogni 7 giorni. La risoluzione usa IMDb ID,
TMDB /find e TMDB ID, con un massimo di 140 richieste per sincronizzazione.
Se la fonte fallisce o non è ancora aggiornata, il catalogo non perde
i premi già registrati. L'anno è quello della cerimonia.

I termini di attribuzione sono nei file OSCAR-LICENSE.txt e
OSCAR-CURRENT-LICENSE.txt. Fonte ufficiale: https://awardsdatabase.oscars.org/

## IMDb e altri metadati

La risposta TMDB già usata per il cast contiene case di produzione,
paesi, lingue, titolo originale, budget e incassi: il builder li salva
senza ulteriori chiamate. La lingua italiana e le foto restano da TMDB.

[RaedAddala/Scraping-IMDB](https://github.com/RaedAddala/Scraping-IMDB)
pubblica CSV annuali con 98 colonne. Il nostro importatore consuma
fino a tre CSV per esecuzione soltanto per gli anni rappresentati dai
film Bobo già associati a un ID IMDb. Non scarica mai l'intera copia di
642 MB, non richiede Selenium/Edge e non esegue richieste dirette a IMDb.

La scheda utilizza rating, votanti, Metascore, dati economici con
valuta, professionisti della produzione, location, temi, certificazioni,
indicazioni per i genitori, date d'uscita e altri attributi, quando
effettivamente presenti. I dettagli di secondo livello sono collassati.

### Persistenza

- ID principale dei film: TMDB.
- ID secondario: IMDb, con corrispondenza verificata.
- Risultato: shard JSON esistenti in data/cinema/credits/.
- Origine, data acquisizione e altri dati di provenienza sono conservati.
- Refresh: ogni 30 giorni per anni recenti, 180 per anni storici;
  i titoli nuovi sono prioritari, senza riscansioni continue di anni
  non presenti nell'archivio originale.
- Nessun CSV originale è caricato nel repository o nel browser.
- Tutti gli errori esterni conservano i dati precedentemente acquisiti.

### Nota sulla distribuzione

Il codice dello scraper è MIT; il dataset IMDb resta soggetto ai termini
del fornitore. La repository GitHub di Bobo è pubblica anche se
l'interfaccia applicativa è protetta da password. Evitare la copia
integrale di database di terzi nel repository o nel pacchetto web.

## Verifiche

    python3 tests/oscar-current.py
    python3 tests/imdb-metadata.py
    python3 tests/oscar.py
    python3 tests/cinema.py
    node tests/watch-dossier.cjs
