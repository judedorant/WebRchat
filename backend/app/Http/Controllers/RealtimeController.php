<?php

namespace App\Http\Controllers;

use App\Events\ChatSignal;
use App\Http\Requests\ReceiptRequest;
use App\Http\Requests\TypingRequest;
use App\Models\Conversation;
use App\Support\MessageReceipts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class RealtimeController extends Controller
{
    public function authorizeChannel(Request $request): mixed
    {
        $request->validate(['socket_id' => ['required', 'string', 'max:100', 'regex:/^\d+\.\d+$/'], 'channel_name' => ['required', 'string', 'max:200', 'regex:/^(private-users\.[1-9]\d*\.sessions\.[a-f0-9-]{36}|presence-conversations\.[1-9]\d*)$/']]);
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);

        return Broadcast::connection('reverb')->auth($request);
    }

    public function heartbeat(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($request->header('X-Chat-Account', (string) $user->id) === (string) $user->id, 403);
        if (! $user->last_seen_at || $user->last_seen_at->lt(now()->subSeconds(20))) {
            $user->forceFill(['last_seen_at' => now()])->save();
        }

        return response()->json(['data' => ['key' => config('broadcasting.connections.reverb.key'), 'channel' => "users.{$user->id}.sessions.".$request->session()->get('device_session_id')]]);
    }

    public function typing(TypingRequest $request, Conversation $conversation): Response
    {
        $typing = $request->boolean('typing');
        $key = "typing:{$conversation->id}:{$request->user()->id}";
        $changed = $typing ? Cache::add($key, true, 3) : Cache::pull($key, false);
        if ($changed) {
            ChatSignal::dispatch($conversation->id, 'typing', $request->user()->id, $typing, now()->addSeconds(6)->toIso8601String());
        }

        return response()->noContent();
    }

    public function receipts(ReceiptRequest $request, Conversation $conversation, MessageReceipts $receipts): Response
    {
        $receipts->record($request->user(), $conversation, $request->validated('message_ids'), $request->validated('status'));

        return response()->noContent();
    }
}
