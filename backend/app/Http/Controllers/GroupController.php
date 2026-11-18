<?php

namespace App\Http\Controllers;

use App\Http\Requests\AddGroupMembersRequest;
use App\Http\Requests\StoreGroupRequest;
use App\Http\Requests\UpdateGroupMemberRequest;
use App\Http\Requests\UpdateGroupRequest;
use App\Http\Resources\ConversationResource;
use App\Models\Conversation;
use App\Support\DirectMessaging;
use App\Support\GroupManagement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class GroupController extends Controller
{
    private function resource(Conversation $group, Request $request, DirectMessaging $messaging): ConversationResource
    {
        return new ConversationResource($messaging->present($group, $request->user()));
    }

    public function store(StoreGroupRequest $request, GroupManagement $groups, DirectMessaging $messaging): JsonResponse
    {
        return $this->resource($groups->create($request->user(), $request->validated()), $request, $messaging)->response()->setStatusCode(201);
    }

    public function show(Request $request, Conversation $group, DirectMessaging $messaging): ConversationResource
    {
        abort_unless($group->type === 'group', 404);
        Gate::authorize('view', $group);

        return $this->resource($group, $request, $messaging);
    }

    public function update(UpdateGroupRequest $request, Conversation $group, GroupManagement $groups, DirectMessaging $messaging): ConversationResource
    {
        return $this->resource($groups->rename($request->user(), $group, $request->validated('name')), $request, $messaging);
    }

    public function add(AddGroupMembersRequest $request, Conversation $group, GroupManagement $groups, DirectMessaging $messaging): ConversationResource
    {
        return $this->resource($groups->add($request->user(), $group, $request->validated('member_ids')), $request, $messaging);
    }

    public function role(UpdateGroupMemberRequest $request, Conversation $group, int $userId, GroupManagement $groups, DirectMessaging $messaging): ConversationResource
    {
        return $this->resource($groups->role($request->user(), $group, $userId, $request->validated('role')), $request, $messaging);
    }

    public function remove(Request $request, Conversation $group, int $userId, GroupManagement $groups): Response
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);
        $groups->remove($request->user(), $group, $userId);

        return response()->noContent();
    }

    public function leave(Request $request, Conversation $group, GroupManagement $groups): Response
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);
        $groups->remove($request->user(), $group, $request->user()->id, true);

        return response()->noContent();
    }
}
