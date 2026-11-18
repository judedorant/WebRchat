<?php

return [
    'default' => env('BROADCAST_CONNECTION', 'null'),
    'connections' => [
        'reverb' => [
            'driver' => 'reverb',
            'key' => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),
            'options' => [
                'host' => env('REVERB_HOST', 'reverb'),
                'port' => env('REVERB_PORT', 8080),
                'scheme' => env('REVERB_SCHEME', 'http'),
                'useTLS' => env('REVERB_SCHEME', 'http') === 'https',
            ],
            'client_options' => [
                'proxy' => [
                    'http' => env('HTTP_PROXY', env('http_proxy')),
                    'https' => env('HTTPS_PROXY', env('https_proxy')),
                    'no' => array_values(array_unique(array_merge(explode(',', env('NO_PROXY', env('no_proxy', ''))), ['reverb', 'localhost', '127.0.0.1']))),
                ],
            ],
        ],
        'log' => ['driver' => 'log'],
        'null' => ['driver' => 'null'],
    ],
];
