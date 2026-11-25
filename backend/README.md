# Bobo Accounts — PHP + archivio JSON + email Resend

**Versione 3 — registrazione libera e verifica email — predisposta per `https://movieaccount.curromatteo.it`.**

Questo è un microservizio autonomo per gli amici di Bobo Movie Night, senza MySQL, Composer, cron o funzione PHP `mail()`.

- **GitHub Pages** (`https://movie.curromatteo.it`) continuerà a mostrare catalogo e player Vix.
- **Hosting PHP** (`https://movieaccount.curromatteo.it`) gestirà registrazione, accesso, recupero della password, preferiti e amministrazione.
- **Resend** invierà soltanto email transazionali (conferma dell'indirizzo e reimpostazione password) tramite API HTTPS, senza usare i server di posta Gandi.

> **IMPORTANTE:** questo pacchetto è autonomo e funzionante come servizio account, ma **non sincronizza ancora automaticamente i cuori/preferiti del sito GitHub Pages**. Il collegamento JavaScript del sito sarà il passaggio successivo, dopo la verifica del backend caricato e dell'HTTPS.

## Registrazione libera e domanda iniziale Bobo

La modalità predefinita di questa versione è **registrazione libera**: `registration_mode => 'open'`. Sono sufficienti username, email e password; l'utente deve confermare l'email via Resend prima di entrare. Il campo codice d'invito appare solo se imposti `registration_mode => 'invite'` e configuri `invitation_hash` lato server.

**Importante:** la domanda iniziale su Faiva o sull'arrampicata è gestita da JavaScript sul sito GitHub Pages. Non rappresenta un controllo di autenticazione lato server. Chi apre direttamente `https://movieaccount.curromatteo.it/account.html` potrà registrarsi anche senza passare dalla domanda. Se vuoi davvero limitare gli account ai soli amici dovrai usare la modalità con invito o una verifica server-side separata. La verifica email e i limiti antispam delle richieste rimangono attivi anche in modalità aperta.

Il frontend `movie.curromatteo.it` non è ancora integrato con l'autenticazione PHP: il pacchetto crea il servizio account, ma per accedere e sincronizzare i preferiti dal sito principale va collegato il relativo JavaScript.

## Requisiti

- Hosting con PHP **8.1+**, JSON, sessioni, HTTPS, storage persistente e connessioni HTTPS in uscita.
- Estensione **cURL** oppure `allow_url_fopen=On` (entrambe supportate dal client Resend senza dipendenze esterne).
- Dominio verificato e **chiave API di invio** di Resend.
- **Document root impostabile sulla sola cartella `public/`**. Gli altri file, in particolare `config.local.php` e `private/state.json`, non devono essere scaricabili dal web.

## 1. Configurare Resend

**Verifica già eseguita:** nel tuo account Resend risultano **`curromatteo.it` verificato e abilitato all'invio**, oltre a `unlockvenice.com`. Quindi non occorre creare un nuovo sottodominio email né modificare il DNS per questa parte.

1. Apri [Resend — API Keys](https://resend.com/api-keys) e crea una **nuova chiave dedicata a Bobo**, con il permesso minimo di **invio email**; se possibile restringila a `curromatteo.it`.
2. Configura in `config.local.php`:

   ```php
   'resend_api_key' => 're_LA_TUA_CHIAVE_PRIVATA',
   'resend_from' => 'Bobo Movie Night <no-reply@curromatteo.it>',
   ```

3. Non serve alcun account email fisico `no-reply@curromatteo.it`: Resend è autorizzato a inviare messaggi dal dominio verificato. Se vuoi ricevere risposte, configura invece un indirizzo esistente come mittente o come Reply-To in un secondo momento.

**Non mettere mai la chiave Resend in GitHub Pages, JavaScript o in un repository pubblico.** Conservala unicamente in `config.local.php`, lato hosting PHP.

Al 25 novembre 2026 il piano Resend Free prevede **3.000 email/mese, 100 al giorno e 3 domini verificati**; per il piccolo gruppo di amici Bobo dovrebbe essere sufficiente. Verifica le condizioni correnti su [resend.com/pricing](https://resend.com/pricing).

## 2. Caricare i file su Gandi (attenzione alla cartella pubblica)

La distribuzione del pacchetto deve avere questa struttura *logica*:

```text
bobo-account-php/
├── public/                 ← SOLO QUESTA è la document root di movieaccount.curromatteo.it
│   ├── api.php
│   ├── account.html / account.js
│   └── admin.html / admin.js
├── lib/mailer.php         ← fuori dalla document root
├── private/               ← fuori dalla document root, scrivibile da PHP
│   └── state.json         ← generato automaticamente; non pubblicarlo
├── bin/admin.php          ← utilizzato solo tramite riga di comando
├── config.example.php
└── config.local.php       ← da creare e mantenere PRIVATO
```

**Non estrarre l'intero ZIP direttamente nella directory web** se il server esporrebbe così `private/`, `config.local.php` o `bin/`.

1. Crea il sottodominio `movieaccount.curromatteo.it` sul tuo hosting PHP e abilita HTTPS.
2. Carica il pacchetto in una cartella non pubblica e imposta **la document root su `bobo-account-php/public`**. Se il pannello Gandi non consente questa scelta, prima di caricarlo serve un layout alternativo che tenga davvero privati gli altri file.
3. Copia `config.example.php` in `config.local.php` nella cartella principale, quindi imposta la chiave Resend, il mittente verificato, la modalità di registrazione e, se necessario, il percorso `data_dir`. Con `registration_mode = open` non serve alcun codice d’invito.
4. **Non serve configurare alcun codice d'invito** nella modalità predefinita. Soltanto se vuoi passare alla modalità `invite`, puoi generare un hash con:

   ```bash
   php -r 'echo password_hash("UN_CODICE_INVITO_LUNGO_E_CASUALE", PASSWORD_DEFAULT), PHP_EOL;'
   ```

   Inserisci l'hash in `invitation_hash` soltanto se attivi `registration_mode => 'invite'`.
5. Assicurati che PHP possa scrivere nella directory `private/`, ma che nessuna risorsa sotto `private/` sia servita da HTTP.
6. Tramite SSH/terminale dell'hosting esegui `php bin/admin.php` dalla cartella principale. Ti chiederà username, email e password del primo amministratore. Salva il codice di emergenza generato.

## 3. Testare i servizi

**Test Resend prima di registrare utenti (da SSH/CLI):**

```bash
php bin/test-email.php tua-email@example.com
```

Se restituisce conferma, Resend ha accettato la richiesta; verifica anche di aver ricevuto il messaggio (e il dashboard Resend). Se il provider risponde con errore, controlla la chiave, il mittente, la verifica DNS e il collegamento HTTPS in uscita da PHP.

1. Apri `https://movieaccount.curromatteo.it/api.php?route=health`.
   Deve rispondere con JSON contenente `"ok":true` e `"mail_configured":true`. **Questo controlla la configurazione, non garantisce da solo la consegna email.**
2. Apri `https://movieaccount.curromatteo.it/account.html`.
3. Prova a registrare un nuovo utente con **username, email e password**, senza alcun codice invito. Il sistema invia un collegamento di verifica con durata **24 ore**; finché non viene confermato, l'utente non può accedere.
4. Apri l'email e conferma. Il servizio mostra una sola volta il codice di emergenza, utile se perdi accesso alla casella.
5. Prova **Password dimenticata**: inserisci l'email, usa il link monouso valido **30 minuti** e imposta una nuova password.
6. Prova `https://movieaccount.curromatteo.it/admin.html` con l'account amministratore.
7. Esegui eventualmente un test dalla home Bobo solo dopo che gli endpoint hanno superato i controlli precedenti.

## 4. Endpoint disponibili

Tutti gli endpoint sono raggiungibili come `api.php?route=...`, usano JSON e rispondono tramite HTTPS.

| Metodo | Route | Funzione |
| --- | --- | --- |
| GET | `health` | Stato servizio e configurazione email (nessun segreto) |
| POST | `register` | `{username,email,password}` → invio conferma email (codice `invite` soltanto se richiesto dalla configurazione) |
| POST | `verify-email` | `{token}` → conferma, login e codice personale una tantum |
| POST | `resend-verification` | `{email}` → nuovo link, massimo uno ogni 3 minuti |
| POST | `login` | `{username,password}` |
| POST | `logout` | Logout |
| GET | `me` | Account attivo e indirizzo email |
| POST | `request-reset` | `{email}` → link monouso via Resend (30 minuti) |
| POST | `reset-password` | `{token,new_password}` → cambia la password e invalida le sessioni vecchie |
| POST | `recover` | `{username,recovery_code,new_password}` → recupero con codice di emergenza |
| GET | `favorites` | Elenco preferiti dell'account autenticato |
| PUT | `favorites` | `{items:[...]}` → sostituisce raccolta (max 500) |
| GET | `admin/users` | Utenti, email verificate, ruoli, date, contatori preferiti; solo admin |

Le richieste di reset rispondono allo stesso modo indipendentemente dall'esistenza dell'indirizzo, per limitare l'enumerazione degli utenti. I tentativi e gli invii sono soggetti a limiti temporali. I token sono casuali, utilizzabili una volta e memorizzati nel JSON **solo come hash**.

## 5. Sicurezza, limiti e manutenzione

- Password con `password_hash` e `password_verify`, mai in chiaro o cifrate con una chiave hardcoded.
- `config.local.php`, chiave Resend e file `state.json` **esclusivamente lato server e fuori da `public/`**.
- Sessioni PHP con cookie HttpOnly, Secure e SameSite=Lax; origine delle modifiche limitata a `movie.curromatteo.it` e `movieaccount.curromatteo.it`.
- Recupero tramite email e codice d'emergenza; cambi di password invalidano le precedenti sessioni applicative.
- `flock` per accessi concorrenti al JSON. Per poche decine di utenti va bene; non è un database per carichi elevati.
- Fai backup frequenti del file privato `state.json`. Una copia cifrata off-server è consigliabile.
- I link di verifica e recupero contengono i token nel **fragment** (`#verify=...`, `#reset=...`), quindi il token non viene inviato nell'URL HTTP ordinario.
- La domanda iniziale di Bobo (Faiva/arrampicata) rimane separata e invariata; non è una protezione di accesso a livello server.
- Resend elabora gli indirizzi email e i messaggi: in una distribuzione pubblica completa è opportuno aggiornare informativa privacy e registro dei fornitori.

## 6. Collegate i preferiti nel sito principale (fase successiva)

Dopo il collaudo del microservizio, il frontend su GitHub Pages userà:

```js
const base = 'https://movieaccount.curromatteo.it/api.php?route=';
const response = await fetch(base + 'favorites', {credentials:'include'});
const {items} = await response.json();
```

Le due origini fanno parte dello stesso dominio registrabile `curromatteo.it`, così i cookie di sessione `SameSite=Lax` possono essere usati tra i sottodomini nelle condizioni previste dai browser.

**Finché il client GitHub non viene integrato**, i preferiti del sito rimangono salvati localmente con i profili/backup già esistenti: il pacchetto PHP non li sincronizza da solo.


## Versione server archiviata - 2026-11-25
Il codice distribuibile esclude `config.local.php`, le copie di configurazione, `private/state.json` e ogni credenziale.
La pagina admin dei preferiti ora integra le locandine dall'indice pubblico `data/poster-index.json`,
con una cache server locale di sei ore; senza indice resta il fallback visivo.
La domanda iniziale è condivisa tra sottodomini mediante cookie a durata 30 giorni. È un filtro di interfaccia, non autenticazione.
La newsletter resta disattivata finché l'utente non sceglie esplicitamente di iscriversi.
