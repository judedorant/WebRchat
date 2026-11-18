<?php

namespace App\Http\Controllers;

use App\Events\ChatSignal;
use App\Http\Requests\ChatPageRequest;
use App\Http\Requests\StoreMessageRequest;
use App\Http\Requests\UpdateMessageRequest;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Support\DirectMessaging;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class MessageController extends Controller
{
    public function index(ChatPageRequest $request, Conversation $conversation): AnonymousResourceCollection
    {
        $messages = $conversation->messages()->withTrashed()->with(['sender', 'reads', 'attachments', 'reactions', 'replyTo']);
        if ($request->has('ids')) {
            return MessageResource::collection($messages->whereIn('id', $request->validated('ids'))->orderBy('id')->get());
        }
        if ($request->has('after_id')) {
            return MessageResource::collection($messages->where('id', '>', $request->integer('after_id'))->orderBy('id')->cursorPaginate($request->integer('per_page', 100)));
        }

        return MessageResource::collection($messages->orderByDesc('id')->cursorPaginate($request->integer('per_page', 30)));
    }

    public function store(StoreMessageRequest $request, Conversation $conversation, DirectMessaging $messaging): JsonResponse
    {
        [$message, $created] = $messaging->send($request->user(), $conversation, $request->validated());

        return (new MessageResource($message->load(['sender', 'reads', 'attachments', 'reactions', 'replyTo'])))->response()->setStatusCode($created ? 201 : 200);
    }

    public function update(UpdateMessageRequest $request, Message $message): MessageResource
    {
        return $this->change($request, $message, false);
    }

    public function destroy(Request $request, Message $message): MessageResource
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);
        Gate::authorize('delete', $message);

        return $this->change($request, $message, true);
    }

    private function change(Request $request, Message $message, bool $delete): MessageResource
    {
        return DB::transaction(function () use ($request, $message, $delete): MessageResource {
            $conversation = Conversation::whereKey($message->conversation_id)->lockForUpdate()->firstOrFail();
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $message = Message::withTrashed()->whereKey($message->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($user)->authorize($delete ? 'delete' : 'update', $message);
            if ($delete) {
                if (! $message->trashed()) {
                    $message->delete();
                }
            } else {
                $message->forceFill(['body' => $request->input('body'), 'edited_at' => now()])->save();
            }
            $conversation->touch();
            ChatSignal::dispatch($conversation->id, 'change', $user->id);

            return new MessageResource($message->load(['sender', 'reads', 'attachments', 'reactions', 'replyTo']));
        }, attempts: 3);
    }
}
