<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ChatMemberResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['role' => $this->whenPivotLoaded('conversation_participants', fn () => $this->pivot->role), 'id' => $this->id, 'name' => $this->name, 'bio' => $this->bio, 'avatar_url' => null, 'last_seen_at' => $this->last_seen_at?->toIso8601String()];
    }
}
