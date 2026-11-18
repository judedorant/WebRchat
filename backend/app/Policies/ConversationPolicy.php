<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\User;
use App\Models\UserBlock;

class ConversationPolicy
{
    public function view(User $user, Conversation $conversation): bool
    {
        return ! $user->suspended_at && $user->hasVerifiedEmail()
            && Conversation::query()->visibleTo($user)->whereKey($conversation->id)->exists();
    }

    public function send(User $user, Conversation $conversation): bool
    {
        if (! $this->view($user, $conversation)) {
            return false;
        }
        if ($conversation->type === 'group') {
            return true;
        }
        $ids = [$conversation->direct_user_low_id, $conversation->direct_user_high_id];
        if (! in_array($user->id, $ids, true)) {
            return false;
        }

        return $conversation->participants()->whereNull('conversation_participants.left_at')
            ->whereIn('users.id', $ids)->whereNotNull('email_verified_at')->whereNull('suspended_at')->count() === 2
            && ! UserBlock::whereIn('blocker_id', $ids)->whereIn('blocked_id', $ids)->exists();
    }

    public function manage(User $user, Conversation $conversation): bool
    {
        return $conversation->type === 'group' && $this->view($user, $conversation)
            && $conversation->activeParticipants()->where('users.id', $user->id)->whereIn('conversation_participants.role', ['owner', 'admin'])->exists();
    }

    public function manageRoles(User $user, Conversation $conversation): bool
    {
        return $conversation->type === 'group' && $this->view($user, $conversation)
            && $conversation->activeParticipants()->where('users.id', $user->id)->where('conversation_participants.role', 'owner')->exists();
    }
}
