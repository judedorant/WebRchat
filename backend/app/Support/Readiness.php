<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class Readiness
{
    /** @return array{database: string, cache: string} */
    public function checks(): array
    {
        $checks = ['database' => 'unavailable', 'cache' => 'unavailable'];
        try {
            DB::select('SELECT 1');
            $checks['database'] = 'ready';
        } catch (Throwable) {
            // Never expose connection strings, credentials or raw exceptions.
        }
        try {
            $key = 'readiness:'.bin2hex(random_bytes(8));
            Cache::put($key, 'ok', 10);
            $checks['cache'] = Cache::get($key) === 'ok' ? 'ready' : 'unavailable';
            Cache::forget($key);
        } catch (Throwable) {
            // Readiness intentionally returns only dependency state.
        }

        return $checks;
    }
}
