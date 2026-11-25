<?php
declare(strict_types=1);
/** Send transactional email using Resend REST API, without Composer, SMTP or PHP mail().
 * Config and API key live outside the public document root.
 */
function bobo_send_email(array $config, string $to, string $subject, string $body, ?string $html=null): bool {
    $key = trim((string)($config['resend_api_key'] ?? ''));
    $from = trim((string)($config['resend_from'] ?? ''));
    if ($key === '' || $from === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        error_log('Bobo mail: configuration missing or recipient invalid.');
        return false;
    }
    $message=['from'=>$from,'to'=>[$to],'subject'=>$subject,'text'=>$body];
    if($html!==null)$message['html']=$html;
    $payload = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $endpoint = 'https://api.resend.com/emails';
    $status = 0;
    $response = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $key,
                'Content-Type: application/json',
                'Accept: application/json',
                'User-Agent: BoboMovieNight/1.0',
            ],
        ]);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } elseif (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        // Gandi PHP may not expose ext-curl; HTTPS streams are sufficient.
        $opts = [
            'http' => [
                'method' => 'POST',
                'header' => "Authorization: Bearer $key\r\nContent-Type: application/json\r\nAccept: application/json\r\nUser-Agent: BoboMovieNight/1.0\r\n",
                'content' => $payload,
                'timeout' => 12,
                'ignore_errors' => true,
                'follow_location' => 0,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ];
        $response = @file_get_contents($endpoint, false, stream_context_create($opts));
        foreach ($http_response_header ?? [] as $header) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~i', $header, $m)) $status = (int)$m[1];
        }
    }
    $parsed = is_string($response) ? json_decode($response, true) : null;
    $success = $status >= 200 && $status < 300 && is_array($parsed) && is_string($parsed['id'] ?? null);
    if (!$success) {
        // Never log a password-reset token, recipient, email content or API key.
        error_log('Bobo Resend API returned non-success (status ' . $status . ').');
    }
    return $success;
}
