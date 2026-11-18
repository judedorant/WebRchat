<?php

namespace App\Http\Controllers;

use App\Events\ChatSignal;
use App\Http\Requests\ReactionRequest;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\MessageReaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ReactionController extends Controller
{
    public function store(ReactionRequest $request, Message $message): MessageResource
    {
        return $this->change($request, $message, true);
    }

    public function destroy(ReactionRequest $request, Message $message): MessageResource
    {
        return $this->change($request, $message, false);
    }

    private function change(ReactionRequest $request, Message $message, bool $add): MessageResource
    {
        return DB::transaction(function () use ($request, $message, $add): MessageResource {
            $conversation = Conversation::whereKey($message->conversation_id)->lockForUpdate()->firstOrFail();
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($user)->authorize('send', $conversation);
            $message = Message::whereKey($message->id)->lockForUpdate()->firstOrFail();
            $attributes = ['message_id' => $message->id, 'user_id' => $user->id, 'emoji' => $request->validated('emoji')];
            if ($add) {
                MessageReaction::unguarded(fn () => MessageReaction::firstOrCreate($attributes));
            } else {
                MessageReaction::where($attributes)->delete();
            }
            ChatSignal::dispatch($conversation->id, 'reaction', $user->id);

            return new MessageResource($message->load(['sender', 'reads', 'attachments', 'reactions', 'replyTo']));
        });
    }
}
