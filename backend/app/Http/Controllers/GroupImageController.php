<?php

namespace App\Http\Controllers;

use App\Http\Requests\GroupImageRequest;
use App\Http\Resources\ConversationResource;
use App\Models\Conversation;
use App\Support\DirectMessaging;
use App\Support\GroupManagement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class GroupImageController extends Controller
{
    public function show(Conversation $group): BinaryFileResponse
    {
        abort_unless($group->type === 'group', 404);
        Gate::authorize('view', $group);
        abort_unless($group->image_path && Storage::disk('local')->exists($group->image_path), 404);

        return response()->file(Storage::disk('local')->path($group->image_path), ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Security-Policy' => "default-src 'none'"])->setPrivate();
    }

    public function store(GroupImageRequest $request, Conversation $group, GroupManagement $groups, DirectMessaging $messaging): ConversationResource
    {
        return new ConversationResource($messaging->present($groups->image($request->user(), $group, $request->file('image')), $request->user()));
    }

    public function destroy(Request $request, Conversation $group, GroupManagement $groups, DirectMessaging $messaging): ConversationResource
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);

        return new ConversationResource($messaging->present($groups->image($request->user(), $group, null), $request->user()));
    }
}
