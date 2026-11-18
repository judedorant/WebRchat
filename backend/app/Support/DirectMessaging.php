<?php

namespace App\Support;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class DirectMessaging
{
    /** @return array{Conversation, bool} */
    public function open(User $sender, int $recipientId): array
    {
        return DB::transaction(function () use ($sender, $recipientId): array {
            $ids = [$sender->id, $recipientId];
            sort($ids);
            $users = User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            abort_unless($users->count() === 2 && $users->every(fn (User $user) => $user->hasVerifiedEmail() && ! $user->suspended_at), 403, 'This member is unavailable.');
            abort_if(UserBlock::whereIn('blocker_id', $ids)->whereIn('blocked_id', $ids)->exists(), 403, 'This conversation is unavailable.');
            $conversation = Conversation::where('direct_user_low_id', $ids[0])->where('direct_user_high_id', $ids[1])->first();
            if ($conversation) {
                Gate::forUser($sender)->authorize('send', $conversation);

                return [$conversation, false];
            }
            $conversation = new Conversation;
            $conversation->forceFill(['type' => 'direct', 'created_by' => $sender->id, 'direct_user_low_id' => $ids[0], 'direct_user_high_id' => $ids[1]])->save();
            $conversation->participants()->attach($ids, ['role' => 'member', 'joined_at' => now()]);
            ChatSignal::dispatch($conversation->id, 'conversation', $sender->id);

            return [$conversation, true];
        }, attempts: 3);
    }

    /** @return array{Message, bool} */
    public function send(User $sender, Conversation $conversation, array $data): array
    {
        return DB::transaction(function () use ($sender, $conversation, $data): array {
            // The same ordered user locks serialize pair creation and all sends by a sender,
            // including retries of one UUID against different conversations.
            if ($conversation->type === 'group') {
                $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
                $sender = User::whereKey($sender->id)->lockForUpdate()->firstOrFail();
            } else {
                User::whereIn('id', [$conversation->direct_user_low_id, $conversation->direct_user_high_id])->orderBy('id')->lockForUpdate()->get();
            }
            Gate::forUser($sender)->authorize('send', $conversation);
            if (! empty($data['reply_to_id'])) {
                abort_unless(Message::whereKey($data['reply_to_id'])->where('conversation_id', $conversation->id)->exists(), 422, 'The replied-to message is unavailable.');
            }
            $existing = Message::withTrashed()->where('sender_id', $sender->id)->where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                abort_if($existing->trashed() || $existing->type !== 'text' || $existing->conversation_id !== $conversation->id || $existing->body !== $data['body'] || $existing->reply_to_id !== ($data['reply_to_id'] ?? null), 409, 'This message UUID was already used for a different request.');

                return [$existing, false];
            }
            $message = new Message;
            $message->forceFill(['conversation_id' => $conversation->id, 'sender_id' => $sender->id, 'client_uuid' => $data['client_uuid'], 'type' => 'text', 'body' => $data['body'], 'reply_to_id' => $data['reply_to_id'] ?? null])->save();
            $conversation->forceFill(['last_message_at' => $message->created_at])->save();
            ChatNotifications::message($message, $conversation);
            ChatSignal::dispatch($conversation->id, 'message', $sender->id);

            return [$message, true];
        }, attempts: 3);
    }

    public function present(Conversation $conversation, User $user, ?bool $blocked = null): Conversation
    {
        $conversation->loadMissing(['participants' => fn ($users) => $users->whereNull('conversation_participants.left_at'), 'latestMessage.sender', 'latestMessage.reads', 'latestMessage.attachments', 'latestMessage.reactions', 'latestMessage.replyTo']);
        if (! array_key_exists('unread_count', $conversation->getAttributes())) {
            $conversation->loadCount(['messages as unread_count' => fn ($messages) => $messages->where('sender_id', '!=', $user->id)->whereDoesntHave('reads', fn ($reads) => $reads->where('user_id', $user->id)->whereNotNull('read_at'))]);
        }
        $role = $conversation->participants->firstWhere('id', $user->id)?->pivot->role;
        $conversation->setAttribute('my_role', $role);
        $conversation->setAttribute('can_manage', $conversation->type === 'group' && in_array($role, ['owner', 'admin'], true));
        $conversation->setAttribute('can_manage_roles', $conversation->type === 'group' && $role === 'owner');
        if ($conversation->type === 'group') {
            $conversation->setAttribute('can_send', $role !== null && ! $user->suspended_at && $user->hasVerifiedEmail());

            return $conversation;
        }
        $ids = [$conversation->direct_user_low_id, $conversation->direct_user_high_id];
        $conversation->setAttribute('can_send', $conversation->participants->count() === 2
            && $conversation->participants->every(fn (User $member) => ! $member->pivot->left_at && ! $member->suspended_at && $member->hasVerifiedEmail())
            && ! ($blocked ?? UserBlock::whereIn('blocker_id', $ids)->whereIn('blocked_id', $ids)->exists()));

        return $conversation;
    }
}
