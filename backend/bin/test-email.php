<?php
declare(strict_types=1);
/* Run via SSH/CLI ONLY; never place this script inside public/. */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$configPath=dirname(__DIR__).'/config.local.php';
if (!is_file($configPath)) { fwrite(STDERR,"Configura prima config.local.php.\n"); exit(1); }
$config=require $configPath;
require_once dirname(__DIR__).'/lib/mailer.php';
$email=trim((string)($argv[1]??''));
if (!filter_var($email,FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR,"Uso: php bin/test-email.php tuoindirizzo@example.com\n");
    exit(1);
}
$sent=bobo_send_email($config,$email,'Bobo Movie Night — test email',
    "Questo messaggio è stato inviato da Bobo Movie Night tramite Resend API HTTPS.\n".
    "L'hosting PHP non ha usato la funzione mail() né un server SMTP locale.\n");
if (!$sent) {
    fwrite(STDERR,"Resend ha rifiutato la richiesta o la connessione HTTPS è fallita. Verifica dominio/chiave e i log PHP.\n");
    exit(2);
}
echo "Resend ha accettato il messaggio di prova. Verifica anche la consegna in inbox.\n";
