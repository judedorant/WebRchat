<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function view(User $user, User $target): bool
    {
        return ! $user->suspended_at && $user->hasVerifiedEmail()
            && ! $target->suspended_at && $target->hasVerifiedEmail();
    }

    public function update(User $user, User $target): bool
    {
        return ! $user->suspended_at && $user->id === $target->id;
    }
}
