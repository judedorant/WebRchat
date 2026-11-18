<?php

namespace App\Http\Controllers;

use App\Http\Requests\SearchRequest;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\UserBlock;
use App\Support\DirectMessaging;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class SearchController extends Controller
{
    public function index(SearchRequest $request): AnonymousResourceCollection
    {
        if ($request->has('conversation_id')) {
            Gate::authorize('view', Conversation::findOrFail($request->integer('conversation_id')));
        }
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $request->validated('q')).'%';
        $query = Message::whereIn('conversation_id', Conversation::visibleTo($request->user())->select('id'))
            ->when($request->has('conversation_id'), fn ($q) => $q->where('conversation_id', $request->integer('conversation_id')))
            ->whereRaw("body LIKE ? ESCAPE '!'", [$pattern])->with(['sender', 'reads', 'attachments', 'reactions', 'replyTo']);

        return MessageResource::collection($query->orderByDesc('id')->cursorPaginate(30));
    }

    public function conversations(SearchRequest $request, DirectMessaging $messaging): AnonymousResourceCollection
    {
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $request->validated('q')).'%';
        $page = Conversation::visibleTo($request->user())->where(fn ($query) => $query
            ->whereRaw("name LIKE ? ESCAPE '!'", [$pattern])
            ->orWhereHas('activeParticipants', fn ($users) => $users->where('users.id', '!=', $request->user()->id)->whereRaw("users.name LIKE ? ESCAPE '!'", [$pattern])))
            ->with(['participants' => fn ($users) => $users->whereNull('conversation_participants.left_at'), 'latestMessage.sender', 'latestMessage.reads', 'latestMessage.attachments', 'latestMessage.reactions', 'latestMessage.replyTo'])
            ->withCount(['messages as unread_count' => fn ($messages) => $messages->where('sender_id', '!=', $request->user()->id)->whereDoesntHave('reads', fn ($reads) => $reads->where('user_id', $request->user()->id)->whereNotNull('read_at'))])
            ->orderByDesc('id')->cursorPaginate(30);
        $blocks = UserBlock::where('blocker_id', $request->user()->id)->orWhere('blocked_id', $request->user()->id)->get();
        $page->getCollection()->each(function (Conversation $conversation) use ($messaging, $request, $blocks): void {
            $ids = [$conversation->direct_user_low_id, $conversation->direct_user_high_id];
            $blocked = $blocks->contains(fn ($block) => in_array($block->blocker_id, $ids, true) && in_array($block->blocked_id, $ids, true));
            $messaging->present($conversation, $request->user(), $blocked);
        });

        return ConversationResource::collection($page);
    }
}
