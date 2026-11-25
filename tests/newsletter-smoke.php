<?php
declare(strict_types=1);
require __DIR__.'/../backend/lib/newsletter.php';
$feed=json_decode(file_get_contents(__DIR__.'/../data/newsletter.json'),true,512,JSON_THROW_ON_ERROR);
if(!is_array($feed)||!is_array($feed['weekly']??null)||count($feed['weekly'])<2){
    throw new RuntimeException('The editorial digest has too few recommendations');
}
[$subject,$plain,$html]=bobo_newsletter_compose(
    $feed,'Bobo','https://movieaccount.curromatteo.it/unsubscribe.html#id=preview&token=preview'
);
$checks=[
  'Subject'=>$subject==='BOBO / Cosa guardare questa settimana',
  'Brand'=>str_contains($html,'NIGHT / CLUB')&&str_contains($html,'bobo'),
  'Desktop width'=>str_contains($html,'max-width:600px'),
  'Main poster'=>str_contains($html,'width="168"'),
  'Secondary poster'=>str_contains($html,'width="142"'),
  'Discover CTA'=>str_contains($html,'discover.html'),
  'Unsubscribe'=>str_contains($html,'Annulla iscrizione'),
  'Text fallback'=>str_contains($plain,'Annulla iscrizione:'),
  'No previous weekly headline'=>!str_contains($html,'Novità segnalate questa settimana'),
];
foreach($checks as $name=>$ok){
    if(!$ok)throw new RuntimeException('Newsletter smoke test failed: '.$name);
    fwrite(STDOUT,"OK: ".$name."\n");
}
$directory=__DIR__.'/../newsletter-preview';
if(!is_dir($directory)&&!mkdir($directory,0775,true)&&!is_dir($directory)){
    throw new RuntimeException('Could not create preview directory');
}
file_put_contents($directory.'/newsletter.html',$html);
file_put_contents($directory.'/newsletter.txt',"Subject: $subject\n\n".$plain);
fwrite(STDOUT,"Preview generated (not sent).\n");
