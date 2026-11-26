<?php
declare(strict_types=1);
require __DIR__.'/../backend/lib/newsletter.php';
$feed=json_decode(file_get_contents(__DIR__.'/../data/newsletter.json'),true,512,JSON_THROW_ON_ERROR);
if(!is_array($feed)||!in_array(($feed['schema']??0),[1,2],true)) {
    throw new RuntimeException('Invalid newsletter data');
}
$unsubscribe='https://movieaccount.curromatteo.it/unsubscribe.html#id=preview&token=preview';
$example=$feed;
if(($example['schema']??0)===1) {
    if(count($example['weekly']??[])<2)throw new RuntimeException('Too few recommendations');
    // Produce a realistic v2 preview even before the next scheduled catalog sync.
    $example=[
        'schema'=>2,
        'edition'=>[
            'id'=>'preview', 'theme'=>'space',
            'eyebrow'=>'IL CLUB / EDIZIONE SPECIALE',
            'title'=>'Storie da un altro mondo',
            'subtitle'=>'Film e serie da scoprire, con una curiosità da raccontare.',
            'subject'=>'BOBO / Storie da un altro mondo',
            'preheader'=>'Un piccolo magazine settimanale, non una lista di novità.',
        ],
        'lead'=>$feed['weekly'][0],
        'weekly'=>$feed['weekly'],
        'sections'=>[
            ['title'=>'Fuori dai soliti radar','subtitle'=>'Due film per cambiare prospettiva',
             'items'=>$feed['sections'][0]['items']??[]],
            ['title'=>'Una serie, un altro mondo','subtitle'=>'Un paio di storie a episodi',
             'items'=>$feed['sections'][1]['items']??[]],
        ],
        'curiosity'=>[
            'text'=>'Tra le storie collegate, la regia e gli interpreti creano nuovi percorsi nel catalogo.',
            'item'=>$feed['weekly'][1],
        ],
        'quote'=>[
            'text'=>"Che il cucchiaio non esiste.",'speaker'=>'Bambino',
            'context'=>'Un dialogo che invita a riflettere sulla realtà percepita.',
            'source_url'=>'https://it.wikiquote.org/wiki/Matrix',
            'item'=>[
                'type'=>'movie','tmdb_id'=>603,'title'=>'Matrix','year'=>1999,
                'poster'=>'https://image.tmdb.org/t/p/w342/fake-preview.jpg',
                'overview'=>'',
            ],
        ],
    ];
}
[$subject,$plain,$html]=bobo_newsletter_compose(
    $example,'<script>Test</script>',$unsubscribe
);
$checks=[
    'Magazine subject'=>str_starts_with($subject,'BOBO /'),
    'Brand'=>str_contains($html,'CLUB / MAGAZINE'),
    'Desktop width'=>str_contains($html,'max-width:600px'),
    'Hero'=>str_contains($html,'LA SCELTA DEL CLUB'),
    'Thematic sections'=>str_contains($html,'bobo-card'),
    'Discover CTA'=>str_contains($html,'discover.html'),
    'Quote from a verified source'=>str_contains($html,'Fonte della citazione')||empty($example['quote']),
    'Unsubscribe'=>str_contains($html,'Annulla iscrizione'),
    'Plain text'=>str_contains($plain,'Annulla iscrizione:'),
    'HTML escaped'=>!str_contains($html,'<script>Test</script>'),
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
fwrite(STDOUT,"Magazine preview generated (no email sent).\n");
