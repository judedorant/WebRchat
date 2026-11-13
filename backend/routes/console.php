<?php

use App\Jobs\QueueSmoke;
use App\Support\Readiness;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

Artisan::command('app:health', function (Readiness $readiness) {
    $checks = $readiness->checks();
    $this->line(json_encode($checks));

    return in_array('unavailable', $checks, true) ? 1 : 0;
})->purpose('Check database and cache readiness');

Artisan::command('app:queue-smoke', function () {
    if (! app()->environment(['local', 'testing'])) {
        $this->error('This diagnostic is restricted to local/testing.');

        return 1;
    }
    $key = 'queue-smoke:'.Str::uuid();
    QueueSmoke::dispatch($key);
    $deadline = microtime(true) + 20;
    do {
        if (Cache::pull($key) === 'processed') {
            $this->info('Queue job processed and cache result verified.');

            return 0;
        }
        usleep(200000);
    } while (microtime(true) < $deadline);
    $this->error('No worker result within 20 seconds. Check the queue service.');

    return 1;
})->purpose('Verify a real queued job executes');
