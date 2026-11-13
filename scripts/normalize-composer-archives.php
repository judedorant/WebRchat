<?php

// GitHub's API redirects zipball requests to this official archive endpoint.
// Keep exact locked commits and any checksum; only change the GitHub hostname/path.
$path = __DIR__.'/../backend/composer.lock';
$lock = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
foreach (['packages', 'packages-dev'] as $group) {
    foreach ($lock[$group] ?? [] as $i => $package) {
        if (isset($package['dist']['url'])) {
            $lock[$group][$i]['dist']['url'] = preg_replace(
                '#^https://api\.github\.com/repos/([^/]+/[^/]+)/zipball/#',
                'https://codeload.github.com/$1/legacy.zip/',
                $package['dist']['url'],
            );
        }
    }
}
file_put_contents($path, json_encode($lock, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
