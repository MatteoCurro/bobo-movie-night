<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(403);exit;}
$configFile=dirname(__DIR__).'/config.local.php';
if(!is_file($configFile)){fwrite(STDERR,"Copia config.example.php in config.local.php.\n");exit(1);}
$config=require $configFile;
$dir=$config['data_dir'];
if(!is_dir($dir))mkdir($dir,0700,true);
$file=rtrim($dir,'/').'/state.json';
// PHP-CLI on many shared hosts (including some Gandi installations) has no
// readline extension. STDIN is available without that optional extension.
function console_input(string $question): string {
    fwrite(STDOUT, $question);
    $answer = fgets(STDIN);
    if ($answer === false) {
        fwrite(STDERR, "\nInput da terminale non disponibile: avvia con PHP CLI e un terminale interattivo.\n");
        exit(1);
    }
    return trim($answer);
}
$name=strtolower(console_input('Username amministratore (3-24): '));
if(!preg_match('/^[a-z0-9][a-z0-9._-]{2,23}$/D',$name))exit("Username non valido.\n");
$email=strtolower(console_input('Email amministratore: '));
if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>254) exit("Indirizzo email non valido.\n");
// Hide the password only when stdin is a real TTY and stty is available.
// Without a TTY we still accept piped input (e.g. automated CLI tests).
$isTty = function_exists('stream_isatty') ? stream_isatty(STDIN) :
    (function_exists('posix_isatty') && posix_isatty(STDIN));
$sttyState = null;
if ($isTty && function_exists('shell_exec')) {
    $candidate = trim((string) @shell_exec('stty -g'));
    if ($candidate !== '') {
        $sttyState = $candidate;
        @shell_exec('stty -echo');
    }
}
if ($isTty && $sttyState === null) {
    fwrite(STDERR, "Attenzione: impossibile nascondere la password nel terminale.\n");
}
try {
    $password=console_input('Password amministratore (minimo 10 caratteri): ');
} finally {
    if ($sttyState !== null) @shell_exec('stty ' . escapeshellarg($sttyState));
    fwrite(STDOUT, "\n");
}
if(strlen($password)<10)exit("Password troppo corta.\n");
$handle=fopen($file,'c+');
if(!$handle || !flock($handle,LOCK_EX))exit("Impossibile aprire archivio.\n");
$data=json_decode(stream_get_contents($handle)?:'',true);
if(!is_array($data))$data=['users'=>[],'attempts'=>[]];
if(isset($data['users'][$name]))exit("Utente già presente; non sovrascrivo.\n");
$recovery=bin2hex(random_bytes(24));
$data['users'][$name]=['id'=>bin2hex(random_bytes(12)), 'email'=>$email,
 'email_verified_at'=>gmdate('c'),'session_version'=>1,
 'password_hash'=>password_hash($password,PASSWORD_DEFAULT),
 'recovery_hash'=>hash('sha256',$recovery),'role'=>'admin','created_at'=>gmdate('c'),'favorites'=>[]];
rewind($handle);ftruncate($handle,0);fwrite($handle,json_encode($data,JSON_UNESCAPED_UNICODE));fflush($handle);
flock($handle,LOCK_UN);fclose($handle);chmod($file,0600);
echo "Admin creato: $name\nCodice recupero: $recovery\nCONSERVALO IN UN POSTO SICURO.\n";
