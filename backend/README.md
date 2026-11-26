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

## Analytics amministrative

La dashboard `htdocs/admin.html` utilizza i nuovi endpoint `admin/overview` (accessibile esclusivamente agli amministratori autenticati) e `track` (contatori aggregati senza identificativi personali). Gli eventi sono raccolti dal sito statico tramite `bobo-analytics.js` e memorizzati nel file privato `analytics-traffic.json`, esterno alla document root e non presente nel repository. Conservazione limitata a circa 120 giorni.

Il report cinematografico `data/admin-analytics.json` è prodotto nel workflow di sincronizzazione dal catalogo pubblico: non include nomi degli utenti, preferiti personali o dati di navigazione. Il servizio account lo recupera con caching e integra i soli aggregati privati; la dashboard non legge direttamente gli archivi delle persone.

**Distribuzione:** i cambiamenti in `backend/htdocs/` devono essere pubblicati nel servizio account PHP, indipendentemente dal sito statico, senza sostituire i file di configurazione, `state.json`, gli archivi di traffico o altre risorse permanenti. In caso di modifica del percorso pubblico del frontend, aggiornare `site_origin` nel file di configurazione privato. I contatori iniziano alla distribuzione del tracker e non possono ricostruire le visite precedenti.
