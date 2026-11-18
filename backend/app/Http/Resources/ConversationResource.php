<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'type' => $this->type,
            'name' => $this->name,
            'image_url' => $this->image_path ? '/api/v1/groups/'.$this->id.'/image?v='.substr(hash('sha256', $this->image_path), 0, 16) : null,
            'my_role' => $this->my_role, 'can_manage' => (bool) $this->can_manage, 'can_manage_roles' => (bool) $this->can_manage_roles,
            'participants' => ChatMemberResource::collection($this->whenLoaded('participants')),
            'latest_message' => new MessageResource($this->whenLoaded('latestMessage')),
            'last_message_at' => $this->last_message_at?->toIso8601String(),
            'created_at' => $this->created_at->toIso8601String(),
            'can_send' => (bool) $this->can_send,
            'unread_count' => (int) ($this->unread_count ?? 0),
        ];
    }
}
