# Bobo Movie Night

Sito statico basato su [CasaFlix di scageto](https://github.com/scageto/CasaFlix), personalizzato come **Bobo Movie Night**.

## Pubblicazione
- GitHub Pages: https://matteocurro.github.io/bobo-movie-night/
- GitHub → **Settings → Pages** → **Deploy from a branch** → `main` / `/(root)`.

## Aggiornamenti
La GitHub Action `.github/workflows/sync-upstream.yml` recupera automaticamente `index.html`, `data/movies.json` e `data/tv.json` dall'originale ogni 12 ore. Il nome **Bobo Movie Night** viene riapplicato dopo ogni aggiornamento.
Non occorrono credenziali TMDB: i cataloghi vengono sincronizzati dal repository originale.

L'app utilizza player esterni: la riproduzione dipende dai relativi provider e dalla disponibilità dei contenuti.
