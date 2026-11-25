<?php
declare(strict_types=1);
/** BOBO accounts v1: zero dependencies beyond PHP 8.1+, JSON files, sessions.
 * No passwords or user data belong in GitHub Pages or the site's public repo.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
$configFile = dirname(__DIR__) . '/config.local.php';
if (!is_file($configFile)) {
    http_response_code(503);
    echo json_encode(['error'=>'Servizio account non configurato']);
    exit;
}
$config = require $configFile;
if (!is_array($config)) { http_response_code(503); exit; }
require_once dirname(__DIR__) . '/lib/mailer.php';
require_once dirname(__DIR__) . '/lib/newsletter.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_values(array_filter([$config['site_origin'] ?? '', $config['api_origin'] ?? '']));
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(in_array($origin, $allowedOrigins, true) ? 204 : 403);
    exit;
}
function send_json(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function request_json(): array {
    if (!in_array($_SERVER['CONTENT_TYPE'] ?? '', ['application/json'], true) &&
        !str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json;')) {
        send_json(415, ['error'=>'Content-Type JSON richiesto']);
    }
    $body = file_get_contents('php://input', false, null, 0, 512001);
    if ($body === false || strlen($body) > 512000) send_json(413,['error'=>'Richiesta troppo grande']);
    $value = json_decode($body, true);
    if (!is_array($value) || json_last_error() !== JSON_ERROR_NONE) send_json(400,['error'=>'JSON non valido']);
    return $value;
}
function normalized_email(mixed $value): string {
    $email = strtolower(trim((string)$value));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(422, ['error'=>'Indirizzo email non valido']);
    }
    return $email;
}
function valid_token(mixed $token): string {
    $value = strtolower(trim((string)$token));
    if (!preg_match('/^[0-9a-f]{64}$/D', $value)) send_json(400, ['error'=>'Link non valido o scaduto']);
    return $value;
}
function email_link(string $action, string $token): string {
    global $config;
    $base = rtrim((string)$config['api_origin'], '/');
    // Fragment token is not transmitted as an HTTP query or referrer.
    return $base . '/account.html#' . $action . '=' . rawurlencode($token);
}
/** No preference stored means default enabled for verified members; explicit null is opt-out. */
function bobo_newsletter_subscribed(array $row): bool {
    if (array_key_exists('newsletter_subscribed_at',$row))
        return !empty($row['newsletter_subscribed_at']);
    return !empty($row['email_verified_at']);
}
function bobo_mail_configured(): bool {
    global $config;
    return trim((string)($config['resend_api_key'] ?? '')) !== '' &&
        trim((string)($config['resend_from'] ?? '')) !== '';
}
function normalized_name(mixed $value): string {
    $name = strtolower(trim((string)$value));
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,23}$/D', $name)) {
        send_json(422,['error'=>'Username: 3–24 caratteri, lettere, numeri, . _ -']);
    }
    return $name;
}
function validate_password(mixed $password): string {
    if (!is_string($password) || strlen($password)<10 || strlen($password)>256) {
        send_json(422,['error'=>'Password di 10–256 caratteri richiesta']);
    }
    return $password;
}
function storage_dir(): string {
    global $config;
    $dir = (string)($config['data_dir'] ?? '');
    if (!$dir || (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir))) {
        send_json(503,['error'=>'Archivio account non disponibile']);
    }
    $root = realpath(__DIR__);
    $resolved = realpath($dir);
    if (!$resolved || ($root && ($resolved === $root || str_starts_with($resolved, $root . DIRECTORY_SEPARATOR)))) {
        send_json(503,['error'=>'Configurazione archivio non sicura']);
    }
    return $resolved;
}
function state(callable $callback, bool $write=false): mixed {
    $filename = storage_dir() . '/state.json';
    $handle = fopen($filename,'c+');
    if (!$handle) send_json(503,['error'=>'Archivio non disponibile']);
    @chmod($filename,0600);
    if (!flock($handle, $write ? LOCK_EX : LOCK_SH)) send_json(503,['error'=>'Archivio occupato']);
    rewind($handle);
    $contents = stream_get_contents($handle);
    $db = $contents === '' ? ['users'=>[], 'attempts'=>[]] : json_decode($contents, true);
    if (!is_array($db) || !isset($db['users']) || !is_array($db['users'])) {
        flock($handle,LOCK_UN); fclose($handle);
        send_json(503,['error'=>'Archivio account non leggibile']);
    }
    $result = $callback($db);
    if ($write) {
        $encoded = json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        rewind($handle);ftruncate($handle,0);
        $bytes=fwrite($handle,$encoded);
        fflush($handle);
        if ($bytes===false || $bytes!==strlen($encoded)) send_json(503,['error'=>'Scrittura non completata']);
    }
    flock($handle,LOCK_UN);fclose($handle);
    return $result;
}
function rate_limit(string $identity): void {
    $key = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . strtolower($identity));
    $allowed=state(function (&$db) use ($key) {
        $now=time();
        $db['attempts'] = array_filter($db['attempts'] ?? [],static fn($entry)=>is_array($entry) && ($entry['until'] ?? 0)>$now);
        $a = $db['attempts'][$key] ?? ['count'=>0,'until'=>$now+900];
        if ($a['until'] <= $now) $a=['count'=>0,'until'=>$now+900];
        ++$a['count'];$db['attempts'][$key]=$a;
        return $a['count']<=8;
    },true);
    if (!$allowed) send_json(429,['error'=>'Troppi tentativi. Riprova più tardi.']);
}

