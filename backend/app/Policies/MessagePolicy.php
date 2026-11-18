<?php

namespace App\Policies;

use App\Models\Message;
use App\Models\User;

class MessagePolicy
{
    public function update(User $user, Message $message): bool
    {
        return $message->sender_id === $user->id && ! $message->trashed() && $message->type === 'text' && $user->can('send', $message->conversation);
    }

    public function delete(User $user, Message $message): bool
    {
        return $message->sender_id === $user->id && $user->can('view', $message->conversation);
    }
}
