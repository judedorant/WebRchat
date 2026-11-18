<?php

namespace Tests\Feature;

use App\Events\ChatSignal;
use App\Models\User;
use App\Models\UserReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class RichMessagingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
    }

    private function login(User $user): void
    {
        Auth::forgetGuards();
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'StrongPassword123!'])->assertOk();
    }

    private function switchTo(User $user): void
    {
        $this->postJson('/api/v1/logout')->assertNoContent();
        $this->login($user);
    }

    private function setupChat(): array
    {
        [$a,$b,$outsider] = User::factory()->count(3)->create(['password' => 'StrongPassword123!'])->all();
        $this->login($a);
        $id = $this->postJson('/api/v1/conversations', ['recipient_id' => $b->id])->assertCreated()->json('data.id');

        return [$a, $b, $outsider, $id];
    }

    private function text(int $id, string $body = 'Hello searchable 🌱'): int
    {
        return $this->postJson("/api/v1/conversations/$id/messages", ['client_uuid' => (string) Str::uuid(), 'body' => $body])->assertCreated()->json('data.id');
    }

    public function test_private_uploads_are_persisted_downloadable_only_by_members_and_uuid_retries_compare_bytes(): void
    {
        Storage::fake('local');
        [$a,$b,$outsider,$id] = $this->setupChat();
        Event::fake([ChatSignal::class]);
        $uuid = (string) Str::uuid();
        $payload = ['kind' => 'file', 'client_uuid' => $uuid, 'file' => UploadedFile::fake()->createWithContent('notes.txt', 'private file contents')];
        $response = $this->postJson("/api/v1/conversations/$id/attachments", $payload)->assertCreated()->assertJsonPath('data.type', 'file');
        $url = $response->json('data.attachments.0.url');
        $message = $response->json('data.id');
        $this->assertDatabaseCount('message_attachments', 1);
        $this->assertDatabaseCount('notifications', 1);
        $this->postJson("/api/v1/conversations/$id/attachments", $payload)->assertOk()->assertJsonPath('data.id', $message);
        $this->assertDatabaseCount('notifications', 1);
        $payload['file'] = UploadedFile::fake()->createWithContent('notes.txt', 'different bytes');
        $this->postJson("/api/v1/conversations/$id/attachments", $payload)->assertConflict();
        $this->get($url)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Cache-Control', 'no-store, private');
        $this->switchTo($b);
        $this->get($url)->assertOk();
        $this->getJson("/api/v1/conversations/$id/messages")->assertJsonPath('data.0.attachments.0.name', 'notes.txt')->assertJsonMissingPath('data.0.attachments.0.path');
        $this->switchTo($outsider);
        $this->getJson($url)->assertForbidden();
        Event::assertDispatched(ChatSignal::class, fn ($event) => $event->kind === 'message');
    }

    public function test_image_and_voice_uploads_have_typed_metadata_and_removal_revokes_downloads(): void
    {
        Storage::fake('local');
        [$a,$b,$outsider,$unused] = $this->setupChat();
        $id = $this->postJson('/api/v1/groups', ['name' => 'Media group', 'member_ids' => [$b->id]])->assertCreated()->json('data.id');
        $image = UploadedFile::fake()->createWithContent('pixel.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEnkAAAAASUVORK5CYII='));
        $url = $this->postJson("/api/v1/conversations/$id/attachments", ['kind' => 'image', 'client_uuid' => (string) Str::uuid(), 'file' => $image])->assertCreated()->assertJsonPath('data.attachments.0.kind', 'image')->json('data.attachments.0.url');
        $wav = 'RIFF'.pack('V', 36 + 800).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8).'data'.pack('V', 800).str_repeat(chr(128), 800);
        $this->postJson("/api/v1/conversations/$id/attachments", ['kind' => 'voice', 'client_uuid' => (string) Str::uuid(), 'file' => UploadedFile::fake()->createWithContent('voice.wav', $wav)])->assertCreated()->assertJsonPath('data.type', 'voice');
        $this->deleteJson("/api/v1/groups/$id/members/{$b->id}")->assertNoContent();
        $this->switchTo($b);
        $this->getJson($url)->assertForbidden();
    }

    public function test_uploads_reject_active_formats_spoofed_kind_oversize_and_identity_injection_without_orphans(): void
    {
        Storage::fake('local');
        [$a,$b,$outsider,$id] = $this->setupChat();
        foreach ([['file', UploadedFile::fake()->createWithContent('bad.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')], ['image', UploadedFile::fake()->createWithContent('fake.png', 'not an image')], ['file', UploadedFile::fake()->create('huge.txt', 10241, 'text/plain')]] as [$kind,$file]) {
            $this->postJson("/api/v1/conversations/$id/attachments", ['kind' => $kind, 'file' => $file, 'client_uuid' => (string) Str::uuid()])->assertUnprocessable();
        }
        $this->postJson("/api/v1/conversations/$id/attachments", ['kind' => 'file', 'file' => UploadedFile::fake()->createWithContent('a.txt', 'contents'), 'client_uuid' => (string) Str::uuid(), 'sender_id' => $b->id])->assertUnprocessable();
        $this->assertDatabaseCount('message_attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->withHeader('X-Chat-Account', (string) $b->id)->postJson("/api/v1/conversations/$id/attachments", [])->assertForbidden();
    }

    public function test_reactions_are_idempotent_per_member_emoji_private_and_live(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $mid = $this->text($id);
        Event::fake([ChatSignal::class]);
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '❤️'])->assertOk()->assertJsonCount(1, 'data.reactions');
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '❤️'])->assertOk()->assertJsonCount(1, 'data.reactions');
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '<script>'])->assertUnprocessable();
        $this->switchTo($b);
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '❤️'])->assertOk()->assertJsonCount(2, 'data.reactions');
        $this->deleteJson("/api/v1/messages/$mid/reactions", ['emoji' => '❤️'])->assertOk()->assertJsonCount(1, 'data.reactions')->assertJsonPath('data.reactions.0.user_id', $a->id);
        $this->deleteJson("/api/v1/messages/$mid/reactions", ['emoji' => '❤️'])->assertOk()->assertJsonCount(1, 'data.reactions');
        $this->switchTo($outsider);
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '👍'])->assertForbidden();
        Event::assertDispatched(ChatSignal::class, fn ($event) => $event->kind === 'reaction');
    }

    public function test_blocks_prevent_upload_and_reaction_writes_but_keep_existing_history(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $mid = $this->text($id);
        $this->putJson("/api/v1/blocks/{$b->id}")->assertNoContent();
        $this->putJson("/api/v1/messages/$mid/reactions", ['emoji' => '👍'])->assertForbidden();
        $this->postJson("/api/v1/conversations/$id/attachments", [])->assertForbidden();
        $this->getJson("/api/v1/conversations/$id/messages")->assertOk();
    }

    public function test_replies_are_conversation_scoped_and_edit_delete_are_author_only_with_live_tombstones(): void
    {
        [$a, $b, $outsider, $id] = $this->setupChat();
        $mid = $this->text($id, 'Original text');
        Event::fake([ChatSignal::class]);
        $payload = ['body' => 'Reply text', 'client_uuid' => (string) Str::uuid(), 'reply_to_id' => $mid];
        $reply = $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated()->assertJsonPath('data.reply_to.body', 'Original text')->json('data.id');
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertOk()->assertJsonPath('data.id', $reply);
        $this->patchJson("/api/v1/messages/$mid", ['body' => 'Edited text'])->assertOk()->assertJsonPath('data.body', 'Edited text');
        $this->assertDatabaseHas('messages', ['id' => $mid, 'body' => 'Edited text']);
        $this->patchJson("/api/v1/messages/$mid", ['body' => '   '])->assertUnprocessable();
        $this->switchTo($b);
        $this->patchJson("/api/v1/messages/$mid", ['body' => 'Not my message'])->assertForbidden();
        $this->deleteJson("/api/v1/messages/$mid")->assertForbidden();
        $this->postJson('/api/v1/reports', ['reported_user_id' => $a->id, 'message_id' => $mid, 'reason' => 'Capture selected evidence'])->assertCreated();
        $this->switchTo($a);
        $this->deleteJson("/api/v1/messages/$mid")->assertOk()->assertJsonPath('data.body', null)->assertJsonPath('data.attachments', []);
        $this->deleteJson("/api/v1/messages/$mid")->assertOk();
        $this->assertSoftDeleted('messages', ['id' => $mid]);
        $this->getJson("/api/v1/conversations/$id/messages?ids[]=$reply")->assertJsonPath('data.0.reply_to.deleted', true)->assertJsonPath('data.0.reply_to.body', null);
        $report = UserReport::firstOrFail();
        $this->assertSame('Edited text', $report->evidence['body']);
        $this->getJson('/api/v1/search/messages?q=Edited')->assertJsonCount(0, 'data');
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Reply to removed', 'client_uuid' => (string) Str::uuid(), 'reply_to_id' => $mid])->assertUnprocessable();
        Event::assertDispatched(ChatSignal::class, fn ($event) => $event->kind === 'change');
        $other = $this->postJson('/api/v1/conversations', ['recipient_id' => $outsider->id])->json('data.id');
        $this->postJson("/api/v1/conversations/$other/messages", ['body' => 'Cross-thread reply', 'client_uuid' => (string) Str::uuid(), 'reply_to_id' => $reply])->assertUnprocessable();
    }

    public function test_deleted_attachments_cannot_be_downloaded_and_text_retries_cannot_reuse_upload_uuids(): void
    {
        Storage::fake('local');
        [$a, $b, $outsider, $id] = $this->setupChat();
        $uuid = (string) Str::uuid();
        $response = $this->postJson("/api/v1/conversations/$id/attachments", ['file' => UploadedFile::fake()->createWithContent('private.txt', 'secret bytes'), 'kind' => 'file', 'body' => 'caption', 'client_uuid' => $uuid])->assertCreated();
        $url = $response->json('data.attachments.0.url');
        $mid = $response->json('data.id');
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'caption', 'client_uuid' => $uuid])->assertConflict();
        $this->deleteJson("/api/v1/messages/$mid")->assertOk()->assertJsonPath('data.attachments', []);
        $this->getJson($url)->assertNotFound();
        $this->switchTo($b);
        $this->getJson($url)->assertNotFound();
        $this->getJson("/api/v1/conversations/$id")->assertJsonPath('data.latest_message.body', null)->assertJsonPath('data.latest_message.attachments', []);
    }

    public function test_outsiders_and_left_members_cannot_edit_delete_or_reply(): void
    {
        [$a, $b, $outsider, $direct] = $this->setupChat();
        $id = $this->postJson('/api/v1/groups', ['name' => 'Lifecycle group', 'member_ids' => [$b->id]])->json('data.id');
        $mid = $this->text($id);
        $this->switchTo($outsider);
        $this->deleteJson("/api/v1/messages/$mid")->assertForbidden();
        $this->switchTo($a);
        $this->patchJson("/api/v1/groups/$id/members/{$b->id}", ['role' => 'owner'])->assertOk();
        $this->postJson("/api/v1/groups/$id/leave")->assertNoContent();
        $this->patchJson("/api/v1/messages/$mid", ['body' => 'Former member'])->assertForbidden();
        $this->deleteJson("/api/v1/messages/$mid")->assertForbidden();
    }
}
