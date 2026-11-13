<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;

class Audit
{
    public static function record(string $action, ?User $user, array $metadata = []): void
    {
        AuditLog::forceCreate(['actor_id' => $user?->id, 'action' => $action, 'subject_type' => User::class, 'subject_id' => $user?->id, 'metadata' => $metadata]);
    }
}
