<?php

namespace App\Support;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class MessageReceipts
{
    public function record(User $user, Conversation $conversation, array $ids, string $status): void
    {
        DB::transaction(function () use ($user, $conversation, $ids, $status): void {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($user)->authorize('view', $conversation);
            $messages = $conversation->messages()->whereIn('id', $ids)->where('sender_id', '!=', $user->id)->pluck('id');
            if ($messages->count() !== count($ids)) {
                throw ValidationException::withMessages(['message_ids' => ['Receipts must reference received messages in this conversation.']]);
            }
            $now = now();
            $rows = $messages->map(fn ($id) => ['message_id' => $id, 'user_id' => $user->id, 'delivered_at' => $now, 'read_at' => $status === 'read' ? $now : null, 'created_at' => $now, 'updated_at' => $now])->all();
            $changed = DB::table('message_reads')->insertOrIgnore($rows);
            $changed += DB::table('message_reads')->where('user_id', $user->id)->whereIn('message_id', $ids)->whereNull('delivered_at')->update(['delivered_at' => $now, 'updated_at' => $now]);
            if ($status === 'read') {
                $changed += DB::table('message_reads')->where('user_id', $user->id)->whereIn('message_id', $ids)->whereNull('read_at')->update(['read_at' => $now, 'updated_at' => $now]);
            }
            if ($changed) {
                ChatSignal::dispatch($conversation->id, 'receipt', $user->id);
            }
        }, attempts: 3);
    }
}
