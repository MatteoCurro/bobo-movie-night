# Deploy statico

Il workflow di pubblicazione genera un artefatto contenente esclusivamente le risorse web della directory `_site/`.

## Pubblicazione

1. Verificare il completamento dei controlli automatici.
2. Estrarre l'artefatto statico nell'area pubblica prevista dall'hosting.
3. Verificare pagine, navigazione, file JSON e controllo accessi configurato sull'hosting.
4. Mantenere credenziali e configurazioni di autenticazione al di fuori della directory pubblicata.

L'artefatto **non** contiene il codice PHP del servizio account, configurazioni locali, file di stato, credenziali o strumenti di sviluppo. Il backend è distribuito separatamente.

Se è richiesto accesso riservato, applicare il controllo **lato server** a tutte le pagine e alle risorse JSON. Un blocco implementato soltanto in JavaScript non protegge i file pubblici.