/**
 * TV-only durable sign-in. The opaque token lives in an HttpOnly Secure cookie;
 * only its SHA-256 hash is stored on the server. Web sessions remain unchanged.
 * Activity automatically extends the 365-day expiry during the final 30 days.
 */
function tv_cookie(string $value, int $expires): void {
    global $config;
    setcookie('BOBOTV', $value, [
        'expires'=>$expires, 'path'=>'/', 'secure'=>empty($config['allow_insecure_localhost']),
        'httponly'=>true, 'samesite'=>'Lax'
    ]);
}
function tv_device_parts(): ?array {
    $value=(string)($_COOKIE['BOBOTV']??'');
    if (!preg_match('/^([a-f0-9]{24})\.([a-f0-9]{64})$/D', $value, $match))return null;
    return [$match[1],$match[2]];
}
function tv_restore(): ?array {
    $parts=tv_device_parts();
    if (!$parts)return null;
    [$id,$secret]=$parts;
    $record=state(static fn($db)=>$db['tv_devices'][$id]??null);
    if (!is_array($record) || !hash_equals((string)($record['hash']??''),hash('sha256',$secret)) ||
        (int)($record['expires']??0)<=time()) {
        tv_cookie('',time()-3600);
        return null;
    }
    $remaining=(int)$record['expires']-time();
    if ($remaining < 30*86400) {
        $expires=time()+365*86400;
        state(static function (&$db) use ($id,$expires) {
            if(isset($db['tv_devices'][$id]))$db['tv_devices'][$id]['expires']=$expires;
        },true);
        tv_cookie($id.'.'.$secret,$expires);
    }
    return ['user_id'=>(string)$record['user_id'],'version'=>(int)$record['version']];
}
function tv_forget(): void {
    $parts=tv_device_parts();
    if ($parts) {
        [$id,$secret]=$parts;
        state(static function (&$db) use ($id,$secret) {
            $entry=$db['tv_devices'][$id]??null;
            if(is_array($entry) && hash_equals((string)($entry['hash']??''),hash('sha256',$secret)))
                unset($db['tv_devices'][$id]);
        },true);
    }
    tv_cookie('',time()-3600);
}
function tv_remember(array $user): void {
    $id=bin2hex(random_bytes(12));
    $secret=bin2hex(random_bytes(32));
    $expires=time()+365*86400;
    $userId=(string)$user['id'];
    $version=(int)($user['session_version']??1);
    // Replace this TV's prior token rather than accumulating redundant devices.
    tv_forget();
    state(static function (&$db) use ($id,$secret,$expires,$userId,$version) {
        $db['tv_devices']=array_filter($db['tv_devices']??[],
            static fn($row)=>is_array($row) && (int)($row['expires']??0)>time());
        $owned=[];
        foreach($db['tv_devices'] as $key=>$row)if(($row['user_id']??'')===$userId)
            $owned[$key]=(int)($row['issued_at']??0);
        asort($owned);
        while(count($owned)>=10){
            $old=array_key_first($owned);unset($db['tv_devices'][$old],$owned[$old]);
        }
        $db['tv_devices'][$id]=[
            'user_id'=>$userId,'hash'=>hash('sha256',$secret),'version'=>$version,
            'issued_at'=>time(),'expires'=>$expires
        ];
    },true);
    tv_cookie($id.'.'.$secret,$expires);
}

