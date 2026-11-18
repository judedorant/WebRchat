<?php

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Gate;

Broadcast::connection('reverb')->channel('users.{userId}.sessions.{sessionId}', function (User $user, string $userId, string $sessionId): bool {
    return (string) $user->id === $userId && request()->session()->get('device_session_id') === $sessionId;
}, ['guards' => ['web']]);

Broadcast::connection('reverb')->channel('conversations.{conversationId}', function (User $user, string $conversationId): array|bool {
    $conversation = ctype_digit($conversationId) ? Conversation::find($conversationId) : null;

    return $conversation && Gate::forUser($user)->allows('send', $conversation) ? ['id' => $user->id] : false;
}, ['guards' => ['web']]);
