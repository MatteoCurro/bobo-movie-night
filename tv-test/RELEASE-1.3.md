# Bobo Movie Club TV 1.3 — rilascio e verifiche

Ramo di sviluppo: `feature/tv-1-3-stable-session-updates` (base: `tv-features-1-2`).

## Modifiche
- Preferiti: `POST /api.php?route=favorites/toggle`, transazione server unica (evita conflitti fra TV e web).
- Rete: la UI non interpreta più un timeout/503 come logout, e non azzera i preferiti in memoria.
- Account: `POST /api.php?route=tv/remember` crea un token casuale in cookie Secure + HttpOnly, con hash SHA-256 sul server, revocabile con logout e scadenza mobile di 365 giorni. Non viene salvata la password.
- Android TV/Fire OS Android: GitHub Releases `tv-v<major>.<minor>.<patch>` con APK `Bobo-Movie-Club-TV.apk`; verifica all'avvio; installazione guidata su richiesta con consenso di Android.
- UI: focus telecomando, contrasto e card rifinite senza cambiare il player.

## Attivazione backend necessaria
L'API del sito account è su un hosting PHP distinto da GitHub Pages. Il commit GitHub **non aggiorna automaticamente quel server**. Per attivare davvero token TV e toggle atomico, pubblicare la nuova versione di `backend/htdocs/api.php` su `movieaccount.curromatteo.it`, lasciando intatti `config.local.php`, `state.json` e i permessi dell'archivio. Eseguire il lint PHP prima della pubblicazione.

Il client TV torna al vecchio flusso GET/PUT se il server non conosce `favorites/toggle` (404). Anche il login continua a funzionare se `tv/remember` non è ancora attivo, ma in quel caso resta una sessione normale.

## Firma permanente (una sola volta)
Generare **in locale** una chiave privata per le release, conservarne un backup cifrato e creare i seguenti GitHub Actions repository secrets:
- `BOBO_TV_KEYSTORE_B64`: file keystore codificato base64 in un'unica riga
- `BOBO_TV_STORE_PASSWORD`: password del keystore
- `BOBO_TV_KEY_ALIAS`: alias usato in `keytool`
- `BOBO_TV_KEY_PASSWORD`: password della chiave

Per esempio, generare con `keytool -genkeypair -keystore bobo-tv-release.jks -alias bobo-tv -keyalg RSA -keysize 3072 -validity 10000` e convertire il keystore in base64. **Non caricare keystore o password in repository, issue o chat pubbliche.** Senza questi segreti, `tv-release.yml` interrompe la pubblicazione intenzionalmente.

Dopo il merge, creare il tag `tv-v1.3.0` sulla revisione che contiene il codice 1.3.0. Il workflow compila `assembleRelease`, verifica la firma e allega `Bobo-Movie-Club-TV.apk` alla GitHub Release pubblica. Le release successive devono mantenere sempre stesso `applicationId`, keystore e alias e aumentare `versionCode` (es. 10301 per 1.3.1).

Il passaggio dalle APK `app-debug.apk` firmate ogni volta dai runner alla prima release firmata richiede la disinstallazione della vecchia APK; dopo, i futuri update firmati conservano i dati installati. I preferiti salvati sul server rimangono disponibili dopo il nuovo login.

## Checklist TV reale
1. Avvio, ricerca, focus sulle locandine, pulsanti, frecce e Indietro.
2. Login; aggiunta/rimozione preferiti; verifica sincronizzazione con il sito.
3. Mettere offline brevemente la TV: i preferiti non devono essere azzerati per un errore di rete.
4. Chiudere e riaprire, poi riavviare la TV: login conservato dopo il deploy PHP.
5. Da Account selezionare «Controlla aggiornamenti».
6. Pubblicare una versione maggiore (es. 1.3.1); controllare avviso, download, richiesta autorizzazione e installazione.
7. Testare la riproduzione e i comandi remoti sulla TCL; test Fire OS 7/8 su dispositivo reale.
8. Fire TV con Vega OS non può eseguire APK Android; Fire OS 5/6 è escluso da minSdk 26.

**Importante:** l'installer non aggiorna in modo silenzioso e non aggira i controlli Android sulle sorgenti esterne. Il pulsante di aggiornamento appare solo quando una GitHub Release TV con versione superiore è pubblicata.
