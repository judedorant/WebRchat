<?php

use App\Http\Controllers\AttachmentController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\ConversationController;
use App\Http\Controllers\GroupController;
use App\Http\Controllers\GroupImageController;
use App\Http\Controllers\GroupNotificationController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReactionController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SearchController;
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

            Route::get('notifications', [NotificationController::class, 'index']);
            Route::patch('notifications/{notification}', [NotificationController::class, 'update'])->whereUuid('notification')->middleware('throttle:notifications');
            Route::get('search/conversations', [SearchController::class, 'conversations'])->middleware('throttle:search');
            Route::get('search/messages', [SearchController::class, 'index'])->middleware('throttle:search');
            Route::get('blocks', [BlockController::class, 'index']);
            Route::put('blocks/{user}', [BlockController::class, 'store'])->whereNumber('user')->middleware('throttle:safety');
            Route::delete('blocks/{user}', [BlockController::class, 'destroy'])->whereNumber('user')->middleware('throttle:safety');
            Route::post('reports', [ReportController::class, 'store'])->middleware('throttle:reports');
            Route::post('conversations/{conversation}/attachments', [AttachmentController::class, 'store'])->whereNumber('conversation')->middleware('throttle:uploads');
            Route::get('attachments/{attachment}', [AttachmentController::class, 'show'])->whereNumber('attachment');
            Route::patch('messages/{message}', [MessageController::class, 'update'])->whereNumber('message')->middleware('throttle:messages');
            Route::delete('messages/{message}', [MessageController::class, 'destroy'])->whereNumber('message')->withTrashed()->middleware('throttle:messages');
            Route::put('messages/{message}/reactions', [ReactionController::class, 'store'])->whereNumber('message')->middleware('throttle:reactions');
            Route::delete('messages/{message}/reactions', [ReactionController::class, 'destroy'])->whereNumber('message')->middleware('throttle:reactions');
            Route::get('group-notifications', [GroupNotificationController::class, 'index']);
            Route::patch('group-notifications/{notification}', [GroupNotificationController::class, 'update'])->whereUuid('notification')->middleware('throttle:groups');
            Route::post('groups', [GroupController::class, 'store'])->middleware('throttle:group-create');
            Route::get('groups/{group}', [GroupController::class, 'show'])->whereNumber('group');
            Route::patch('groups/{group}', [GroupController::class, 'update'])->whereNumber('group')->middleware('throttle:groups');
            Route::post('groups/{group}/members', [GroupController::class, 'add'])->whereNumber('group')->middleware('throttle:groups');
            Route::patch('groups/{group}/members/{userId}', [GroupController::class, 'role'])->whereNumber(['group', 'userId'])->middleware('throttle:groups');
            Route::delete('groups/{group}/members/{userId}', [GroupController::class, 'remove'])->whereNumber(['group', 'userId'])->middleware('throttle:groups');
            Route::post('groups/{group}/leave', [GroupController::class, 'leave'])->whereNumber('group')->middleware('throttle:groups');
            Route::get('groups/{group}/image', [GroupImageController::class, 'show'])->whereNumber('group');
            Route::post('groups/{group}/image', [GroupImageController::class, 'store'])->whereNumber('group')->middleware('throttle:group-images');
            Route::delete('groups/{group}/image', [GroupImageController::class, 'destroy'])->whereNumber('group')->middleware('throttle:group-images');
            Route::post('realtime/auth', [RealtimeController::class, 'authorizeChannel'])->middleware('throttle:realtime-auth');
            Route::post('realtime/heartbeat', [RealtimeController::class, 'heartbeat'])->middleware('throttle:realtime-heartbeat');
            Route::post('conversations/{conversation}/typing', [RealtimeController::class, 'typing'])->whereNumber('conversation')->middleware('throttle:typing');
            Route::post('conversations/{conversation}/receipts', [RealtimeController::class, 'receipts'])->whereNumber('conversation')->middleware('throttle:receipts');
            Route::get('conversations', [ConversationController::class, 'index']);
            Route::post('conversations', [ConversationController::class, 'store'])->middleware('throttle:30,1');
            Route::get('conversations/{conversation}', [ConversationController::class, 'show'])->whereNumber('conversation');
            Route::get('conversations/{conversation}/messages', [MessageController::class, 'index'])->whereNumber('conversation');
            Route::post('conversations/{conversation}/messages', [MessageController::class, 'store'])->whereNumber('conversation')->middleware('throttle:messages');
            Route::get('users', [UserController::class, 'index'])->middleware('throttle:60,1');
            Route::get('users/{user}', [UserController::class, 'show'])->whereNumber('user');
            Route::get('admin/access', fn (Request $request) => response()->json(['data' => ['role' => 'admin', 'message' => 'Administrator access verified. Moderation tools arrive in Phase 9.']]))->middleware('role:admin');
        });
    });
});
