<?php
declare(strict_types=1);
/** Weekly Bobo editorial digest: safe public catalog metadata, private recipients. */
function bobo_newsletter_load_digest(array $config): ?array {
    $url='https://movie.curromatteo.it/data/newsletter.json';
    $result=false;$status=0;
    if(function_exists('curl_init')) {
        $ch=curl_init($url);
        curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>6,
            CURLOPT_TIMEOUT=>18,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXFILESIZE=>300000]);
        $result=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context=stream_context_create(['http'=>['timeout'=>18,'follow_location'=>0],
            'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
        $result=@file_get_contents($url,false,$context,0,300001);
        foreach($http_response_header??[] as $header)if(preg_match('~^HTTP/\S+\s+(\d{3})~',$header,$m))$status=(int)$m[1];
    }
    if(!is_string($result)||strlen($result)>300000||$status!==200)return null;
    $data=json_decode($result,true);
    if(!is_array($data)||($data['schema']??0)!==1 || !isset($data['platforms'])||!is_array($data['platforms']))return null;
    // Only catalog entities: no embedded HTML or untrusted outgoing links.
    return $data;
}
function bobo_newsletter_unsubscribe_link(array $config, string $id): string {
    $secret=(string)($config['newsletter_secret']??'');
    if(strlen($secret)<40)throw new RuntimeException('Newsletter secret not configured');
    $token=hash_hmac('sha256','unsubscribe:'.$id,$secret);
    return rtrim((string)$config['api_origin'],'/').'/unsubscribe.html#id='.rawurlencode($id).'&token='.$token;
}
function bobo_newsletter_valid_item(mixed $raw): ?array {
    if(!is_array($raw))return null;
    $id=(string)($raw['tmdb_id']??'');
    $type=(string)($raw['type']??'');
    if(!preg_match('/^[1-9][0-9]{0,11}$/D',$id)||!in_array($type,['movie','tv'],true))return null;
    $title=trim((string)($raw['title']??''));
    if($title==='')return null;
    $poster=(string)($raw['poster']??'');
    if(!preg_match('~^https://image\.tmdb\.org/t/p/(?:w\d+|original)/[a-zA-Z0-9_/.-]{3,200}$~D',$poster))$poster='';
    return ['tmdb_id'=>$id,'type'=>$type,'title'=>substr($title,0,160),
        'poster'=>$poster,'year'=>(int)($raw['year']??0)];
}
function bobo_newsletter_compose(array $feed,string $username,string $unsubscribe): array {
    $title='BOBO / Le novità streaming della settimana';
    $safe=static fn(string $value):string=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $sections=[];
    $weekly=is_array($feed['weekly']??null)?array_slice($feed['weekly'],0,6):[];
    if($weekly)$sections[]=['Novità segnalate questa settimana',$weekly];
    $labels=['netflix'=>'Netflix','prime'=>'Prime Video','disney'=>'Disney+','apple'=>'Apple TV+'];
    foreach($feed['platforms'] as $entry){
        if(!is_array($entry)||!isset($labels[$entry['id']??'']))continue;
        $items=is_array($entry['items']??null)?array_slice($entry['items'],0,4):[];
        if($items)$sections[]=['Nel catalogo italiano di '.$labels[$entry['id']], $items];
    }
    $paragraphs=[];$blocks=[];
    foreach($sections as [$heading,$rows]){
        $cells=[];$lines=[];
        foreach($rows as $raw){
            $item=bobo_newsletter_valid_item($raw);if(!$item)continue;
            $label=$item['title'].($item['year']?' ('.$item['year'].')':'');
            $url='https://movie.curromatteo.it/watch.html?type='.$item['type'].'&id='.$item['tmdb_id'];
            $image=$item['poster']?'<img src="'.$safe($item['poster']).'" alt="" width="90" style="width:90px;max-width:100%;height:auto;display:block;border-radius:5px;border:0">':'';
            $cells[]='<td width="50%" valign="top" style="padding:9px 9px 17px">'.
                '<a href="'.$safe($url).'" style="color:#dff3ef;text-decoration:none">'.$image.
                '<span style="font-size:14px;font-weight:700;line-height:1.4;display:block;padding-top:8px">'.$safe($label).'</span></a>'.
                '<span style="font-size:11px;color:#8da8ac">'.($item['type']==='tv'?'Serie TV':'Film').'</span></td>';
            $lines[]='• '.$label.' — '.$url;
        }
        if(!$cells)continue;
        $paragraphs[]=$heading."\n".implode("\n",$lines);
        $rowsHtml='';
        for($i=0;$i<count($cells);$i+=2)$rowsHtml.='<tr>'.$cells[$i].($cells[$i+1]??'<td width="50%"></td>').'</tr>';
        $blocks[]='<h2 style="font-size:19px;color:#c0e7df;font-weight:650;margin:30px 0 10px">'.$safe($heading).'</h2>'.
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;border-collapse:collapse"><tbody>'.$rowsHtml.'</tbody></table>';
    }
    $safeName=$safe($username);
    $html='<!doctype html><html lang="it"><head><meta charset="utf-8"></head>'.
        '<body style="margin:0;padding:24px 10px;background:#0d1821;color:#e7f1f0;font-family:Arial,Helvetica,sans-serif">'.
        '<div style="max-width:560px;margin:0 auto;background:#172630;border:1px solid #38565d;border-radius:9px;padding:26px">'.
        '<div style="color:#a8ded4;font-size:12px;letter-spacing:2px">BOBO / MOVIE NIGHT</div>'.
        '<h1 style="font-size:29px;letter-spacing:-1px;line-height:1.2;margin:12px 0">Cosa si guarda questa settimana?</h1>'.
        '<p style="color:#adbdc2;font-size:14px;line-height:1.55">Ciao '.$safeName.', ecco una selezione dalle principali piattaforme italiane. I titoli sono collegati al catalogo Bobo.</p>'.
        implode('',$blocks).
        '<p style="color:#92aab0;font-size:11px;line-height:1.6;margin-top:25px">Le disponibilità sono segnalazioni editoriali e possono cambiare; non indicano il provider del player incorporato.</p>'.
        '<hr style="border:0;border-top:1px solid #34525a;margin:20px 0">'.
        '<p style="color:#91a6aa;font-size:11px;line-height:1.6">Ricevi questo riepilogo come membro del piccolo club Bobo; puoi disiscriverti in qualsiasi momento. '.
        '<a href="'.$safe($unsubscribe).'" style="color:#b8e5dd">Annulla iscrizione</a> · '.
        '<a href="https://movieaccount.curromatteo.it/account.html?view=settings" style="color:#b8e5dd">Gestisci preferenze</a></p>'.
        '</div></body></html>';
    $plain="Ciao $username,\n\n".implode("\n\n",$paragraphs)."\n\nLe disponibilità possono cambiare.\n\nAnnulla iscrizione: $unsubscribe\n";
    return [$title,$plain,$html];
}