function authenticated(): array {
    $id = $_SESSION['user_id'] ?? null;
    if (!is_string($id)) {
        $device=tv_restore();
        if ($device) {
            session_regenerate_id(true);
            $_SESSION['user_id']=$device['user_id'];
            $_SESSION['session_version']=$device['version'];
            $id=$device['user_id'];
        }
    }
    if (!is_string($id)) send_json(401,['error'=>'Accesso richiesto']);
    $user=state(function ($db) use ($id) {
        foreach ($db['users'] as $username=>$row) if (($row['id'] ?? '')===$id) return $row + ['username'=>$username];
        return null;
    });
    if (!is_array($user) || ((int)($_SESSION['session_version'] ?? 0)) !== (int)($user['session_version'] ?? 1)) {
        send_json(401,['error'=>'Sessione non valida']);
    }
    if (empty($user['email_verified_at']) && !empty($user['email'])) {
        send_json(403,['error'=>'Conferma la tua email prima di accedere']);
    }
    return $user;
}
function cropped(string $text, int $limit): string {
    return function_exists('mb_substr') ? mb_substr($text,0,$limit,'UTF-8') : substr($text,0,$limit);
}
function clean_favorites(mixed $items): array {
    if (!is_array($items) || count($items)>500) send_json(422,['error'=>'Massimo 500 titoli']);
    $out=[];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $kind=$item['type'] ?? '';$id=$item['tmdb_id'] ?? 0;
        if (!in_array($kind,['movie','tv'],true) || !is_numeric($id) || (int)$id<=0 || (int)$id>999999999999) continue;
        $key=$kind.':'.(string)(int)$id;
        if (isset($out[$key])) continue;
        $out[$key]=[
            'type'=>$kind,'tmdb_id'=>(int)$id,
            'title'=>cropped((string)($item['title'] ?? ''),180),
            'year'=>min(2200,max(0,(int)($item['year'] ?? 0))),
            'saved_at'=>cropped((string)($item['saved_at'] ?? gmdate('c')),40),
            'poster'=>bobo_poster_url($item['poster']??''),
            'genres'=>array_values(array_slice(array_filter((array)($item['genres']??[]),
              static fn($g)=>is_string($g) && strlen($g)<=60),0,10)),
            'overview'=>cropped((string)($item['overview']??''),450),
        ];
    }
    return array_values($out);
}
/** Normalize TMDB poster paths supplied by CasaFlix and older saved favorites. */
function bobo_poster_url(mixed $value): string {
    $path=trim((string)$value);
    if (preg_match('~^/[a-zA-Z0-9_-]{5,180}\.(?:jpg|jpeg|png|webp)$~D', $path))
        return 'https://image.tmdb.org/t/p/w342'.$path;
    if (preg_match('~^https://image\.tmdb\.org/t/p/(?:w[0-9]+|original)/[a-zA-Z0-9_./-]{3,200}$~D', $path))
        return $path;
    return '';
}
/** Read a minimal, public poster index; cache it outside htdocs. Never contact TMDB with a private key. */
function bobo_poster_index(): array {
    $cache=storage_dir().'/poster-index-cache.json';
    $decode=static function (string $raw): ?array {
        $value=json_decode($raw,true);
        return is_array($value) && ($value['schema']??0)===1 &&
            is_array($value['items']['movie']??null) && is_array($value['items']['tv']??null)
            ?$value['items']:null;
    };
    $previous=is_file($cache)?@file_get_contents($cache):false;
    $old=is_string($previous)?$decode($previous):null;
    if($old!==null && (time()-(int)@filemtime($cache))<21600)return $old;
    $url='https://movie.curromatteo.it/data/poster-index.json';
    $text=false;
    if(function_exists('curl_init')) {
        $ch=curl_init($url);
        curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>4,
            CURLOPT_TIMEOUT=>12,CURLOPT_MAXFILESIZE=>3000000,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_FOLLOWLOCATION=>false]);
        $text=curl_exec($ch);
        $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
        if($status!==200)$text=false;
    } else {
        $context=stream_context_create(['http'=>['timeout'=>12,'follow_location'=>0],
           'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
        $text=@file_get_contents($url,false,$context,0,3000001);
    }
    if(is_string($text) && strlen($text)<=3000000 && ($new=$decode($text))!==null) {
        // Failure to refresh cache must not prevent an admin from viewing favorites.
        $tmp=$cache.'.'.bin2hex(random_bytes(4)).'.tmp';
        if(@file_put_contents($tmp,$text,LOCK_EX)!==false){@chmod($tmp,0600);@rename($tmp,$cache);}
        else @unlink($tmp);
        return $new;
    }
    return $old??['movie'=>[],'tv'=>[]];
}

// The browser can only call state-changing methods from the approved Bobo origin.
$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
if (in_array($method,['POST','PUT','PATCH','DELETE'],true) && !in_array($origin,$allowedOrigins,true) &&
    !(($method==='POST') && (($_GET['route']??'')==='jobs/newsletter'))) {
    send_json(403,['error'=>'Origine richiesta non autorizzata']);
}
$secure = empty($config['allow_insecure_localhost']);
ini_set('session.use_strict_mode','1');
ini_set('session.use_only_cookies','1');
session_name('BOBOSESSID');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Lax']);
session_start();
$route = (string)($_GET['route'] ?? 'health');
// GitHub Actions schedule calls this endpoint with a server-only shared secret.
// Neither the secret nor the Resend API key is exposed in the site's JavaScript.
if ($route==='jobs/newsletter' && $method==='POST') {
    $secret=(string)($config['newsletter_secret'] ?? '');
    $provided=(string)($_SERVER['HTTP_X_BOBO_NEWSLETTER_SECRET'] ?? '');
    if (strlen($secret)<40 || strlen($provided)<40 || !hash_equals($secret,$provided)) {
        send_json(403,['error'=>'Servizio newsletter non autorizzato']);
    }
    if (!bobo_mail_configured()) send_json(503,['error'=>'Resend non configurato']);
    $digest=bobo_newsletter_load_digest($config);
    if ($digest===null) send_json(503,['error'=>'Feed newsletter non disponibile']);
    $week=gmdate('o-\WW');
    $sent=0;$failed=0;$skipped=0;
    // Two recipients per HTTP request: stay below shared-host PHP timeouts.
    // The weekly GitHub Action calls again until the batch is empty.
    for ($i=0;$i<2;$i++) {
        $claim=state(function (&$db) use($week) {
            foreach ($db['users'] as $name=>&$row) {
                if (!bobo_newsletter_subscribed($row) || empty($row['email_verified_at']) ||
                    !filter_var($row['email']??'',FILTER_VALIDATE_EMAIL) ||
                    ($row['newsletter_sent_week']??'')===$week)continue;
                $lease=$row['newsletter_lease']??null;
                if (is_array($lease) && ($lease['until']??0)>time())continue;
                $nonce=bin2hex(random_bytes(12));
                $row['newsletter_lease']=['week'=>$week,'until'=>time()+180,'nonce'=>$nonce];
                return ['id'=>$row['id'],'username'=>$name,'email'=>$row['email'],'nonce'=>$nonce];
            }
            return null;
        },true);
        if (!$claim) break;
        $id=$claim['id'];$nonce=$claim['nonce'];$username=$claim['username'];
        $link=bobo_newsletter_unsubscribe_link($config,$id);
        [$subject,$plain,$html]=bobo_newsletter_compose($digest,$username,$link);
        $ok=bobo_send_email($config,$claim['email'],$subject,$plain,$html);
        state(function (&$db) use ($claim,$week,$ok,$nonce) {
            $name=$claim['username'];
            if (!isset($db['users'][$name]) || ($db['users'][$name]['id']??'')!==$claim['id'])return;
            $row=&$db['users'][$name];
            if (($row['newsletter_lease']['nonce']??'')!==$nonce)return;
            unset($row['newsletter_lease']);
            if($ok)$row['newsletter_sent_week']=$week;
            else $row['newsletter_failed_at']=gmdate('c');
        },true);
        if($ok)$sent++;else { $failed++; break; }
    }
    send_json(200,['ok'=>true,'week'=>$week,'sent'=>$sent,'failed'=>$failed]);
}
if ($route==='newsletter/unsubscribe' && $method==='POST') {
    $input=request_json();
    $id=(string)($input['id']??'');$token=(string)($input['token']??'');
    if(!preg_match('/^[a-f0-9]{24}$/D',$id) || !preg_match('/^[a-f0-9]{64}$/D',$token))
        send_json(422,['error'=>'Link non valido']);
    rate_limit('newsletter-unsubscribe');
    $secret=(string)($config['newsletter_secret']??'');
    $expected=hash_hmac('sha256','unsubscribe:'.$id,$secret);
    if(strlen($secret)<40 || !hash_equals($expected,$token))send_json(403,['error'=>'Link non valido']);
    state(function (&$db) use($id) {
        foreach($db['users'] as &$row)if(($row['id']??'')===$id){
            $row['newsletter_subscribed_at']=null;
            unset($row['newsletter_lease']);
            break;
        }
    },true);
    send_json(200,['ok'=>true,'message'=>'Iscrizione alla newsletter annullata']);
}
if ($route==='health' && $method==='GET') send_json(200,['ok'=>true,'service'=>'bobo-accounts','version'=>5,'mail_configured'=>bobo_mail_configured(),'newsletter_ready'=>strlen((string)($config['newsletter_secret']??''))>=40,'registration_mode'=>(($config['registration_mode'] ?? 'open')==='invite' ? 'invite' : 'open')]);
if ($route==='register' && $method==='POST') {
    $input=request_json();
    $name=normalized_name($input['username'] ?? '');
    $password=validate_password($input['password'] ?? null);
    $email=normalized_email($input['email'] ?? '');
    // Open registration is intentional for the small Bobo friends community.
    // Switch to 'invite' in config.local.php if public signups become a problem.
    if (($config['registration_mode'] ?? 'open')==='invite') {
        $hash=$config['invitation_hash'] ?? '';
        if (!is_string($hash) || $hash==='' || !password_verify((string)($input['invite']??''),$hash)) {
            send_json(403,['error'=>'Codice invito non valido']);
        }
    }
    if (!bobo_mail_configured()) send_json(503,['error'=>'Invio email non ancora configurato']);
    rate_limit('register-global');
    rate_limit('register:'.$name);
    $verification=bin2hex(random_bytes(32));
    $result=state(function (&$db) use($name,$password,$email,$verification) {
        if (isset($db['users'][$name])) return null;
        foreach ($db['users'] as $other) {
            if (strtolower((string)($other['email'] ?? ''))===$email) return null;
        }
        $id=bin2hex(random_bytes(12));
        $db['users'][$name]=[
            'id'=>$id, 'email'=>$email,
            'email_verified_at'=>null,
            'verification_hash'=>hash('sha256',$verification),
            'verification_expires'=>time()+86400,
            'verification_last_sent'=>time(),
            'password_hash'=>password_hash($password,PASSWORD_DEFAULT),
            'recovery_hash'=>'', 'role'=>'user', 'session_version'=>1,
            'created_at'=>gmdate('c'), 'favorites'=>[],
        ];
        return ['id'=>$id];
    },true);
    if (!$result) send_json(409,['error'=>'Username o email già in uso']);
    $link=email_link('verify',$verification);
    $mail=bobo_send_email($config,$email,'Conferma il tuo account Bobo',
        "Ciao $name,\n\nconferma il tuo indirizzo email per attivare Bobo Movie Night:\n$link\n\n" .
        "Il collegamento scade tra 24 ore. Se non hai richiesto un account, ignora il messaggio.\n");
    if (!$mail) {
        state(function (&$db) use ($name,$result) {
            if (isset($db['users'][$name]) && ($db['users'][$name]['id']??'')===$result['id'] &&
                empty($db['users'][$name]['email_verified_at'])) unset($db['users'][$name]);
        },true);
        send_json(503,['error'=>'Email non disponibile. Verifica la configurazione Resend e riprova.']);
    }
    send_json(201,['ok'=>true,'message'=>'Controlla la posta e conferma l’account entro 24 ore.']);
}
if ($route==='verify-email' && $method==='POST') {
    $input=request_json();
    $token=valid_token($input['token']??null);
    rate_limit('verify-global');
    $result=state(function (&$db) use($token) {
        foreach ($db['users'] as $name=>&$row) {
            $matches=hash_equals((string)($row['verification_hash']??''),hash('sha256',$token));
            if (!$matches || time()>(int)($row['verification_expires']??0)) continue;
            $recovery=bin2hex(random_bytes(24));
            $row['verification_hash']=null;
            $row['verification_expires']=null;
            $row['email_verified_at']=gmdate('c');
            if (!array_key_exists('newsletter_subscribed_at',$row))$row['newsletter_subscribed_at']=gmdate('c');
            $row['recovery_hash']=hash('sha256',$recovery);
            return ['id'=>$row['id'],'username'=>$name,'recovery_code'=>$recovery,
                'session_version'=>(int)($row['session_version']??1)];
        }
        return null;
    },true);
    if (!$result)send_json(400,['error'=>'Collegamento non valido o scaduto']);
    session_regenerate_id(true);
    $_SESSION['user_id']=$result['id'];
    $_SESSION['session_version']=$result['session_version'];
    send_json(200,['username'=>$result['username'],'recovery_code'=>$result['recovery_code']]);
}
if ($route==='resend-verification' && $method==='POST') {
    $input=request_json();
    $email=normalized_email($input['email']??'');
    rate_limit('verify-resend-global');
    rate_limit('verify-resend:'.$email);
    $token=bin2hex(random_bytes(32));
    $result=state(function (&$db) use($email,$token) {
        foreach ($db['users'] as $name=>&$row) {
            if (($row['email']??'')!==$email || !empty($row['email_verified_at']))continue;
            if (time()-(int)($row['verification_last_sent']??0)<180)return null;
            $row['verification_hash']=hash('sha256',$token);
            $row['verification_expires']=time()+86400;
            $row['verification_last_sent']=time();
            return $name;
        }
        return null;
    },true);
    if ($result && bobo_mail_configured()) {
        $url=email_link('verify',$token);
        bobo_send_email($config,$email,'Conferma il tuo account Bobo',
            "Ciao $result,\n\nconferma il tuo account:\n$url\n\nIl link scade tra 24 ore.\n");
    }
    send_json(200,['ok'=>true,'message'=>'Se esiste un account da confermare, riceverai un nuovo messaggio.']);
}
if ($route==='login' && $method==='POST') {
    $input=request_json();$name=normalized_name($input['username']??'');
    rate_limit('login:'.$name);
    $row=state(static fn($db)=>$db['users'][$name]??null);
    if (!is_array($row)||!password_verify((string)($input['password']??''),(string)($row['password_hash']??''))) {
        send_json(401,['error'=>'Credenziali non valide']);
    }
    if (!empty($row['email']) && empty($row['email_verified_at'])) {
        send_json(403,['error'=>'Conferma prima il tuo indirizzo email']);
    }
    session_regenerate_id(true);
    $_SESSION['user_id']=$row['id'];
    $_SESSION['session_version']=(int)($row['session_version']??1);
    send_json(200,['username'=>$name,'role'=>$row['role']]);
}
if ($route==='request-reset' && $method==='POST') {
    $input=request_json();
    $email=normalized_email($input['email']??'');
    rate_limit('password-reset-global');
    rate_limit('password-reset:'.$email);
    $token=bin2hex(random_bytes(32));
    $result=state(function (&$db) use($email,$token) {
        foreach ($db['users'] as $name=>&$row) {
            if (($row['email']??'')!==$email || empty($row['email_verified_at'])) continue;
            if (time()-(int)($row['reset_last_sent']??0)<180) return null;
            $row['reset_hash']=hash('sha256',$token);
            $row['reset_expires']=time()+1800;
            $row['reset_last_sent']=time();
            return $name;
        }
        return null;
    },true);
    if ($result && bobo_mail_configured()) {
        $link=email_link('reset',$token);
        bobo_send_email($config,$email,'Reimposta la password di Bobo Movie Night',
            "Ciao $result,\n\nper scegliere una nuova password apri questo link:\n$link\n\n" .
            "Il link scade tra 30 minuti e può essere usato una sola volta.\n" .
            "Se non lo hai richiesto, ignora questa email.\n");
    }
    // Do not reveal whether the address has an account.
    send_json(200,['ok'=>true,'message'=>'Se esiste un account associato, riceverai un link entro pochi minuti.']);
}
if ($route==='reset-password' && $method==='POST') {
    $input=request_json();
    $token=valid_token($input['token']??null);
    $password=validate_password($input['new_password']??null);
    rate_limit('password-reset-confirm-global');
    $result=state(function (&$db) use($token,$password) {
        foreach ($db['users'] as $name=>&$row) {
            if (!hash_equals((string)($row['reset_hash']??''),hash('sha256',$token)) ||
                time()>(int)($row['reset_expires']??0)) continue;
            $row['password_hash']=password_hash($password,PASSWORD_DEFAULT);
            $row['reset_hash']=null;
            $row['reset_expires']=null;
            $row['session_version']=(int)($row['session_version']??1)+1;
            return ['username'=>$name,'id'=>$row['id'],'session_version'=>$row['session_version']];
        }
        return null;
    },true);
    if (!$result)send_json(400,['error'=>'Link non valido o scaduto']);
    session_regenerate_id(true);
    $_SESSION['user_id']=$result['id'];
    $_SESSION['session_version']=$result['session_version'];
    send_json(200,['ok'=>true,'username'=>$result['username']]);
}
if ($route==='recover' && $method==='POST') {
    $input=request_json();$name=normalized_name($input['username']??'');
    $password=validate_password($input['new_password']??null);
    $code=strtolower((string)($input['recovery_code']??''));
    rate_limit('recover:'.$name);
    if (!preg_match('/^[0-9a-f]{48}$/D',$code)) send_json(401,['error'=>'Codice non valido']);
    $result=state(function (&$db) use($name,$code,$password) {
        if (!isset($db['users'][$name]) ||
            !hash_equals((string)($db['users'][$name]['recovery_hash']??''),hash('sha256',$code))) return null;
        $next=bin2hex(random_bytes(24));
        $db['users'][$name]['password_hash']=password_hash($password,PASSWORD_DEFAULT);
        $db['users'][$name]['recovery_hash']=hash('sha256',$next);
        $db['users'][$name]['session_version']=(int)($db['users'][$name]['session_version']??1)+1;
        return ['id'=>$db['users'][$name]['id'],'recovery_code'=>$next,
                'session_version'=>$db['users'][$name]['session_version']];
    },true);
    if (!$result)send_json(401,['error'=>'Codice non valido']);
    session_regenerate_id(true);$_SESSION['user_id']=$result['id'];
    $_SESSION['session_version']=$result['session_version'];
    send_json(200,$result);
}
if ($route==='logout' && $method==='POST') {
    tv_forget();
    $_SESSION=[];session_destroy();send_json(200,['ok'=>true]);
}
$user=authenticated();
if ($route==='tv/remember' && $method==='POST') {
    request_json();
    tv_remember($user);
    send_json(200,['ok'=>true,'lifetime_days'=>365]);
}
if ($route==='me' && $method==='GET') send_json(200,[
    'username'=>$user['username'],'role'=>$user['role'],
    'email'=>$user['email']??null,'email_verified'=>(bool)($user['email_verified_at']??null),
    'favorites_count'=>count($user['favorites'] ?? []),
]);
if ($route==='newsletter' && $method==='GET') send_json(200,[
    'subscribed'=>bobo_newsletter_subscribed($user),
    'email'=>$user['email']??null,
    'frequency'=>'weekly',
]);
if ($route==='newsletter' && $method==='PUT') {
    $input=request_json();
    if (!is_bool($input['subscribed']??null))send_json(422,['error'=>'Preferenza non valida']);
    $requested=$input['subscribed'];
    $name=$user['username'];$id=$user['id'];
    if($requested && empty($user['email_verified_at']))send_json(403,['error'=>'Verifica prima la tua email']);
    if($requested && strlen((string)($config['newsletter_secret']??''))<40)
        send_json(503,['error'=>'Newsletter non ancora attivata dal gestore']);
    state(function (&$db) use($name,$id,$requested) {
        if(!isset($db['users'][$name])||$db['users'][$name]['id']!==$id)
            send_json(401,['error'=>'Sessione scaduta']);
        $row=&$db['users'][$name];
        $row['newsletter_subscribed_at']=$requested?($row['newsletter_subscribed_at']??gmdate('c')):null;
        if(!$requested)unset($row['newsletter_lease']);
    },true);
    send_json(200,['ok'=>true,'subscribed'=>$requested]);
}
// Single preview to the signed-in admin's verified address. Does not mark weekly delivery.
if ($route==='admin/newsletter/test' && $method==='POST') {
    request_json();
    if (($user['role']??'')!=='admin')send_json(403,['error'=>'Solo gli amministratori possono inviare una prova']);
    if (empty($user['email_verified_at']) || !filter_var($user['email']??'',FILTER_VALIDATE_EMAIL))
        send_json(403,['error'=>'Verifica prima la tua email']);
    if (!bobo_mail_configured())send_json(503,['error'=>'Invio email non configurato']);
    if (strlen((string)($config['newsletter_secret']??''))<40)
        send_json(503,['error'=>'Configura prima il segreto newsletter']);
    rate_limit('newsletter-test:'.$user['id']);
    $digest=bobo_newsletter_load_digest($config);
    if ($digest===null)send_json(503,['error'=>'Feed newsletter non disponibile']);
    $unsubscribe=bobo_newsletter_unsubscribe_link($config,$user['id']);
    [$subject,$plain,$html]=bobo_newsletter_compose($digest,$user['username'],$unsubscribe);
    $subject='[PROVA] '.$subject;
    $plain="Questa è una prova inviata solo all'amministratore.\\n\\n".$plain;
    $sent=bobo_send_email($config,$user['email'],$subject,$plain,$html);
    if(!$sent)send_json(502,['error'=>'Resend non ha accettato il messaggio di prova']);
    send_json(200,['ok'=>true,'message'=>'Newsletter di prova inviata alla tua email']);
}
if ($route==='favorites' && $method==='GET') send_json(200,['items'=>$user['favorites']??[]]);
// One atomic action instead of GET collection + PUT collection.
// This avoids lost updates when the web app and TV change favorites concurrently.
if ($route==='favorites/toggle' && $method==='POST') {
    $input=request_json();
    $items=clean_favorites([$input['item']??null]);
    if(count($items)!==1)send_json(422,['error'=>'Titolo non valido']);
    $item=$items[0];
    $name=$user['username'];$id=$user['id'];
    $result=state(static function (&$db) use ($name,$id,$item) {
        if (!isset($db['users'][$name])||$db['users'][$name]['id']!==$id)
            return ['error'=>'Sessione scaduta'];
        $list=$db['users'][$name]['favorites']??[];
        $found=null;
        foreach($list as $i=>$entry){
            if(($entry['type']??'')===$item['type'] &&
                (int)($entry['tmdb_id']??0)===(int)$item['tmdb_id']){$found=$i;break;}
        }
        if($found!==null){array_splice($list,$found,1);$saved=false;}
        else {
            if(count($list)>=500)return ['error'=>'Massimo 500 titoli'];
            array_unshift($list,$item);$saved=true;
        }
        $db['users'][$name]['favorites']=$list;
        return ['saved'=>$saved,'items'=>$list,'count'=>count($list)];
    },true);
    if(isset($result['error']))send_json($result['error']==='Sessione scaduta'?401:422,$result);
    send_json(200,$result);
}
if ($route==='favorites' && $method==='PUT') {
    $input=request_json();$items=clean_favorites($input['items']??null);
    $name=$user['username'];$id=$user['id'];
    state(function (&$db) use($name,$id,$items){
        if (!isset($db['users'][$name])||$db['users'][$name]['id']!==$id) send_json(401,['error'=>'Sessione scaduta']);
        $db['users'][$name]['favorites']=$items;
        return null;
    },true);
    send_json(200,['ok'=>true,'count'=>count($items)]);
}
if ($route==='admin/users' && $method==='GET') {
    if (($user['role']??'')!=='admin')send_json(403,['error'=>'Accesso admin richiesto']);
    $users=state(function($db){
        $list=[];
        foreach($db['users'] as $name=>$u){
            $list[]=['username'=>$name,'email'=>$u['email']??null,
              'email_verified'=>(bool)($u['email_verified_at']??null),
              'role'=>$u['role']??'user',
              'created_at'=>$u['created_at']??'', 'favorites_count'=>count($u['favorites']??[]),
              'newsletter_subscribed'=>bobo_newsletter_subscribed($u)];
        }
        usort($list,static fn($a,$b)=>strcmp($a['username'],$b['username']));
        return $list;
    });
    send_json(200,['users'=>$users,'count'=>count($users)]);
}
if ($route==='admin/favorites' && $method==='GET') {
    if (($user['role']??'')!=='admin')send_json(403,['error'=>'Accesso admin richiesto']);
    $name=normalized_name($_GET['username']??'');
    $result=state(function ($db) use($name) {
        $target=$db['users'][$name]??null;
        if (!$target)return null;
        return [
            'username'=>$name,'favorites'=>array_values($target['favorites']??[]),
            'count'=>count($target['favorites']??[]),
        ];
    });
    if(!$result)send_json(404,['error'=>'Utente non trovato']);
    $missing=false;
    foreach($result['favorites'] as $favorite) {
        if(bobo_poster_url($favorite['poster']??'')===''){$missing=true;break;}
    }
    $images=$missing?bobo_poster_index():['movie'=>[],'tv'=>[]];
    foreach($result['favorites'] as &$favorite) {
        $poster=bobo_poster_url($favorite['poster']??'');
        if(!$poster) {
            $kind=(string)($favorite['type']??'');
            $id=(string)($favorite['tmdb_id']??'');
            $poster=bobo_poster_url($images[$kind][$id]??'');
        }
        $favorite['poster']=$poster;
    }
    unset($favorite);
    send_json(200,$result);
}
send_json(404,['error'=>'Endpoint sconosciuto']);
