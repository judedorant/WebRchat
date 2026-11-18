<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DirectMessagingTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->alice = User::factory()->create(['password' => 'StrongPassword123!']);
        $this->bob = User::factory()->create(['password' => 'StrongPassword123!']);
        $this->login($this->alice);
    }

    private function login(User $user): void
    {
        Auth::forgetGuards();
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'StrongPassword123!'])->assertOk();
    }

    private function conversation(): int
    {
        return $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id])->assertCreated()->json('data.id');
    }

    public function test_pair_is_canonical_and_reused_in_both_directions_with_only_public_participants(): void
    {
        $id = $this->conversation();
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id])->assertOk()->assertJsonPath('data.id', $id);
        $this->getJson('/api/v1/conversations/'.$id)->assertOk()->assertJsonPath('data.can_send', true)->assertJsonMissingPath('data.participants.1.email');
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($this->bob);
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->alice->id])->assertOk()->assertJsonPath('data.id', $id);
        $this->assertDatabaseCount('conversations', 1);
        $this->assertDatabaseCount('conversation_participants', 2);
        $this->assertDatabaseHas('conversations', ['id' => $id, 'direct_user_low_id' => $this->alice->id, 'direct_user_high_id' => $this->bob->id]);
    }

    public function test_messages_persist_exact_text_and_retry_returns_the_same_record(): void
    {
        $id = $this->conversation();
        $payload = ['body' => "  Hello 👋\n<script>alert(1)</script>  ", 'client_uuid' => strtoupper((string) Str::uuid())];
        $message = $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated()->assertJsonPath('data.body', $payload['body'])->assertJsonPath('data.sender.id', $this->alice->id)->json('data.id');
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertOk()->assertJsonPath('data.id', $message);
        $this->assertDatabaseCount('messages', 1);
        $this->assertNotNull(Conversation::findOrFail($id)->last_message_at);
        $this->getJson('/api/v1/conversations')->assertOk()->assertJsonPath('data.0.latest_message.id', $message);
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($this->bob);
        $this->getJson("/api/v1/conversations/$id/messages")->assertOk()->assertJsonPath('data.0.body', $payload['body'])->assertJsonMissingPath('data.0.sender.email');
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated();
        $this->assertDatabaseCount('messages', 2);
    }

    public function test_uuid_conflicts_with_changed_content_or_conversation_and_deleted_records(): void
    {
        $id = $this->conversation();
        $payload = ['body' => 'Original', 'client_uuid' => (string) Str::uuid()];
        $message = $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated()->json('data.id');
        $this->postJson("/api/v1/conversations/$id/messages", array_replace($payload, ['body' => 'Changed']))->assertConflict();
        $other = User::factory()->create();
        $second = $this->postJson('/api/v1/conversations', ['recipient_id' => $other->id])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/conversations/$second/messages", $payload)->assertConflict();
        Message::findOrFail($message)->delete();
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertConflict();
        $this->getJson("/api/v1/conversations/$id/messages")->assertJsonCount(1, 'data')->assertJsonPath('data.0.body', null)->assertJsonPath('data.0.attachments', [])->assertJsonMissing(['body' => $payload['body']]);
    }

    public function test_nonmembers_admins_and_departed_members_cannot_read_or_send(): void
    {
        $id = $this->conversation();
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Private', 'client_uuid' => (string) Str::uuid()])->assertCreated();
        $admin = User::factory()->create(['password' => 'StrongPassword123!']);
        $role = Role::firstOrCreate(['name' => 'admin']);
        $admin->roles()->attach($role);
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($admin);
        $this->getJson('/api/v1/conversations')->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/conversations/$id")->assertForbidden();
        $this->getJson("/api/v1/conversations/$id/messages")->assertForbidden();
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Intrusion', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($this->alice);
        DB::table('conversation_participants')->where('conversation_id', $id)->where('user_id', $this->alice->id)->update(['left_at' => now()]);
        $this->getJson('/api/v1/conversations')->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/conversations/$id/messages")->assertForbidden();
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id])->assertForbidden();
    }

    public function test_blocks_in_either_direction_disable_writes_but_keep_existing_history_visible(): void
    {
        $id = $this->conversation();
        foreach ([[$this->alice, $this->bob], [$this->bob, $this->alice]] as [$blocker, $blocked]) {
            DB::table('user_blocks')->insert(['blocker_id' => $blocker->id, 'blocked_id' => $blocked->id]);
            $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id])->assertForbidden();
            $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Blocked', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
            $this->getJson("/api/v1/conversations/$id")->assertOk()->assertJsonPath('data.can_send', false);
            $this->getJson("/api/v1/conversations/$id/messages")->assertOk();
            DB::table('user_blocks')->delete();
        }
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_unavailable_recipients_and_spoofed_fields_are_rejected(): void
    {
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->alice->id])->assertUnprocessable();
        $this->postJson('/api/v1/conversations', ['recipient_id' => 99999])->assertForbidden();
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id, 'participants' => [1, 2]])->assertUnprocessable();
        foreach ([['email_verified_at' => null], ['suspended_at' => now()], ['deleted_at' => now()]] as $attributes) {
            $unavailable = User::factory()->create($attributes);
            $this->postJson('/api/v1/conversations', ['recipient_id' => $unavailable->id])->assertForbidden();
        }
        $id = $this->conversation();
        $payload = ['body' => 'Hello', 'client_uuid' => (string) Str::uuid()];
        foreach ([['body' => '   '], ['body' => str_repeat('a', 4001)], ['client_uuid' => 'bad'], ['sender_id' => $this->bob->id], ['reply_to_id' => 1], ['type' => 'file']] as $changes) {
            $this->postJson("/api/v1/conversations/$id/messages", array_replace($payload, $changes))->assertUnprocessable();
        }
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_cursor_history_is_scoped_gap_free_and_stable_when_new_messages_arrive(): void
    {
        $id = $this->conversation();
        for ($i = 0; $i < 7; $i++) {
            $this->postJson("/api/v1/conversations/$id/messages", ['body' => "Message $i", 'client_uuid' => (string) Str::uuid()])->assertCreated();
        }
        $first = $this->getJson("/api/v1/conversations/$id/messages?per_page=3")->assertOk()->assertJsonCount(3, 'data');
        $cursor = $first->json('meta.next_cursor');
        $ids = array_column($first->json('data'), 'id');
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'New arrival', 'client_uuid' => (string) Str::uuid()])->assertCreated();
        while ($cursor) {
            $page = $this->getJson("/api/v1/conversations/$id/messages?per_page=3&cursor=".urlencode($cursor))->assertOk();
            $ids = array_merge($ids, array_column($page->json('data'), 'id'));
            $cursor = $page->json('meta.next_cursor');
        }
        $this->assertSame([7, 6, 5, 4, 3, 2, 1], $ids);
        $this->getJson("/api/v1/conversations/$id/messages?cursor=bad")->assertUnprocessable();
        $this->getJson("/api/v1/conversations/$id/messages?per_page=101")->assertUnprocessable();
        $this->getJson('/api/v1/conversations/99999/messages')->assertNotFound();
    }

    public function test_authentication_verification_suspension_and_rate_limits_apply(): void
    {
        $id = $this->conversation();
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->getJson('/api/v1/conversations')->assertUnauthorized();
        $this->login($this->alice);
        $this->alice->forceFill(['email_verified_at' => null])->save();
        Auth::forgetGuards();
        $this->getJson('/api/v1/conversations')->assertForbidden();
        $this->alice->forceFill(['email_verified_at' => now()])->save();
        Auth::forgetGuards();
        for ($i = 0; $i < 60; $i++) {
            $this->postJson("/api/v1/conversations/$id/messages", ['body' => "Text $i", 'client_uuid' => (string) Str::uuid()])->assertCreated();
        }
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Too fast', 'client_uuid' => (string) Str::uuid()])->assertTooManyRequests();
        $this->alice->forceFill(['suspended_at' => now()])->save();
        Auth::forgetGuards();
        $this->getJson('/api/v1/conversations')->assertForbidden();
    }

    public function test_conversation_pages_are_scoped_and_resource_queries_do_not_grow_per_row(): void
    {
        $this->conversation();
        for ($i = 0; $i < 5; $i++) {
            $other = User::factory()->create();
            $id = $this->postJson('/api/v1/conversations', ['recipient_id' => $other->id])->assertCreated()->json('data.id');
            $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Preview', 'client_uuid' => (string) Str::uuid()])->assertCreated();
        }
        Auth::forgetGuards();
        DB::enableQueryLog();
        $small = $this->getJson('/api/v1/conversations?per_page=1')->assertOk()->assertJsonCount(1, 'data');
        $smallCount = count(DB::getQueryLog());
        DB::flushQueryLog();
        Auth::forgetGuards();
        $this->getJson('/api/v1/conversations?per_page=10')->assertOk()->assertJsonCount(6, 'data');
        $this->assertLessThanOrEqual($smallCount + 1, count(DB::getQueryLog()));
        DB::disableQueryLog();
        $this->getJson('/api/v1/conversations?per_page=1&cursor='.urlencode($small->json('meta.next_cursor')))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 5);
        $this->getJson('/api/v1/conversations?cursor='.base64_encode(json_encode(['id' => [], '_pointsToNextItems' => true])))->assertUnprocessable();
        $this->travel(2)->seconds();
        $this->postJson('/api/v1/conversations/1/messages', ['body' => 'Recent activity in the oldest pair', 'client_uuid' => (string) Str::uuid()])->assertCreated();
        $this->getJson('/api/v1/conversations?per_page=1')->assertOk()->assertJsonPath('data.0.id', 1);
        $this->travelBack();

    }

    public function test_unavailable_direct_members_disable_sends_while_group_members_can_message(): void
    {
        $id = $this->conversation();
        $this->bob->forceFill(['suspended_at' => now()])->save();
        $this->getJson("/api/v1/conversations/$id")->assertOk()->assertJsonPath('data.can_send', false);
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'No', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->bob->forceFill(['suspended_at' => null, 'deleted_at' => now()])->save();
        $this->getJson("/api/v1/conversations/$id")->assertOk()->assertJsonPath('data.can_send', false);
        $group = Conversation::forceCreate(['type' => 'group', 'name' => 'Group workspace', 'created_by' => $this->alice->id]);
        $group->participants()->attach($this->alice->id);
        $this->getJson('/api/v1/conversations')->assertJsonCount(2, 'data');
        $this->getJson("/api/v1/conversations/{$group->id}/messages")->assertOk();
        $this->postJson("/api/v1/conversations/{$group->id}/messages", ['body' => 'Group message', 'client_uuid' => (string) Str::uuid()])->assertCreated();
    }

    public function test_stale_account_headers_cannot_create_pairs_or_send_as_another_session(): void
    {
        $id = $this->conversation();
        $this->withHeader('X-Chat-Account', (string) $this->bob->id);
        $this->postJson('/api/v1/conversations', ['recipient_id' => $this->bob->id])->assertForbidden();
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Stale account', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->withHeader('X-Chat-Account', (string) $this->alice->id);
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Correct account', 'client_uuid' => (string) Str::uuid()])->assertCreated()->assertJsonPath('data.sender.id', $this->alice->id);
        $this->assertDatabaseCount('messages', 1);
    }
}
