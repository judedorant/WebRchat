<?php

namespace App\Http\Middleware;

use App\Support\SessionManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $record = $user->sessions()->whereKey($request->session()->get('device_session_id'))->first();
        $invalid = $request->session()->get('auth_version') !== $user->auth_version
            || ! $record || $record->revoked_at || $record->expires_at->isPast();
        if ($user->suspended_at || $invalid) {
            app(SessionManager::class)->invalidate($request);
            abort($user->suspended_at ? 403 : 401, $user->suspended_at ? 'This account is suspended.' : 'Your session has expired. Please sign in again.');
        }
        if ($record->last_active_at->lt(now()->subMinute())) {
            $record->forceFill(['last_active_at' => now(), 'expires_at' => now()->addMinutes(config('session.lifetime'))])->save();
        }
        $user->loadMissing('roles');

        return $next($request);
    }
}
