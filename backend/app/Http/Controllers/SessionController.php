<?php

namespace App\Http\Controllers;

use App\Support\Audit;
use App\Support\SessionManager;
use Illuminate\Http\Request;

class SessionController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['data' => $request->user()->sessions()->whereNull('revoked_at')->where('expires_at', '>', now())->latest('last_active_at')->get()->map(fn ($session) => [
            'id' => $session->id, 'ip_address' => $session->ip_address, 'user_agent' => $session->user_agent,
            'last_active_at' => $session->last_active_at->toIso8601String(),
            'current' => $session->id === $request->session()->get('device_session_id'),
        ])]);
    }

    public function destroy(Request $request, string $session, SessionManager $sessions)
    {
        $record = $request->user()->sessions()->whereKey($session)->firstOrFail();
        $record->forceFill(['revoked_at' => now()])->save();
        Audit::record('auth.session_revoked', $request->user());
        if ($session === $request->session()->get('device_session_id')) {
            $sessions->invalidate($request);
        }

        return response()->noContent();
    }

    public function others(Request $request, SessionManager $sessions)
    {
        $sessions->revokeOthers($request, $request->user());
        Audit::record('auth.other_sessions_revoked', $request->user());

        return response()->json(['message' => 'Your other sessions have been signed out.']);
    }
}
