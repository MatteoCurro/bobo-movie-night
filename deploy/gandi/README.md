# Pubblicazione privata su Gandi — Bobo Movie Night

L'obiettivo è rendere **privati sia le pagine HTML sia i cataloghi JSON**. GitHub Pages pubblico non può offrire questa garanzia, quindi la protezione deve essere applicata **prima** che il server consegni i file.

## Struttura proposta

- URL destinazione: `https://curromatteo.it/bobo/` (modificabile secondo il virtual host effettivo).
- File applicazione: directory `htdocs/bobo/` del virtual host Gandi.
- File password: `/srv/data/web/vhosts/NOME-REALE-VHOST/.htpasswd`, **fuori** da `htdocs/`.
- Regole di accesso: `.htaccess` all'interno di `htdocs/bobo/` (vedi `.htaccess.example`).
- HTTPS attivo prima di autorizzare l'accesso.

## Installazione

1. Scarica l'artifact `bobo-gandi-static` dall'ultima esecuzione riuscita di [Sync upstream CasaFlix](https://github.com/MatteoCurro/bobo-movie-night/actions/workflows/sync-upstream.yml). Contiene solo i file web aggiornati.
2. Carica via SFTP il contenuto dell'artifact dentro `htdocs/bobo/` del virtual host in Gandi. Non caricarlo nella directory del sito principale.
3. Sul proprio computer genera `.htpasswd` usando Apache `htpasswd`, ad esempio:
   `htpasswd -B -c .htpasswd bobo`
   Verrà richiesta una password **senza scriverla nel comando o nella cronologia shell**.
4. Carica `.htpasswd` via SFTP **fuori da `htdocs/`**, precisamente nella directory `vhosts/NOME-REALE-VHOST/`, come documentato da Gandi.
5. Modifica il file `.htaccess.example` sostituendo `NOME-REALE-VHOST` con il nome reale del virtual host, rinominalo `.htaccess` e caricalo in `htdocs/bobo/`.
6. In una finestra di navigazione privata verifica che `/bobo/`, `/bobo/watch.html`, `/bobo/data/movies.json`, `/bobo/data/tv.json` richiedano tutti credenziali. La risposta HTTP attesa prima del login è `401 Unauthorized`.
7. **Disattiva GitHub Pages** per `bobo-movie-night` nelle impostazioni del repository. Finché `matteocurro.github.io/bobo-movie-night/` rimane attivo, esiste una copia pubblicamente accessibile che aggira la password Gandi.
8. Mantieni il repository GitHub per gestione codice e aggiornamenti. Per aggiornare automaticamente Gandi, configurare un successivo deploy SFTP tramite credenziali/segreti GitHub Actions, non pubblicandole mai nel repository.

## Note

- Non aggiungere un form password esclusivamente JavaScript: non protegge il codice né i JSON scaricabili.
- Non committare `.htpasswd`, password o chiavi SFTP nel repository pubblico.
- Gandi documenta l'utilizzo di `.htaccess` e `.htpasswd` e specifica di conservare `.htpasswd` fuori da `htdocs/`: https://docs.gandi.net/en/web_hosting/tutorials/htaccess.html
- Se l'ambiente Gandi non supporta Apache `.htaccess`, occorre usare il controllo accessi disponibile sulla piattaforma o un servizio come Cloudflare Access davanti a un'origine privata.
- Questo progetto contiene contenuti di terze parti; la password non modifica i permessi di utilizzo dei relativi servizi.
