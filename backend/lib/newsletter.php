<?php
declare(strict_types=1);
require_once __DIR__.'/newsletter-magazine.php';
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
    if(!is_array($data)||!in_array(($data['schema']??0),[1,2],true) || !isset($data['platforms'])||!is_array($data['platforms']))return null;
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
        'poster'=>$poster,'year'=>(int)($raw['year']??0),
        'overview'=>substr(trim((string)($raw['overview']??'')),0,220)];
}
/**
 * Email layout uses inline styles and presentation tables (Gmail/Outlook safe).
 * Spotlight + a maximum of six compact recommendations, with readable posters.
 */
function bobo_newsletter_compose(array $feed,string $username,string $unsubscribe): array {
    if(($feed['magazine_schema']??0)===2)return bobo_newsletter_compose_magazine($feed,$username,$unsubscribe);
    $safe=static fn(string $value):string=>htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $short=static function(string $value,int $limit=155):string {
        $value=trim(preg_replace('/\s+/u',' ',$value)??$value);
        if(function_exists('mb_strlen') && mb_strlen($value,'UTF-8')<=$limit)return $value;
        if(!function_exists('mb_strlen') && strlen($value)<=$limit)return $value;
        $cut=function_exists('mb_substr')?mb_substr($value,0,$limit,'UTF-8'):substr($value,0,$limit);
        $end=strrpos($cut,' ');
        return rtrim($end!==false && $end>50?substr($cut,0,$end):$cut,' .,;:')."…";
    };
    $sections=[];
    $seen=[];
    $add=static function(array $rows,int $limit) use (&$seen):array {
        $out=[];
        foreach($rows as $raw){
            $item=bobo_newsletter_valid_item($raw);
            if(!$item)continue;
            $key=$item['type'].':'.$item['tmdb_id'];
            if(isset($seen[$key]))continue;
            $seen[$key]=true;
            $out[]=$item;
            if(count($out)>=$limit)break;
        }
        return $out;
    };
    $weekly=$add(is_array($feed['weekly']??null)?$feed['weekly']:[],3);
    if($weekly)$sections[]=['Da vedere questa settimana',$weekly];
    if(is_array($feed['sections']??null)){
        foreach($feed['sections'] as $entry){
            if(count($sections)>=3)break;
            if(!is_array($entry)||!is_array($entry['items']??null))continue;
            $title=trim((string)($entry['title']??'Da scoprire'));
            $rows=$add($entry['items'],2);
            if($rows)$sections[]=[$short($title,60),$rows];
        }
    }
    if(count($sections)===0){
        $labels=['netflix'=>'Netflix','prime'=>'Prime Video','disney'=>'Disney+','apple'=>'Apple TV+'];
        foreach(($feed['platforms']??[]) as $entry){
            if(count($sections)>=3)break;
            if(!is_array($entry)||!isset($labels[$entry['id']??'']))continue;
            $rows=$add(is_array($entry['items']??null)?$entry['items']:[],2);
            if($rows)$sections[]=['Da scoprire su '.$labels[$entry['id']],$rows];
        }
    }
    $title='BOBO / Cosa guardare questa settimana';
    $lead=$sections[0][1][0]??null;
    $total=array_sum(array_map(static fn(array $section):int=>count($section[1]),$sections));
    $plain="Ciao $username,\n\nUna selezione di $total film e serie da scoprire questa settimana.\n\n";
    $htmlSections='';
    $leadBlock='';
    if($lead!==null){
        $url='https://movie.curromatteo.it/watch.html?type='.$lead['type'].'&id='.$lead['tmdb_id'];
        $name=$safe($lead['title']);
        $genre=$lead['type']==='tv'?'SERIE TV':'FILM';
        $year=$lead['year']?:'';
        $description=$safe($short($lead['overview']?:'Un titolo da scoprire nella selezione di questa settimana.',205));
        $poster=$lead['poster']?'<img class="bobo-lead-image" src="'.$safe($lead['poster']).'" width="168" alt="" style="display:block;width:168px;max-width:100%;height:auto;border:0;border-radius:7px">':'';
        $leadBlock='<tr><td class="bobo-padding" style="padding:7px 28px 28px">'.
          '<div style="font:700 11px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.8px;color:#a4d9d4;margin-bottom:14px">IL CONSIGLIO DELLA SETTIMANA</div>'.
          '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;background:#182a35;border:1px solid #35515b;border-radius:10px"><tr>'.
          '<td valign="top" width="168" style="width:168px;padding:15px 0 15px 15px">'.$poster.'</td>'.
          '<td class="bobo-lead-copy" valign="top" style="padding:17px 18px 16px 20px">'.
          '<span style="font:700 10px/1.3 Arial,Helvetica,sans-serif;letter-spacing:1px;color:#9fc8c5">'.$genre.($year?' · '.$year:'').'</span>'.
          '<h2 style="font:700 22px/1.2 Arial,Helvetica,sans-serif;letter-spacing:-.6px;color:#f0f4f5;margin:10px 0 9px">'.$name.'</h2>'.
          '<p style="font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#bacbd0;margin:0 0 16px">'.$description.'</p>'.
          '<a href="'.$safe($url).'" style="display:inline-block;padding:10px 13px;background:#a4d9d4;border-radius:5px;color:#112832;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none">Scopri il titolo →</a>'.
          '</td></tr></table></td></tr>';
    }
    $first=true;
    foreach($sections as [$heading,$entries]){
        $cards=[];
        foreach($entries as $idx=>$item){
            $label=$item['title'].($item['year']?' ('.$item['year'].')':'');
            $url='https://movie.curromatteo.it/watch.html?type='.$item['type'].'&id='.$item['tmdb_id'];
            $plain.='• '.$label.' — '.$url."\n";
            if($first && $idx===0)continue;
            $name=$safe($item['title']);
            $poster=$item['poster']?
                '<img src="'.$safe($item['poster']).'" alt="" width="142" style="display:block;width:142px;max-width:100%;height:auto;border:0;border-radius:6px">':
                '<span style="display:block;padding:20px;background:#22333f;color:#bdcbd1">'.$name.'</span>';
            $kind=$item['type']==='tv'?'SERIE TV':'FILM';
            $blurb=$safe($short($item['overview'],130));
            $cards[]='<td class="bobo-card-cell" width="50%" valign="top" style="width:50%;padding:7px">'.
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="height:100%;border:1px solid #304853;border-radius:8px;background:#152530"><tr><td valign="top" style="padding:14px">'.
              '<a href="'.$safe($url).'" style="color:#f0f4f5;text-decoration:none">'.$poster.
              '<span style="display:block;font:700 15px/1.35 Arial,Helvetica,sans-serif;margin-top:11px;color:#f0f4f5">'.$name.'</span></a>'.
              '<span style="display:block;font:700 10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.6px;color:#92c4c0;margin:5px 0 8px">'.$kind.($item['year']?' · '.$item['year']:'').'</span>'.
              ($blurb?'<p style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#b2c2c9;margin:0 0 9px">'.$blurb.'</p>':'').
              '<a href="'.$safe($url).'" style="color:#a4d9d4;font:700 11px/1.4 Arial,Helvetica,sans-serif;text-decoration:none">Apri la scheda →</a>'.
              '</td></tr></table></td>';
        }
        $first=false;
        if($cards){
            $tableRows='';
            for($i=0;$i<count($cards);$i+=2){
                $tableRows.='<tr>'.$cards[$i].($cards[$i+1]??'<td width="50%" valign="top" style="width:50%;padding:7px"></td>').'</tr>';
            }
            $htmlSections.='<tr><td class="bobo-padding" style="padding:8px 21px 12px">'.
              '<h2 style="font:700 20px/1.35 Arial,Helvetica,sans-serif;letter-spacing:-.35px;color:#e0efef;margin:16px 7px 9px">'.$safe($heading).'</h2>'.
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">'.$tableRows.'</table>'.
              '</td></tr>';
        }
        $plain.="\n";
    }
    $safeName=$safe($username);
    $safeUnsubscribe=$safe($unsubscribe);
    $preheader='Pochi titoli selezionati, locandine e consigli per la tua prossima serata.';
    $html='<!doctype html><html lang="it"><head><meta charset="utf-8">'.
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$safe($title).'</title>'.
      '<style>@media only screen and (max-width:600px){.bobo-shell{width:100%!important}.bobo-padding{padding-left:16px!important;padding-right:16px!important}.bobo-lead-image{width:118px!important}.bobo-lead-copy{padding:13px!important}.bobo-lead-copy h2{font-size:18px!important}.bobo-card-cell{padding:4px!important}.bobo-card-cell img{max-width:100%!important}}@media only screen and (max-width:360px){.bobo-lead-image{width:96px!important}.bobo-lead-copy h2{font-size:16px!important}}</style>'.
      '</head><body style="margin:0;padding:0;background:#0c1116;color:#f0f4f5;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif">'.
      '<div style="display:none;font-size:1px;color:#0c1116;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">'.$safe($preheader).'</div>'.
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0c1116;border-collapse:collapse"><tr><td align="center" style="padding:24px 10px 35px">'.
      '<table role="presentation" class="bobo-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #324a53;border-collapse:separate;border-spacing:0;border-radius:12px;background:#111e27;overflow:hidden">'.
      '<tr><td class="bobo-padding" style="padding:26px 28px 9px;border-top:4px solid #a4d9d4">'.
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>'.
      '<td valign="middle"><span style="font:700 32px/1 Arial,Helvetica,sans-serif;letter-spacing:-2.5px;color:#eaf3f2">bobo<span style="color:#a4d9d4">.</span></span></td>'.
      '<td valign="middle" align="right" style="font:700 10px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.5px;color:#94bcb9">MOVIE<br>NIGHT / CLUB</td>'.
      '</tr></table><div style="border-top:1px solid #334851;margin:22px 0 19px"></div>'.
      '<div style="font:700 10px/1.4 Arial,Helvetica,sans-serif;letter-spacing:1.6px;color:#a4d9d4;margin-bottom:8px">LA SELEZIONE DELLA SETTIMANA</div>'.
      '<h1 style="font:700 29px/1.15 Arial,Helvetica,sans-serif;letter-spacing:-1px;margin:0 0 10px;color:#f4f7f7">Non sai cosa guardare<span style="color:#a4d9d4">?</span></h1>'.
      '<p style="font:400 14px/1.65 Arial,Helvetica,sans-serif;color:#b2c4ca;margin:0 0 15px">Ciao '.$safeName.', abbiamo scelto poche storie interessanti per la tua prossima serata. Nessuna classifica infinita: solo qualche bella idea.</p>'.
      '</td></tr>'.$leadBlock.$htmlSections.
      '<tr><td class="bobo-padding" align="center" style="padding:24px 28px 28px">'.
      '<a href="https://movie.curromatteo.it/discover.html" style="display:inline-block;padding:14px 23px;background:#a4d9d4;color:#102832;border-radius:6px;text-decoration:none;font:700 13px/1.3 Arial,Helvetica,sans-serif">Esplora Discover →</a>'.
      '</td></tr>'.
      '<tr><td class="bobo-padding" style="padding:22px 28px 27px;background:#0e1921;border-top:1px solid #334851;border-radius:0 0 12px 12px">'.
      '<p style="font:400 11px/1.6 Arial,Helvetica,sans-serif;color:#96acb5;margin:0 0 11px">Le selezioni sono generate automaticamente dai metadati disponibili. I servizi di streaming possono variare.</p>'.
      '<p style="font:400 11px/1.6 Arial,Helvetica,sans-serif;color:#96acb5;margin:0">Ricevi questa email perché hai aderito alla newsletter di Bobo Movie Club.<br>'.
      '<a href="'.$safeUnsubscribe.'" style="color:#c3e7e1;text-decoration:underline">Annulla iscrizione</a> &nbsp;·&nbsp; '.
      '<a href="https://movieaccount.curromatteo.it/account.html?view=settings" style="color:#c3e7e1;text-decoration:underline">Gestisci preferenze</a></p>'.
      '</td></tr></table></td></tr></table></body></html>';
    $plain.="Scopri altre selezioni: https://movie.curromatteo.it/discover.html\n\n".
      "Hai ricevuto questa email perché hai scelto di iscriverti alla newsletter di Bobo Movie Club.\n".
      "Annulla iscrizione: $unsubscribe\n";
    return [$title,$plain,$html];
}
