<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'conversation_id' => $this->conversation_id,
            'sender' => new ChatMemberResource($this->whenLoaded('sender')),
            'client_uuid' => $this->client_uuid, 'type' => $this->type, 'body' => $this->trashed() ? null : $this->body, 'deleted_at' => $this->deleted_at?->toIso8601String(), 'edited_at' => $this->edited_at?->toIso8601String(),
            'attachments' => $this->whenLoaded('attachments', fn () => $this->trashed() ? [] : $this->attachments->map(fn ($file) => ['id' => $file->id, 'name' => $file->original_name, 'mime_type' => $file->mime_type, 'size' => $file->size, 'kind' => $file->kind, 'url' => '/api/v1/attachments/'.$file->id])),
            'reactions' => $this->whenLoaded('reactions', fn () => $this->trashed() ? [] : $this->reactions->map(fn ($reaction) => ['user_id' => $reaction->user_id, 'emoji' => $reaction->emoji])),
            'reply_to' => $this->whenLoaded('replyTo', fn () => ! $this->trashed() && $this->replyTo ? ['id' => $this->replyTo->id, 'sender_id' => $this->replyTo->sender_id, 'body' => $this->replyTo->trashed() ? null : mb_substr($this->replyTo->body ?? '', 0, 200), 'deleted' => $this->replyTo->trashed()] : null),
            'created_at' => $this->created_at->toIso8601String(),
            'receipts' => $this->whenLoaded('reads', fn () => $this->reads->map(fn ($receipt) => ['user_id' => $receipt->user_id, 'delivered_at' => $receipt->delivered_at?->toIso8601String(), 'read_at' => $receipt->read_at?->toIso8601String()])),
        ];
    }
}
