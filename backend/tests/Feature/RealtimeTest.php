<?php

namespace Tests\Feature;

use App\Events\ChatSignal;
use App\Models\Message;
use App\Models\Role;
use App\Models\User;
use App\Models\UserSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RealtimeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
        config(['broadcasting.connections.reverb.key' => 'test-public-key', 'broadcasting.connections.reverb.secret' => 'test-private-secret']);
    }

    private function login(User $user): void
    {
        Auth::forgetGuards();
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'StrongPassword123!'])->assertOk();
    }

    private function pair(): array
    {
        $alice = User::factory()->create(['password' => 'StrongPassword123!']);
        $bob = User::factory()->create(['password' => 'StrongPassword123!']);
        $this->login($alice);
        $id = $this->postJson('/api/v1/conversations', ['recipient_id' => $bob->id])->assertCreated()->json('data.id');

        return [$alice, $bob, $id];
    }

    private function switchTo(User $user): void
    {
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->login($user);
    }

    private function authorize(string $channel): TestResponse
    {
        return $this->postJson('/api/v1/realtime/auth', ['socket_id' => '123.456', 'channel_name' => $channel]);
    }

    public function test_private_channel_is_bound_to_the_exact_verified_device_session(): void
    {
        [$alice, $bob] = $this->pair();
        $heartbeat = $this->postJson('/api/v1/realtime/heartbeat')->assertOk()->assertJsonPath('data.key', 'test-public-key');
        $channel = $heartbeat->json('data.channel');
        $this->authorize('private-'.$channel)->assertOk()->assertJsonStructure(['auth'])->assertDontSee('test-private-secret');
        $this->authorize('private-users.'.$bob->id.'.sessions.'.Str::uuid())->assertForbidden();
        $this->authorize('private-users.'.$alice->id.'.sessions.'.Str::uuid())->assertForbidden();
        $this->authorize('public-channel')->assertUnprocessable();
        $this->postJson('/api/v1/realtime/auth', ['socket_id' => 'bad', 'channel_name' => 'private-'.$channel])->assertUnprocessable();
        $this->assertNotNull($alice->fresh()->last_seen_at);
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->authorize('private-'.$channel)->assertUnauthorized();
    }

    public function test_presence_only_reveals_a_member_id_and_denies_admin_outsiders_and_blocks(): void
    {
        [$alice, $bob, $id] = $this->pair();
        $response = $this->authorize("presence-conversations.$id")->assertOk();
        $data = json_decode($response->json('channel_data'), true);
        $this->assertEquals($alice->id, $data['user_id']);
        $this->assertSame(['id' => $alice->id], $data['user_info']);
        $this->assertStringNotContainsString($alice->email, $response->getContent());
        DB::table('user_blocks')->insert(['blocker_id' => $bob->id, 'blocked_id' => $alice->id]);
        $this->authorize("presence-conversations.$id")->assertForbidden();
        DB::table('user_blocks')->delete();
        $admin = User::factory()->create(['password' => 'StrongPassword123!']);
        $admin->roles()->attach(Role::firstOrCreate(['name' => 'admin']));
        $this->switchTo($admin);
        $this->authorize("presence-conversations.$id")->assertForbidden();
    }

    public function test_unverified_suspended_revoked_and_departed_sessions_cannot_subscribe(): void
    {
        [$alice, , $id] = $this->pair();
        $alice->forceFill(['email_verified_at' => null])->save();
        Auth::forgetGuards();
        $this->authorize("presence-conversations.$id")->assertForbidden();
        $alice->forceFill(['email_verified_at' => now()])->save();
        Auth::forgetGuards();
        DB::table('conversation_participants')->where('user_id', $alice->id)->update(['left_at' => now()]);
        $this->authorize("presence-conversations.$id")->assertForbidden();
        $alice->forceFill(['suspended_at' => now()])->save();
        Auth::forgetGuards();
        $this->postJson('/api/v1/realtime/heartbeat')->assertForbidden();
    }

    public function test_typing_is_authorized_throttled_ephemeral_and_does_not_broadcast_drafts(): void
    {
        [$alice, $bob, $id] = $this->pair();
        Event::fake([ChatSignal::class]);
        $this->freezeTime();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true, 'body' => 'Secret draft'])->assertUnprocessable();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertNoContent();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertNoContent();
        Event::assertDispatchedTimes(ChatSignal::class, 1);
        Event::assertDispatched(ChatSignal::class, fn (ChatSignal $signal) => $signal->kind === 'typing' && $signal->actorId === $alice->id && $signal->typing && $signal->expiresAt === now()->addSeconds(6)->toIso8601String() && ! array_key_exists('body', $signal->broadcastWith()));
        $this->travel(4)->seconds();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertNoContent();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => false])->assertNoContent();
        Event::assertDispatchedTimes(ChatSignal::class, 3);
        $this->assertDatabaseCount('messages', 0);
        $this->switchTo($bob);
        DB::table('conversation_participants')->where('user_id', $bob->id)->update(['left_at' => now()]);
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertForbidden();
    }

    public function test_receipts_are_monotonic_idempotent_and_clear_only_the_recipients_unread_count(): void
    {
        [$alice, $bob, $id] = $this->pair();
        $message = $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Hello', 'client_uuid' => (string) Str::uuid()])->assertCreated()->json('data.id');
        $this->switchTo($bob);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 1);
        Event::fake([ChatSignal::class]);
        $this->freezeTime();
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'delivered'])->assertNoContent();
        $delivered = DB::table('message_reads')->first()->delivered_at;
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 1);
        $this->travel(2)->seconds();
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'read'])->assertNoContent();
        $read = DB::table('message_reads')->first()->read_at;
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'delivered'])->assertNoContent();
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'read'])->assertNoContent();
        $this->assertSame($read, DB::table('message_reads')->first()->read_at);
        $this->assertSame($delivered, DB::table('message_reads')->first()->delivered_at);
        $this->assertDatabaseCount('message_reads', 1);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 0);
        Event::assertDispatchedTimes(ChatSignal::class, 2);
        $this->switchTo($alice);
        $this->getJson("/api/v1/conversations/$id/messages")->assertOk()->assertJsonPath('data.0.receipts.0.user_id', $bob->id);
    }

    public function test_receipt_payloads_cannot_mark_sent_foreign_or_deleted_messages(): void
    {
        [$alice, $bob, $id] = $this->pair();
        $message = $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Hello', 'client_uuid' => (string) Str::uuid()])->json('data.id');
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'read'])->assertUnprocessable();
        $this->switchTo($bob);
        foreach ([['message_ids' => [99999], 'status' => 'read'], ['message_ids' => [$message, $message], 'status' => 'read'], ['message_ids' => [$message], 'status' => 'unknown'], ['message_ids' => [$message], 'status' => 'read', 'user_id' => $alice->id]] as $payload) {
            $this->postJson("/api/v1/conversations/$id/receipts", $payload)->assertUnprocessable();
        }
        Message::findOrFail($message)->delete();
        $this->postJson("/api/v1/conversations/$id/receipts", ['message_ids' => [$message], 'status' => 'read'])->assertUnprocessable();
        $this->assertDatabaseCount('message_reads', 0);
    }

    public function test_signals_dispatch_only_after_commit_and_retries_do_not_duplicate_them(): void
    {
        [, , $id] = $this->pair();
        Event::fake([ChatSignal::class]);
        DB::beginTransaction();
        $payload = ['body' => 'Committed', 'client_uuid' => (string) Str::uuid()];
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated();
        Event::assertNothingDispatched();
        DB::commit();
        Event::assertDispatchedTimes(ChatSignal::class, 1);
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertOk();
        Event::assertDispatchedTimes(ChatSignal::class, 1);
        DB::beginTransaction();
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'Rolled back', 'client_uuid' => (string) Str::uuid()])->assertCreated();
        DB::rollBack();
        Event::assertDispatchedTimes(ChatSignal::class, 1);
        $this->assertDatabaseCount('messages', 1);
    }

    public function test_queued_signals_exclude_revoked_sessions_and_never_contain_message_bodies(): void
    {
        [$alice, $bob, $id] = $this->pair();
        $bobSession = UserSession::forceCreate(['id' => (string) Str::uuid(), 'user_id' => $bob->id, 'expires_at' => now()->addHour(), 'last_active_at' => now()]);
        $signal = new ChatSignal($id, 'message', $alice->id);
        $this->assertCount(2, $signal->broadcastOn());
        $bobSession->forceFill(['revoked_at' => now()])->save();
        $this->assertCount(1, $signal->broadcastOn());
        $this->assertSame(['conversation_id', 'kind', 'user_id', 'typing', 'expires_at'], array_keys($signal->broadcastWith()));
        DB::table('conversation_participants')->where('user_id', $alice->id)->update(['left_at' => now()]);
        $this->assertSame([], $signal->broadcastOn());
    }

    public function test_incremental_catch_up_and_receipt_refresh_remain_membership_scoped(): void
    {
        [, $bob, $id] = $this->pair();
        $ids = [];
        for ($i = 0; $i < 4; $i++) {
            $ids[] = $this->postJson("/api/v1/conversations/$id/messages", ['body' => "Message $i", 'client_uuid' => (string) Str::uuid()])->json('data.id');
        }
        $this->getJson("/api/v1/conversations/$id/messages?after_id={$ids[1]}&per_page=1")->assertOk()->assertJsonPath('data.0.id', $ids[2])->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/conversations/$id/messages?ids[]={$ids[0]}&ids[]={$ids[3]}")->assertOk()->assertJsonCount(2, 'data');
        $this->getJson("/api/v1/conversations/$id/messages?after_id=-1")->assertUnprocessable();
        $this->getJson("/api/v1/conversations/$id/messages?ids[]=1&after_id=0")->assertUnprocessable();
        $other = User::factory()->create(['password' => 'StrongPassword123!']);
        $this->switchTo($other);
        $this->getJson("/api/v1/conversations/$id/messages?after_id=0")->assertForbidden();
        $this->getJson("/api/v1/conversations/$id/messages?ids[]={$ids[0]}")->assertForbidden();
    }

    public function test_expired_or_revoked_device_sessions_cannot_authorize_channels(): void
    {
        [$alice] = $this->pair();
        $channel = $this->postJson('/api/v1/realtime/heartbeat')->json('data.channel');
        UserSession::where('user_id', $alice->id)->update(['revoked_at' => now()]);
        Auth::forgetGuards();
        $this->authorize('private-'.$channel)->assertUnauthorized();
        $this->login($alice);
        $channel = $this->postJson('/api/v1/realtime/heartbeat')->json('data.channel');
        UserSession::where('user_id', $alice->id)->update(['expires_at' => now()->subSecond()]);
        Auth::forgetGuards();
        $this->authorize('private-'.$channel)->assertUnauthorized();
    }

    public function test_realtime_rate_limits_do_not_consume_each_others_budgets(): void
    {
        [, , $id] = $this->pair();
        for ($i = 0; $i < 20; $i++) {
            $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertNoContent();
        }
        for ($i = 0; $i < 12; $i++) {
            $channel = $this->postJson('/api/v1/realtime/heartbeat')->assertOk()->json('data.channel');
        }
        $this->postJson('/api/v1/realtime/heartbeat')->assertTooManyRequests();
        $this->authorize('private-'.$channel)->assertOk();
    }
}
