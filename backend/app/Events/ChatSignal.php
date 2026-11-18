<?php

namespace App\Events;

use App\Models\Conversation;
use App\Models\UserBlock;
use App\Models\UserSession;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ChatSignal implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable;

    public int $tries = 5;

    public array $backoff = [1, 3, 10, 30];

    public array $notifyUserIds = [];

    public function __construct(public int $conversationId, public string $kind, public int $actorId, public ?bool $typing = null, public ?string $expiresAt = null, array $notifyUserIds = [])
    {
        $this->notifyUserIds = $notifyUserIds;
    }

    public function broadcastOn(): array
    {
        // Resolve recipients at delivery time so revoked sessions and departed
        // members stop receiving events even when a queue job was delayed.
        $blocked = [];
        if (in_array($this->kind, ['message', 'reaction', 'typing', 'receipt'], true) && Conversation::whereKey($this->conversationId)->where('type', 'direct')->exists()) {
            $blocked = UserBlock::where('blocker_id', $this->actorId)->orWhere('blocked_id', $this->actorId)->get()->flatMap(fn ($block) => [$block->blocker_id, $block->blocked_id])->unique()->reject(fn ($id) => $id === $this->actorId)->all();
        }

        return UserSession::whereNotIn('user_id', $blocked)->whereNull('revoked_at')->where('expires_at', '>', now())
            ->whereHas('user', fn ($users) => $users->whereNotNull('email_verified_at')->whereNull('suspended_at')
                ->where(fn ($memberships) => $memberships->whereHas('conversations', fn ($conversations) => $conversations->where('conversations.id', $this->conversationId)->whereNull('conversation_participants.left_at'))->orWhereIn('users.id', $this->notifyUserIds)))
            ->get(['id', 'user_id'])->map(fn (UserSession $session) => new PrivateChannel("users.{$session->user_id}.sessions.{$session->id}"))->all();
    }

    public function broadcastAs(): string
    {
        return 'chat.signal';
    }

    public function broadcastWith(): array
    {
        // Clients fetch content over the authenticated REST boundary. Neither
        // message bodies, drafts nor public presence rosters enter this event.
        return ['conversation_id' => $this->conversationId, 'kind' => $this->kind, 'user_id' => $this->actorId, 'typing' => $this->typing, 'expires_at' => $this->expiresAt];
    }
}
