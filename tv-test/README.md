# Bobo Movie Club TV — interfaccia esclusiva per Google TV

Ramo separato `tv-playback-fix`. Nessun file del sito web e nessun contenuto pubblicato
su `movie.curromatteo.it` viene modificato. Il catalogo e le immagini sono letti
direttamente dagli JSON pubblici: `data/movies.json`, `data/tv.json` e
`data/episodes/{id}.json`.

## Differenze dalla versione web
- Interfaccia nuova, specifica per 10-foot UI: Home, Film, Serie TV, Cerca.
- Nessuna domanda iniziale, nessuna schermata di login, nessuna voce preferiti.
- Locandine con singolo pulsante ciascuna; focus visibile e scorrimento automatico.
- Schede, stagioni, episodi e player progettati per le frecce e il tasto centrale.
- Player Vix in iframe; `referrerpolicy="origin"`, senza sandbox (altrimenti Vix lo rifiuta).
- Non sono richiesti Android Studio, Play Store o una pubblicazione pubblica.

## Riproduzione e limiti verificabili sulla TCL
Dopo il caricamento del video, OK = pausa/ripresa, sinistra = -10 s,
destra = +10 s, Indietro = torna alla scheda.
Quando supportato dalla WebView, AndroidX WebKit inietta un mini bridge JavaScript
solo nei frame originati da `vixsrc.to` e invia comandi al media element.
Il bridge non bypassa DRM o controlli di origine e non concede API native a terzi.
Se il video non è accessibile direttamente, la **pausa alternativa** arresta il
frame ricordando il timestamp comunicato da Vix e riprende con il parametro
`startAt`. Anche l'avanzamento riposiziona la riproduzione ricaricando il video;
può richiedere buffering o un nuovo OK. È un fallback sperimentale, non un
controllo ufficiale del player.

## Compilazione e installazione
Workflow `Bobo TV · Leanback APK` -> artifact
`Bobo-Movie-Club-TV-1.1-playback-fix-APK`. Estrai `app-debug.apk` e copialo in
`~/Downloads` sul Mac già associato alla TV via ADB.

Poiché le firme **debug** dei runner GitHub cambiano, per passare tra versioni
sperimentali esegui (cancella solo i dati locali della vecchia app):
```sh
~/Downloads/platform-tools/adb uninstall it.bobomovieclub.tvprobe
~/Downloads/platform-tools/adb install ~/Downloads/app-debug.apk
~/Downloads/platform-tools/adb shell am start -n it.bobomovieclub.tvprobe/.MainActivity
```

## Sicurezza
L'app non imposta né memorizza credenziali. La pagina TV interna viene caricata
con `loadDataWithBaseURL` usando l'origine HTTPS di Bobo per permettere il
fetch degli indici JSON; JavaScript di terze parti non può usare il bridge nativo,
che è limitato all'origine e al frame principale.

## Verifiche TCL
1. Frecce e OK tra home, caroselli e schede.
2. Ricerca con tastiera di Google TV.
3. Cambio stagione e apertura episodio.
4. Avvio manuale Vix, play e audio.
5. OK su video avviato e frecce +/- 10 s.
6. Indietro da player, schede e home.

## TV 1.1 — test da eseguire sul telecomando
1. Aprire un film già verificato come riproducibile su Vix.
2. Attendere l'avvio del video e la scomparsa delle sovraimpressioni iniziali.
3. Premere OK: se il bridge HTML5 risponde, il video va direttamente in pausa; se
   non è accessibile, il fallback ferma l'iframe e conserva il timestamp noto o
   stimato. Premere nuovamente OK per ripartire.
4. Premere destra/sinistra: saltare +10/-10 secondi. La sorgente viene ricaricata
   con startAt soltanto se il controllo diretto non risponde.
5. Se non funziona, i log sono filtrabili con
   `~/Downloads/platform-tools/adb logcat -s BoboTV:D *:S`.

## Versione 1.2 – comandi, ricerca, account e icona
- Tenendo premuto sinistra/destra selezioni salti progressivi (10 s, 30 s,
  1 minuto, poi +1 minuto circa ogni 260 ms); il video salta solo quando
  rilasci la freccia, senza continui ricaricamenti.
- La ricerca mostra anteprime compatte mentre la tastiera virtuale è aperta.
  Premi Invio o seleziona "Mostra risultati" per chiudere la tastiera.
- Login con credenziali dell'account Bobo esistente: URL API fisso HTTPS
  movieaccount.curromatteo.it, cookie di sessione e nessuna password salvata
  nell'APK. L'API restituisce raccolta preferiti sincronizzata; aggiorna un
  titolo dalla sua pagina di dettaglio.
- Nuovo logotipo app e banner Google TV generati durante la compilazione.
- Ramo autonomo tv-features-1-2; main non viene modificato.
- L'APK è ancora firmato per debug dal runner GitHub. Per aggiornamenti
  senza disinstallazione serve una firma stabile conservata in segreti CI.
