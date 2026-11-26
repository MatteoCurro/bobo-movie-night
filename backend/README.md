# Bobo Accounts

Servizio PHP indipendente per autenticazione, preferiti e notifiche transazionali. Non viene pubblicato insieme al sito statico.

## Componenti

- `htdocs/`: risorse ed endpoint pubblici.
- `lib/`: logica applicativa eseguita sul server.
- `bin/`: operazioni amministrative da riga di comando.
- `config.example.php`: schema di configurazione senza credenziali.
- `private/`: spazio dati persistente, non servito via HTTP.

## Requisiti

PHP 8.1+, estensioni JSON e HTTPS, sessioni e storage persistente. I servizi esterni sono configurati tramite parametri mantenuti esclusivamente sul server.

## Installazione

1. Pubblicare soltanto `htdocs/` come document root.
2. Mantenere `lib/`, `bin/`, configurazione locale e dati persistenti fuori dalla directory pubblica.
3. Creare una configurazione locale a partire dall'esempio e impostare credenziali e parametri direttamente nell'ambiente server.
4. Verificare permessi di scrittura, HTTPS, autenticazione e procedure di recupero dell'accesso.
5. Prima degli aggiornamenti, effettuare un backup dei dati persistenti. Non sovrascrivere mai lo stato di produzione con file di esempio.

## Sicurezza

Non committare credenziali, token, password, database, file di stato, log o backup. I controlli di accesso e autorizzazione devono essere applicati dal server; il frontend non è un confine di sicurezza. Applicare il principio del privilegio minimo alle integrazioni e ruotare immediatamente eventuali credenziali esposte.

Il deployment del backend è separato dal workflow che genera il sito statico.
