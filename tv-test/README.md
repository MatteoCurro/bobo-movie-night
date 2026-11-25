# Bobo Movie Club - Android TV player probe

Branch sperimentale indipendente dalla produzione: **tv-player-probe**.

Questo APK non e una distribuzione completa dell'app: carica la vera home
https://movie.curromatteo.it/ e le vere pagine `watch.html` che incorporano
Vix in iframe con `referrerpolicy="origin"`. Serve a verificare su TCL Google TV:
riproduzione audio/video, fullscreen WebChromeClient, input del telecomando,
accesso a sottotitoli e cambio episodio.

## Costruzione

Workflow GitHub Actions: **Bobo TV · Player test APK**. Dalla relativa esecuzione
scaricare l'artifact `Bobo-Movie-Club-TV-test-APK` (zip), estrarre
`app-debug.apk` e copiarlo in `~/Downloads/` del Mac.

## Installazione e aggiornamento dal Mac gia associato con ADB

```sh
~/Downloads/platform-tools/adb devices
~/Downloads/platform-tools/adb install -r ~/Downloads/app-debug.apk
~/Downloads/platform-tools/adb shell am start -n it.bobomovieclub.tvprobe/.MainActivity
```

Per aprire una scheda film senza passare dalla navigazione su TV (sostituire
l'ID con uno presente nel catalogo):

```sh
~/Downloads/platform-tools/adb shell am start -n it.bobomovieclub.tvprobe/.MainActivity --es url 'https://movie.curromatteo.it/watch.html?type=movie&id=12345&debug=player'
```

Controllare il player con il telecomando e premere BACK per uscire dal fullscreen.
I log del sistema si ottengono con `adb logcat`. Il player appartiene a un
servizio esterno: nessuna modifica di iframe, DRM o stream garantisce che funzioni.
