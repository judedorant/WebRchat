<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreAttachmentRequest;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\MessageAttachment;
use App\Support\AttachmentMessaging;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AttachmentController extends Controller
{
    public function store(StoreAttachmentRequest $request, Conversation $conversation, AttachmentMessaging $messaging): JsonResponse
    {
        [$message, $created] = $messaging->send($request->user(), $conversation, $request->validated(), $request->file('file'));

        return (new MessageResource($message->load(['sender', 'reads', 'attachments', 'reactions', 'replyTo'])))->response()->setStatusCode($created ? 201 : 200);
    }

    public function show(MessageAttachment $attachment): BinaryFileResponse
    {
        $message = $attachment->message()->firstOrFail();
        Gate::authorize('view', $message->conversation);
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);
        $response = response()->file(Storage::disk('local')->path($attachment->path), ['Content-Type' => $attachment->mime_type, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Security-Policy' => "default-src 'none'; sandbox"]);
        $response->setContentDisposition($attachment->kind === 'file' ? 'attachment' : 'inline', $attachment->original_name, 'attachment');

        return $response->setPrivate();
    }
}
