<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SessionManager
{
    public function login(Request $request, User $user): void
    {
        // Remember-me is deliberately disabled; all sessions must have revocable records.
        Auth::guard('web')->login($user, false);
        $request->session()->regenerate();
        $id = (string) Str::uuid();
        $user->sessions()->forceCreate([
            'id' => $id,
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr($request->userAgent() ?? '', 0, 500),
            'last_active_at' => now(),
            'expires_at' => now()->addMinutes(config('session.lifetime')),
        ]);
        $request->session()->put(['auth_version' => $user->auth_version, 'device_session_id' => $id]);
    }

    public function invalidate(Request $request): void
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    public function revokeOthers(Request $request, User $user): void
    {
        $user->increment('auth_version');
        $request->session()->put('auth_version', $user->auth_version);
        $user->sessions()->where('id', '!=', $request->session()->get('device_session_id'))
            ->whereNull('revoked_at')->update(['revoked_at' => now()]);
        $request->session()->regenerate();
    }
}
