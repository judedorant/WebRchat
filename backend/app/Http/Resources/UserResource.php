<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $self = $request->user()?->id === $this->id;

        return [
            'id' => $this->id,
            'realtime_enabled' => $this->when($self, $this->hasVerifiedEmail()),
            'name' => $this->name,
            'bio' => $this->bio,
            'avatar_url' => null, // Private image uploads belong to Phase 7.
            'email' => $this->when($self, $this->email),
            'email_verified_at' => $this->when($self, $this->email_verified_at?->toIso8601String()),
            'roles' => $this->when($self, fn () => $this->roles->pluck('name')->values()),
        ];
    }
}
