<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerificationController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::prefix('v1')->group(function () {
    Route::get('health', HealthController::class)->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->name('health');
    // Require real cookie-backed SPA requests; these endpoints never issue bearer tokens.
    Route::middleware(['spa', 'guest:web'])->group(function () {
        Route::post('register', [AuthController::class, 'register'])->middleware('throttle:registration');
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    });
    Route::middleware('spa')->group(function () {
        Route::post('forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:recovery');
        Route::post('reset-password', [PasswordController::class, 'reset'])->middleware('throttle:recovery');
    });
    Route::middleware(['spa', 'auth:sanctum', 'active'])->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::patch('profile', [ProfileController::class, 'update'])->middleware('throttle:30,1');
        Route::put('password', [PasswordController::class, 'change'])->middleware('throttle:6,1');
        Route::get('sessions', [SessionController::class, 'index']);
        Route::delete('sessions/others', [SessionController::class, 'others'])->middleware('throttle:6,1');
        Route::delete('sessions/{session}', [SessionController::class, 'destroy'])->whereUuid('session');
        Route::post('email/verification-notification', [VerificationController::class, 'resend'])->middleware('throttle:6,1');
        Route::get('email/verify/{id}/{hash}', [VerificationController::class, 'verify'])->middleware(['signed', 'throttle:6,1'])->name('verification.verify');
        Route::middleware('verified')->group(function () {
            Route::get('users', [UserController::class, 'index'])->middleware('throttle:60,1');
            Route::get('users/{user}', [UserController::class, 'show'])->whereNumber('user');
            Route::get('admin/access', fn (Request $request) => response()->json(['data' => ['role' => 'admin', 'message' => 'Administrator access verified. Moderation tools arrive in Phase 9.']]))->middleware('role:admin');
        });
    });
});
