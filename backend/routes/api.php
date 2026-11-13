<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::prefix('v1')->group(function () {
    Route::get('health', HealthController::class)->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->name('health');
});
