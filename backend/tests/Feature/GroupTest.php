<?php

namespace Tests\Feature;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class GroupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
    }

    private function users(): array
    {
        return User::factory()->count(4)->create(['password' => 'StrongPassword123!'])->all();
    }

    private function login(User $user): void
    {
        Auth::forgetGuards();
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'StrongPassword123!'])->assertOk();
    }

    private function switchTo(User $user): void
    {
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($user);
    }

    private function group(array $users): int
    {
        $this->login($users[0]);

        return $this->postJson('/api/v1/groups', ['name' => 'Design circle', 'member_ids' => [$users[1]->id, $users[2]->id]])->assertCreated()->assertJsonPath('data.type', 'group')->assertJsonPath('data.my_role', 'owner')->json('data.id');
    }

    private function send(int $id, string $body = 'A group message'): int
    {
        return $this->postJson("/api/v1/conversations/$id/messages", ['body' => $body, 'client_uuid' => (string) Str::uuid()])->assertCreated()->json('data.id');
    }

    public function test_creation_assigns_one_owner_scoped_roster_and_notifications_without_privilege_injection(): void
    {
        $users = $this->users();
        Event::fake([ChatSignal::class]);
        $id = $this->group($users);
        $this->assertDatabaseHas('conversations', ['id' => $id, 'type' => 'group', 'direct_user_low_id' => null, 'direct_user_high_id' => null]);
        $this->assertDatabaseCount('conversation_participants', 3);
        $this->assertSame(1, DB::table('conversation_participants')->where('role', 'owner')->count());
        $this->assertDatabaseCount('notifications', 2);
        Event::assertDispatched(ChatSignal::class, fn ($signal) => $signal->kind === 'membership' && $signal->conversationId === $id);
        $this->getJson("/api/v1/groups/$id")->assertOk()->assertJsonPath('data.can_manage', true)->assertJsonCount(3, 'data.participants')->assertJsonMissingPath('data.participants.1.email');
        $this->postJson('/api/v1/groups', ['name' => 'Spoofed', 'member_ids' => [$users[1]->id], 'created_by' => $users[1]->id])->assertUnprocessable();
        $this->postJson('/api/v1/groups', ['name' => 'Duplicate', 'member_ids' => [$users[1]->id, $users[1]->id]])->assertUnprocessable();
        $this->postJson('/api/v1/groups', ['name' => 'Self', 'member_ids' => [$users[0]->id]])->assertUnprocessable();
    }

    public function test_group_messages_reuse_persistence_uuid_and_history_with_member_authorization(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $payload = ['body' => 'Hello team 👋', 'client_uuid' => (string) Str::uuid()];
        $message = $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated()->json('data.id');
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertOk()->assertJsonPath('data.id', $message);
        $this->switchTo($users[1]);
        $this->getJson('/api/v1/conversations')->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.unread_count', 1);
        $this->getJson("/api/v1/conversations/$id/messages")->assertOk()->assertJsonPath('data.0.body', $payload['body']);
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'read'])->assertNoContent();
        $this->send($id, 'A member can reply');
        $this->postJson('/api/v1/realtime/auth', ['socket_id' => '123.456', 'channel_name' => "presence-conversations.$id"])->assertOk();
        $this->assertDatabaseCount('messages', 2);
    }

    public function test_regular_members_and_platform_admin_outsiders_cannot_manage_or_read_group_data(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->switchTo($users[1]);
        $this->patchJson("/api/v1/groups/$id", ['name' => 'Hijack'])->assertForbidden();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id]])->assertForbidden();
        $this->patchJson("/api/v1/groups/$id/members/{$users[1]->id}", ['role' => 'owner'])->assertForbidden();
        $users[3]->roles()->attach(Role::firstOrCreate(['name' => 'admin']));
        $this->switchTo($users[3]);
        $this->getJson("/api/v1/groups/$id")->assertForbidden();
        $this->getJson("/api/v1/conversations/$id/messages")->assertForbidden();
        $this->getJson('/api/v1/conversations')->assertJsonCount(0, 'data');
        $this->postJson("/api/v1/groups/$id/leave")->assertForbidden();
    }

    public function test_group_admins_manage_settings_and_ordinary_members_but_not_owners_roles_or_other_admins(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->patchJson("/api/v1/groups/$id/members/{$users[1]->id}", ['role' => 'admin'])->assertOk();
        $this->switchTo($users[1]);
        $this->patchJson("/api/v1/groups/$id", ['name' => 'Renamed by admin'])->assertOk()->assertJsonPath('data.name', 'Renamed by admin');
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id]])->assertOk();
        $this->deleteJson("/api/v1/groups/$id/members/{$users[0]->id}")->assertForbidden();
        $this->patchJson("/api/v1/groups/$id/members/{$users[3]->id}", ['role' => 'admin'])->assertForbidden();
        $this->deleteJson("/api/v1/groups/$id/members/{$users[3]->id}")->assertNoContent();
        $this->switchTo($users[0]);
        $this->patchJson("/api/v1/groups/$id/members/{$users[2]->id}", ['role' => 'admin'])->assertOk();
        $this->switchTo($users[1]);
        $this->deleteJson("/api/v1/groups/$id/members/{$users[2]->id}")->assertForbidden();
    }

    public function test_owner_transfer_preserves_exactly_one_owner_and_prevents_last_owner_abandonment(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->postJson("/api/v1/groups/$id/leave")->assertConflict();
        $this->patchJson("/api/v1/groups/$id/members/{$users[0]->id}", ['role' => 'member'])->assertConflict();
        $this->patchJson("/api/v1/groups/$id/members/{$users[1]->id}", ['role' => 'owner'])->assertOk()->assertJsonPath('data.my_role', 'admin');
        $this->assertSame(1, DB::table('conversation_participants')->where('conversation_id', $id)->where('role', 'owner')->count());
        $this->patchJson("/api/v1/groups/$id/members/{$users[2]->id}", ['role' => 'owner'])->assertForbidden();
        $this->postJson("/api/v1/groups/$id/leave")->assertNoContent();
        $this->getJson("/api/v1/groups/$id")->assertForbidden();
        $this->switchTo($users[1]);
        $this->deleteJson("/api/v1/groups/$id/members/{$users[2]->id}")->assertNoContent();
        $this->postJson("/api/v1/groups/$id/leave")->assertNoContent();
        $this->assertSame(0, DB::table('conversation_participants')->where('conversation_id', $id)->whereNull('left_at')->count());
    }

    public function test_removal_revokes_reads_writes_presence_and_images_and_emits_targeted_invalidation(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->send($id);
        Event::fake([ChatSignal::class]);
        $this->deleteJson("/api/v1/groups/$id/members/{$users[1]->id}")->assertNoContent();
        Event::assertDispatched(ChatSignal::class, fn ($signal) => in_array($users[1]->id, $signal->notifyUserIds, true));
        $this->switchTo($users[1]);
        foreach (["groups/$id", "groups/$id/image", "conversations/$id/messages"] as $path) {
            $this->getJson('/api/v1/'.$path)->assertForbidden();
        }
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'No', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertForbidden();
        $this->postJson('/api/v1/realtime/auth', ['socket_id' => '123.456', 'channel_name' => "presence-conversations.$id"])->assertForbidden();
        $this->getJson('/api/v1/conversations')->assertJsonCount(0, 'data');
    }

    public function test_rejoining_restores_history_but_never_restores_old_admin_privileges(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->send($id, 'Existing group history');
        $this->patchJson("/api/v1/groups/$id/members/{$users[1]->id}", ['role' => 'admin'])->assertOk();
        $this->deleteJson("/api/v1/groups/$id/members/{$users[1]->id}")->assertNoContent();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[1]->id]])->assertOk();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[1]->id]])->assertOk();
        $this->assertDatabaseCount('conversation_participants', 3);
        $this->switchTo($users[1]);
        $this->getJson("/api/v1/groups/$id")->assertJsonPath('data.my_role', 'member')->assertJsonPath('data.can_manage', false);
        $this->getJson("/api/v1/conversations/$id/messages")->assertJsonPath('data.0.body', 'Existing group history');
    }

    public function test_unavailable_blocked_and_over_capacity_additions_are_rejected_atomically(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $users[3]->forceFill(['email_verified_at' => null])->save();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id]])->assertForbidden();
        $users[3]->forceFill(['email_verified_at' => now()])->save();
        DB::table('user_blocks')->insert(['blocker_id' => $users[3]->id, 'blocked_id' => $users[1]->id]);
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id]])->assertForbidden();
        DB::table('user_blocks')->delete();
        $many = User::factory()->count(98)->create()->modelKeys();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => $many])->assertUnprocessable();
        $this->assertDatabaseCount('conversation_participants', 3);
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id], 'role' => 'owner'])->assertUnprocessable();
    }

    public function test_private_group_images_validate_content_and_require_active_membership(): void
    {
        Storage::fake('local');
        $users = $this->users();
        $id = $this->group($users);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1kAAAAASUVORK5CYII=');
        $this->post("/api/v1/groups/$id/image", ['image' => UploadedFile::fake()->createWithContent('team.png', $png)], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.image_url', fn ($url) => str_starts_with($url, "/api/v1/groups/$id/image?v="));
        $path = Conversation::findOrFail($id)->image_path;
        Storage::disk('local')->assertExists($path);
        $image = $this->get("/api/v1/groups/$id/image")->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('private', $image->headers->get('Cache-Control'));
        $this->post("/api/v1/groups/$id/image", ['image' => UploadedFile::fake()->createWithContent('bad.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/v1/groups/$id/image", ['image' => UploadedFile::fake()->create('huge.png', 2049, 'image/png')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->switchTo($users[3]);
        $this->get("/api/v1/groups/$id/image")->assertForbidden();
        $this->switchTo($users[0]);
        $this->deleteJson("/api/v1/groups/$id/image")->assertOk()->assertJsonPath('data.image_url', null);
        $this->get("/api/v1/groups/$id/image")->assertNotFound();
    }

    public function test_membership_notifications_are_private_persistent_and_marked_read_only_by_the_recipient(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $this->switchTo($users[1]);
        $page = $this->getJson('/api/v1/group-notifications')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.unread_count', 1)->assertJsonPath('data.0.data.conversation_id', $id);
        $notification = $page->json('data.0.id');
        $this->patchJson("/api/v1/group-notifications/$notification")->assertOk();
        $this->getJson('/api/v1/group-notifications')->assertJsonPath('meta.unread_count', 0);
        $this->switchTo($users[0]);
        $this->patchJson("/api/v1/group-notifications/$notification")->assertNotFound();
        $this->getJson('/api/v1/group-notifications?cursor=bad')->assertUnprocessable();
    }

    public function test_group_routes_require_verified_current_accounts_and_cannot_mutate_direct_conversations(): void
    {
        $users = $this->users();
        $this->postJson('/api/v1/groups', ['name' => 'No', 'member_ids' => [$users[1]->id]])->assertUnauthorized();
        $this->login($users[0]);
        $direct = $this->postJson('/api/v1/conversations', ['recipient_id' => $users[1]->id])->json('data.id');
        $this->patchJson("/api/v1/groups/$direct", ['name' => 'No'])->assertForbidden();
        $this->getJson("/api/v1/groups/$direct")->assertNotFound();
        $this->withHeader('X-Chat-Account', (string) $users[1]->id);
        $this->postJson('/api/v1/groups', ['name' => 'No', 'member_ids' => [$users[1]->id]])->assertForbidden();
        $this->withoutHeader('X-Chat-Account');
        $users[0]->forceFill(['email_verified_at' => null])->save();
        Auth::forgetGuards();
        $this->postJson('/api/v1/groups', ['name' => 'No', 'member_ids' => [$users[1]->id]])->assertForbidden();
    }

    public function test_an_existing_unverified_member_does_not_prevent_new_available_members_joining(): void
    {
        $users = $this->users();
        $id = $this->group($users);
        $users[2]->forceFill(['email_verified_at' => null])->save();
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[3]->id]])->assertOk()->assertJsonCount(4, 'data.participants');
        $this->postJson("/api/v1/groups/$id/members", ['member_ids' => [$users[2]->id]])->assertOk();
        $this->assertDatabaseCount('conversation_participants', 4);
    }
}
