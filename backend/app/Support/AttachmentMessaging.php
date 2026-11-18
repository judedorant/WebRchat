<?php

namespace App\Support;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AttachmentMessaging
{
    /** @return array{Message, bool} */
    public function send(User $sender, Conversation $conversation, array $data, UploadedFile $file): array
    {
        $stored = null;
        try {
            return DB::transaction(function () use ($sender, $conversation, $data, $file, &$stored): array {
                if ($conversation->type === 'group') {
                    $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
                    $sender = User::whereKey($sender->id)->lockForUpdate()->firstOrFail();
                } else {
                    User::whereIn('id', [$conversation->direct_user_low_id, $conversation->direct_user_high_id])->orderBy('id')->lockForUpdate()->get();
                }
                Gate::forUser($sender)->authorize('send', $conversation);
                $body = $data['body'] ?? null;
                if (! empty($data['reply_to_id'])) {
                    abort_unless(Message::whereKey($data['reply_to_id'])->where('conversation_id', $conversation->id)->exists(), 422, 'The replied-to message is unavailable.');
                }
                $existing = Message::withTrashed()->with('attachments')->where('sender_id', $sender->id)->where('client_uuid', $data['client_uuid'])->first();
                if ($existing) {
                    $attachment = $existing->attachments->first();
                    abort_unless(! $existing->trashed() && $existing->conversation_id === $conversation->id && $existing->body === $body && $existing->reply_to_id === (isset($data['reply_to_id']) ? (int) $data['reply_to_id'] : null) && $existing->type === $data['kind'] && $attachment && Storage::disk('local')->exists($attachment->path) && $attachment->original_name === $this->filename($file) && hash_equals(hash_file('sha256', $file->getRealPath()), hash_file('sha256', Storage::disk('local')->path($attachment->path))), 409, 'This message UUID was already used for a different request.');

                    return [$existing, false];
                }
                $stored = $file->store('attachments', 'local');
                abort_unless($stored, 503, 'Unable to save attachment. Please retry.');
                $message = Message::forceCreate(['conversation_id' => $conversation->id, 'sender_id' => $sender->id, 'client_uuid' => $data['client_uuid'], 'type' => $data['kind'], 'body' => $body, 'reply_to_id' => $data['reply_to_id'] ?? null]);
                $dimensions = $data['kind'] === 'image' ? getimagesize($file->getRealPath()) : null;
                $message->attachments()->create(['disk' => 'local', 'path' => $stored, 'original_name' => $this->filename($file), 'mime_type' => $file->getMimeType(), 'size' => $file->getSize(), 'kind' => $data['kind'], 'width' => $dimensions[0] ?? null, 'height' => $dimensions[1] ?? null]);
                $conversation->forceFill(['last_message_at' => $message->created_at])->save();
                ChatNotifications::message($message, $conversation);
                ChatSignal::dispatch($conversation->id, 'message', $sender->id);

                return [$message, true];
            });
        } catch (Throwable $error) {
            if ($stored) {
                Storage::disk('local')->delete($stored);
            }
            throw $error;
        }
    }

    private function filename(UploadedFile $file): string
    {
        return mb_substr(preg_replace('/[\x00-\x1F\x7F\/\\\\]/u', '_', $file->getClientOriginalName()) ?: 'attachment', 0, 200);
    }
}
