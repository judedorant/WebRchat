<?php

namespace App\Http\Controllers;

use App\Support\Readiness;
use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    public function __invoke(Readiness $readiness): JsonResponse
    {
        $checks = $readiness->checks();
        $ready = ! in_array('unavailable', $checks, true);

        return response()->json(['data' => [
            'status' => $ready ? 'ok' : 'degraded',
            'service' => 'WebRchat API',
            'checks' => $checks,
        ]], $ready ? 200 : 503)->header('Cache-Control', 'no-store');
    }
}
