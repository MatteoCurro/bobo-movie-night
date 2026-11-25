<?php
/** Copy to config.local.php outside htdocs; NEVER commit real credentials. */
return [
    'site_origin'=>'https://movie.curromatteo.it',
    'api_origin'=>'https://movieaccount.curromatteo.it',
    'data_dir'=>__DIR__.'/private',
    'registration_mode'=>'open',
    'resend_api_key'=>'', // keep this value private
    'resend_from'=>'Bobo Movie Night <no-reply@curromatteo.it>',
    'newsletter_secret'=>'', // random 32-byte hex secret, only on server
];
