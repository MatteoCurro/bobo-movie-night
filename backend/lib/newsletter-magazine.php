<?php
declare(strict_types=1);
/** Bobo Magazine email. Accepts only static, curated, locally verified digest data. */

function bobo_newsletter_compose_magazine(array $feed, string $username, string $unsubscribe): array {
    $esc = static fn(mixed $v): string => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $short = static function (mixed $v, int $limit=170): string {
        $s=trim(preg_replace('/\s+/u',' ',(string)$v) ?? (string)$v);
        if(function_exists('mb_strlen') && mb_strlen($s,'UTF-8') <= $limit)return $s;
        if(!function_exists('mb_strlen') && strlen($s) <= $limit)return $s;
        $s=function_exists('mb_substr')?mb_substr($s,0,$limit,'UTF-8'):substr($s,0,$limit);
        return rtrim($s,' .,;:'). '…';
    };
    $edition=is_array($feed['edition']??null)?$feed['edition']:[];
    $lead=bobo_newsletter_valid_item($feed['lead']??null);
    if(!$lead)throw new InvalidArgumentException('Magazine edition missing a valid lead');
    $theme=(string)($edition['theme']??'');
    $palettes=['special-christmas'=>'#E7A6A6','special-halloween'=>'#F2BD80',
        'special-easter'=>'#C8D9A1','space'=>'#AEC9F1','mystery'=>'#D0B2E7',
        'time'=>'#AAD7CB','music'=>'#F1C68B','heist'=>'#E8B6AD',
        'growing'=>'#BBD6A3','journeys'=>'#B6D5E5','worlds'=>'#C4B4EA'];
    $accent=$palettes[$theme]??'#A4D9D4';
    $subject=$short($edition['subject']??'BOBO / Il cinema della settimana',105);
    $title=$esc($short($edition['title']??'Il cinema della settimana',100));
    $intro=$esc($short($edition['subtitle']??'Storie selezionate dal club',190));
    $kicker=$esc($short($edition['eyebrow']??'IL CLUB / QUESTA SETTIMANA',70));
    $preheader=$esc($short($edition['preheader']??'Film, serie e idee per la tua prossima serata.',180));
    $link=static fn(array $item):string=>'https://movie.curromatteo.it/watch.html?type='.$item['type'].'&id='.$item['tmdb_id'];
    $picture=static function(array $item,int $width,string $css='')use($esc):string{
        return $item['poster']?
          '<img src="'.$esc($item['poster']).'" width="'.$width.'" alt="" style="display:block;width:'.$width.'px;max-width:100%;height:auto;border:0;border-radius:7px;'.$css.'">':
          '<div style="background:#233842;width:100%;height:145px;border-radius:7px"></div>';
    };
    $label=static fn(array $item):string=>($item['type']==='tv'?'SERIE TV':'FILM').($item['year']?' · '.$item['year']:'');
    $plain="BOBO MOVIE CLUB\n".$short($edition['title']??'La selezione della settimana')."\n".
        $short($edition['subtitle']??'')."\n\n".
        "Ciao $username,\n\nSCELTA DEL CLUB\n".$lead['title']."\n".
        $short($lead['overview'],240)."\n".$link($lead)."\n\n";

    $used=[$lead['type'].':'.$lead['tmdb_id']=>true];
    $sections='';
    $sectionCount=0;
    foreach(($feed['sections']??[]) as $section){
        if($sectionCount>=3||!is_array($section)||!is_array($section['items']??null))continue;
        $cards=[];
        foreach($section['items'] as $row){
            $item=bobo_newsletter_valid_item($row);
            if(!$item)continue;
            $key=$item['type'].':'.$item['tmdb_id'];
            if(isset($used[$key]))continue;
            $used[$key]=true;
            $reason=$short($row['reason']??'',110);
            $url=$esc($link($item));
            $cards[]='<td class="bobo-card" valign="top" width="50%" style="width:50%;padding:5px">'.
              '<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background:#172a35;border:1px solid #344853;border-radius:8px"><tr><td style="padding:14px">'.
              '<a href="'.$url.'" style="color:#F2F5F6;text-decoration:none">'.$picture($item,132).
              '<span style="display:block;font:700 15px/1.3 Arial,sans-serif;margin:11px 0 4px;color:#F4F7F7">'.$esc($short($item['title'],75)).'</span></a>'.
              '<span style="display:block;font:700 10px/1.5 Arial,sans-serif;letter-spacing:.8px;color:#A4D9D4">'.$esc($label($item)).'</span>'.
              ($reason!==''?'<p style="font:italic 12px/1.5 Georgia,serif;color:#DBD0BF;margin:10px 0 0">'.$esc($reason).'</p>':
              '<p style="font:400 12px/1.55 Arial,sans-serif;color:#B6C9D1;margin:9px 0 0">'.$esc($short($item['overview'],108)).'</p>').
              '<a href="'.$url.'" style="display:block;margin-top:11px;font:700 12px/1.4 Arial,sans-serif;color:#A4D9D4;text-decoration:none">Apri la scheda →</a>'.
              '</td></tr></table></td>';
            $plain.='• '.$item['title'].' ('.$item['year'].') — '.$link($item)."\n";
            if(count($cards)>=2)break;
        }
        if(!$cards)continue;
        $heading=$esc($short($section['title']??'Altre storie',85));
        $deck=$esc($short($section['subtitle']??'',165));
        $cells=$cards[0].($cards[1]??'<td valign="top" width="50%"></td>');
        $sections.='<tr><td class="bobo-pad" style="padding:9px 23px 14px">'.
            '<h2 style="font:700 21px/1.25 Arial,sans-serif;color:#F1F4F5;letter-spacing:-.4px;margin:12px 5px 4px">'.$heading.'</h2>'.
            '<p style="font:400 13px/1.5 Arial,sans-serif;color:#AABEC6;margin:0 5px 10px">'.$deck.'</p>'.
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>'.$cells.'</tr></table></td></tr>';
        $plain.="\n";
        $sectionCount++;
    }
    $curiosity='';
    $raw=$feed['curiosity']??null;
    if(is_array($raw)&&is_array($raw['item']??null)){
        $item=bobo_newsletter_valid_item($raw['item']);
        $fact=$short($raw['text']??'',245);
        if($item&&$fact!==''){
            $url=$esc($link($item));
            $curiosity='<tr><td class="bobo-pad" style="padding:15px 28px">'.
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid '.$accent.';background:#1B2C33;border-radius:4px"><tr><td style="padding:19px 22px">'.
                '<div style="font:700 10px/1.4 Arial,sans-serif;letter-spacing:1.4px;color:'.$accent.'">DIETRO LE QUINTE</div>'.
                '<p style="font:400 16px/1.5 Georgia,serif;color:#F1EEE8;margin:11px 0 8px">'.$esc($fact).'</p>'.
                '<a href="'.$url.'" style="font:700 12px/1.4 Arial,sans-serif;color:#A4D9D4;text-decoration:none">Il film: '.$esc($short($item['title'],60)).' →</a>'.
                '</td></tr></table></td></tr>';
            $plain.="DIETRO LE QUINTE\n".$fact."\n".$link($item)."\n\n";
        }
    }
    $quoteBlock='';
    $quote=$feed['quote']??null;
    if(is_array($quote)&&is_array($quote['item']??null)){
        $qitem=bobo_newsletter_valid_item($quote['item']);
        $text=trim((string)($quote['text']??''));
        $source=(string)($quote['source_url']??'');
        if($qitem&&$text!==''&&strlen($text)<=430&&
           str_starts_with($source,'https://it.wikiquote.org/wiki/')){
            $description=$short($quote['context']??'',205);
            $quoteBlock='<tr><td class="bobo-pad" style="padding:16px 28px 24px">'.
                '<div style="font:700 10px/1.4 Arial,sans-serif;letter-spacing:1.5px;color:'.$accent.';margin-bottom:12px">LA BATTUTA DA RICORDARE</div>'.
                '<p style="font:italic 23px/1.38 Georgia,serif;color:#F4EFE8;margin:0 0 12px">“'.$esc($text).'”</p>'.
                '<p style="font:700 13px/1.4 Arial,sans-serif;color:#E3D5BB;margin:0 0 8px">'.$esc($short($qitem['title'],90)).
                ($quote['speaker']??''?' · '.$esc($short($quote['speaker'],65)):'').'</p>'.
                '<p style="font:400 13px/1.6 Arial,sans-serif;color:#AEC0C7;margin:0 0 9px">'.$esc($description).'</p>'.
                '<a href="'.$esc($link($qitem)).'" style="font:700 12px/1.4 Arial,sans-serif;color:#A4D9D4;text-decoration:none">Scopri il film →</a>'.
                ' &nbsp; <a href="'.$esc($source).'" style="font:400 11px/1.4 Arial,sans-serif;color:#A6BAC1;text-decoration:underline">Fonte della citazione</a>'.
                '</td></tr>';
            $plain.="LA BATTUTA DA RICORDARE\n“".$text."” — ".$qitem['title'].
                "\n".$description."\n".$link($qitem)."\n\n";
        }
    }
    $image=$picture($lead,174);
    $hero='<tr><td class="bobo-pad" style="padding:2px 28px 22px">'.
        '<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border:1px solid #40535A;background:#1A2D38;border-radius:9px"><tr>'.
        '<td valign="top" width="174" style="width:174px;padding:16px 0 16px 16px">'.$image.'</td>'.
        '<td class="bobo-hero-copy" valign="top" style="padding:17px 18px 16px 19px">'.
        '<div style="font:700 10px/1.4 Arial,sans-serif;letter-spacing:1.1px;color:'.$accent.'">LA SCELTA DEL CLUB</div>'.
        '<h2 style="font:700 23px/1.18 Arial,sans-serif;letter-spacing:-.5px;color:#F6F8F9;margin:9px 0">'.$esc($lead['title']).'</h2>'.
        '<p style="font:700 10px/1.4 Arial,sans-serif;letter-spacing:.7px;color:#A4D9D4;margin:0 0 10px">'.$esc($label($lead)).'</p>'.
        '<p style="font:400 13px/1.58 Arial,sans-serif;color:#BDC9CE;margin:0 0 15px">'.$esc($short($lead['overview'],190)).'</p>'.
        '<a href="'.$esc($link($lead)).'" style="display:inline-block;background:#A4D9D4;color:#10242C;padding:11px 15px;border-radius:5px;text-decoration:none;font:700 12px/1.3 Arial,sans-serif">Scopri questo titolo →</a>'.
        '</td></tr></table></td></tr>';

    $html='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$esc($subject).'</title>'.
      '<style>@media only screen and (max-width:620px){.bobo-shell{width:100%!important}.bobo-pad{padding-left:16px!important;padding-right:16px!important}.bobo-hero-copy{padding:14px!important}.bobo-hero-copy h2{font-size:18px!important}.bobo-card{padding:3px!important}.bobo-card img{max-width:100%!important}}@media only screen and (max-width:390px){.bobo-hero-image{width:94px!important}}</style></head>'.
      '<body style="margin:0;padding:0;background:#0B1319;color:#F2F6F7;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">'.
      '<div style="display:none;font-size:1px;color:#0B1319;line-height:1px;max-height:0;opacity:0;overflow:hidden">'.$preheader.'</div>'.
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1319;border-collapse:collapse"><tr><td align="center" style="padding:22px 9px 40px">'.
      '<table class="bobo-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#101E27;border:1px solid #2D4550;border-top:4px solid '.$accent.';border-radius:11px;border-spacing:0">'.
      '<tr><td class="bobo-pad" style="padding:27px 28px 20px">'.
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'.
      '<td><span style="font:700 31px/1 Arial,sans-serif;letter-spacing:-2px;color:#F4F8F8">bobo<span style="color:#A4D9D4">.</span></span></td>'.
      '<td align="right" style="font:700 10px/1.45 Arial,sans-serif;letter-spacing:1.5px;color:#9BBAB9">MOVIE<br>CLUB / MAGAZINE</td></tr></table>'.
      '<div style="border-top:1px solid #334A55;margin:19px 0"></div>'.
      '<div style="font:700 10px/1.5 Arial,sans-serif;color:'.$accent.';letter-spacing:1.5px;margin-bottom:9px">'.$kicker.'</div>'.
      '<h1 style="font:700 32px/1.13 Arial,sans-serif;letter-spacing:-1px;color:#F5F7F7;margin:0 0 11px">'.$title.'</h1>'.
      '<p style="font:400 15px/1.6 Arial,sans-serif;color:#B9C9CC;margin:0">'.$intro.'</p>'.
      '</td></tr>'.$hero.$sections.$curiosity.$quoteBlock.
      '<tr><td class="bobo-pad" align="center" style="padding:16px 28px 33px">'.
      '<p style="font:400 13px/1.6 Arial,sans-serif;color:#AEC1C8;margin:0 0 18px">Un film porta a un altro. Continua a esplorare storie, persone e collegamenti.</p>'.
      '<a href="https://movie.curromatteo.it/discover.html" style="display:inline-block;background:#A4D9D4;color:#10262E;text-decoration:none;border-radius:5px;font:700 13px/1.3 Arial,sans-serif;padding:13px 20px">Esplora Discover →</a>'.
      '</td></tr>'.
      '<tr><td class="bobo-pad" style="padding:22px 28px 26px;background:#0D1820;border-top:1px solid #304751">'.
      '<p style="font:400 11px/1.65 Arial,sans-serif;color:#98AFB8;margin:0 0 12px">Consigli editoriali generati a partire dal catalogo Bobo, non aggiornamenti verificati sulla disponibilità in streaming. Le citazioni sono selezionate e corredate dalla fonte.</p>'.
      '<p style="font:400 11px/1.7 Arial,sans-serif;color:#98AFB8;margin:0">Ricevi questa email perché hai scelto di iscriverti a Bobo Movie Club.<br>'.
      '<a href="'.$esc($unsubscribe).'" style="color:#C1E4DF;text-decoration:underline">Annulla iscrizione</a> · '.
      '<a href="https://movieaccount.curromatteo.it/account.html?view=settings" style="color:#C1E4DF;text-decoration:underline">Gestisci preferenze</a></p>'.
      '</td></tr></table></td></tr></table></body></html>';
    $plain.="Esplora Discover: https://movie.curromatteo.it/discover.html\n".
        "Selezioni editoriali basate su metadati: non equivalgono a disponibilità verificata sulle piattaforme.\n".
        "Annulla iscrizione: $unsubscribe\n";
    return [$subject,$plain,$html];
}
