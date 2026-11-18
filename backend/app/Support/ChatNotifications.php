<?php

namespace App\Support;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ChatNotifications
{
    public static function message(Message $message, Conversation $conversation): void
    {
        $blocked = UserBlock::where('blocker_id', $message->sender_id)->orWhere('blocked_id', $message->sender_id)->get()->flatMap(fn ($block) => [$block->blocker_id, $block->blocked_id])->unique();
        $recipients = $conversation->activeParticipants()->where('users.id', '!=', $message->sender_id)->whereNotIn('users.id', $blocked)->whereNull('suspended_at')->whereNotNull('email_verified_at')->pluck('users.id');
        $rows = $recipients->map(fn ($id) => ['id' => (string) Str::uuid(), 'type' => 'chat.message', 'notifiable_type' => User::class, 'notifiable_id' => $id, 'data' => json_encode(['conversation_id' => $conversation->id, 'message_id' => $message->id, 'action' => 'message', 'actor_id' => $message->sender_id]), 'read_at' => null, 'created_at' => now(), 'updated_at' => now()])->all();
        if ($rows) {
            DB::table('notifications')->insert($rows);
        }
    }
}
