<?php

namespace App\Http\Controllers;

use App\Http\Requests\ChatPageRequest;
use App\Http\Requests\StoreConversationRequest;
use App\Http\Resources\ConversationResource;
use App\Models\Conversation;
use App\Models\UserBlock;
use App\Support\DirectMessaging;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class ConversationController extends Controller
{
    public function index(ChatPageRequest $request, DirectMessaging $messaging): AnonymousResourceCollection
    {
        $page = Conversation::query()->visibleTo($request->user())->with(['participants' => fn ($users) => $users->whereNull('conversation_participants.left_at'), 'latestMessage.sender', 'latestMessage.reads', 'latestMessage.attachments', 'latestMessage.reactions', 'latestMessage.replyTo'])->withCount(['messages as unread_count' => fn ($messages) => $messages->where('sender_id', '!=', $request->user()->id)->whereDoesntHave('reads', fn ($reads) => $reads->where('user_id', $request->user()->id)->whereNotNull('read_at'))])
            ->orderByDesc('updated_at')->orderByDesc('id')->cursorPaginate($request->integer('per_page', 30));
        $user = $request->user();
        $blocks = UserBlock::where('blocker_id', $user->id)->orWhere('blocked_id', $user->id)->get();
        $page->getCollection()->each(function (Conversation $conversation) use ($messaging, $user, $blocks): void {
            $ids = [$conversation->direct_user_low_id, $conversation->direct_user_high_id];
            $blocked = $blocks->contains(fn (UserBlock $block) => in_array($block->blocker_id, $ids, true) && in_array($block->blocked_id, $ids, true));
            $messaging->present($conversation, $user, $blocked);
        });

        return ConversationResource::collection($page);
    }

    public function store(StoreConversationRequest $request, DirectMessaging $messaging): JsonResponse
    {
        [$conversation, $created] = $messaging->open($request->user(), $request->integer('recipient_id'));

        return (new ConversationResource($messaging->present($conversation, $request->user())))->response()->setStatusCode($created ? 201 : 200);
    }

    public function show(Request $request, Conversation $conversation, DirectMessaging $messaging): ConversationResource
    {
        Gate::authorize('view', $conversation);

        return new ConversationResource($messaging->present($conversation, $request->user()));
    }
}
