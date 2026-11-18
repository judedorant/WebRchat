<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Tests\TestCase;

class SafetyDiscoveryTest extends TestCase
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

    public function test_search_only_returns_accessible_messages_and_escapes_wildcards_with_cursor_pagination(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $this->text($id, '100% exact_match private');
        $this->text($id, '1000 unrelated');
        $this->getJson('/api/v1/search/messages?q=100%25')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.body', '100% exact_match private');
        $this->getJson('/api/v1/search/messages?q=exact_')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/search/messages?q=x')->assertUnprocessable();
        $this->getJson('/api/v1/search/messages?q=private&cursor=garbage')->assertUnprocessable();
        $this->switchTo($outsider);
        $this->getJson('/api/v1/search/messages?q=private')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/search/messages?q=private&conversation_id=$id")->assertForbidden();
        $this->switchTo($b);
        $this->getJson('/api/v1/search/messages?q=private')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_removed_group_members_cannot_search_old_history(): void
    {
        [$a,$b,$outsider,$direct] = $this->setupChat();
        $id = $this->postJson('/api/v1/groups', ['name' => 'Private group', 'member_ids' => [$b->id]])->assertCreated()->json('data.id');
        $this->text($id, 'restricted-history');
        $this->deleteJson("/api/v1/groups/$id/members/{$b->id}")->assertNoContent();
        $this->switchTo($b);
        $this->getJson('/api/v1/search/messages?q=restricted')->assertJsonCount(0, 'data');
    }

    public function test_notifications_are_private_paginated_read_idempotently_and_do_not_include_message_content(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $payload = ['body' => 'sensitive contents', 'client_uuid' => (string) Str::uuid()];
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertCreated();
        $this->postJson("/api/v1/conversations/$id/messages", $payload)->assertOk();
        $this->assertDatabaseCount('notifications', 1);
        $this->getJson('/api/v1/notifications')->assertJsonCount(0, 'data');
        $this->switchTo($b);
        $response = $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('meta.unread_count', 1)->assertDontSee('sensitive contents');
        $nid = $response->json('data.0.id');
        $this->patchJson("/api/v1/notifications/$nid")->assertOk();
        $this->patchJson("/api/v1/notifications/$nid")->assertOk();
        $this->getJson('/api/v1/notifications')->assertJsonPath('meta.unread_count', 0);
        $this->switchTo($outsider);
        $this->patchJson("/api/v1/notifications/$nid")->assertNotFound();
    }

    public function test_blocking_is_idempotent_bidirectional_for_sends_typing_presence_and_group_admission_and_unblock_restores_send(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $this->putJson("/api/v1/blocks/{$b->id}")->assertNoContent();
        $this->putJson("/api/v1/blocks/{$b->id}")->assertNoContent();
        $this->assertDatabaseCount('user_blocks', 1);
        $this->getJson('/api/v1/blocks')->assertJsonPath('data.0.user_id', $b->id);
        $this->getJson("/api/v1/conversations/$id")->assertJsonPath('data.can_send', false);
        $this->putJson("/api/v1/blocks/{$a->id}")->assertUnprocessable();
        $this->switchTo($b);
        $this->postJson("/api/v1/conversations/$id/messages", ['body' => 'blocked', 'client_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->postJson("/api/v1/conversations/$id/typing", ['typing' => true])->assertForbidden();
        $this->postJson('/api/v1/realtime/auth', ['socket_id' => '123.456', 'channel_name' => "presence-conversations.$id"])->assertForbidden();
        $this->postJson('/api/v1/groups', ['name' => 'Circumvent', 'member_ids' => [$a->id]])->assertForbidden();
        $this->deleteJson("/api/v1/blocks/{$a->id}")->assertNoContent();
        $this->postJson('/api/v1/conversations', ['recipient_id' => $a->id])->assertForbidden();
        $this->switchTo($a);
        $this->deleteJson("/api/v1/blocks/{$b->id}")->assertNoContent();
        $this->text($id, 'Sending restored');
        $this->assertDatabaseHas('audit_logs', ['action' => 'user.blocked']);
    }

    public function test_reporting_rejects_outsider_evidence_wrong_author_and_privilege_injection_and_persists_only_authorized_report(): void
    {
        [$a,$b,$outsider,$id] = $this->setupChat();
        $mid = $this->text($id);
        $this->switchTo($b);
        $report = $this->postJson('/api/v1/reports', ['reported_user_id' => $a->id, 'message_id' => $mid, 'reason' => 'Unwanted abusive message'])->assertCreated()->assertJsonPath('data.status', 'pending')->json('data.id');
        $this->assertDatabaseHas('user_reports', ['id' => $report, 'reporter_id' => $b->id, 'message_id' => $mid]);
        $this->postJson('/api/v1/reports', ['reported_user_id' => $outsider->id, 'message_id' => $mid, 'reason' => 'Wrong author for evidence'])->assertUnprocessable();
        $this->postJson('/api/v1/reports', ['reported_user_id' => $a->id, 'reason' => 'Injection attempt here', 'status' => 'resolved'])->assertUnprocessable();
        $this->postJson('/api/v1/reports', ['reported_user_id' => $b->id, 'reason' => 'Self report is forbidden'])->assertUnprocessable();
        $this->switchTo($outsider);
        $this->postJson('/api/v1/reports', ['reported_user_id' => $a->id, 'message_id' => $mid, 'reason' => 'Cannot see this evidence'])->assertForbidden();
        $this->assertDatabaseCount('user_reports', 1);
        $this->getJson('/api/v1/admin/access')->assertForbidden();
        $this->assertDatabaseHas('audit_logs', ['action' => 'report.created']);
    }

    public function test_guests_unverified_and_suspended_users_cannot_use_discovery_or_safety_endpoints(): void
    {
        $this->getJson('/api/v1/notifications')->assertUnauthorized();
        $this->getJson('/api/v1/search/messages?q=hello')->assertUnauthorized();
        $user = User::factory()->unverified()->create(['password' => 'StrongPassword123!']);
        $this->login($user);
        $this->getJson('/api/v1/blocks')->assertForbidden();
        $this->postJson('/api/v1/reports', [])->assertForbidden();
        $user->forceFill(['email_verified_at' => now(), 'suspended_at' => now()])->save();
        $this->getJson('/api/v1/notifications')->assertForbidden();
    }

    public function test_search_and_notifications_page_without_duplicates_and_reject_malformed_structured_cursors(): void
    {
        [$a, $b, $outsider, $id] = $this->setupChat();
        for ($index = 0; $index < 32; $index++) {
            $this->text($id, 'Paged needle '.$index);
        }
        $first = $this->getJson('/api/v1/search/messages?q=needle')->assertOk()->assertJsonCount(30, 'data');
        $second = $this->getJson('/api/v1/search/messages?q=needle&cursor='.urlencode($first->json('meta.next_cursor')))->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame([], array_values(array_intersect(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id'))));
        $bad = rtrim(strtr(base64_encode(json_encode(['id' => ['bad'], '_pointsToNextItems' => true])), '+/', '-_'), '=');
        $this->getJson('/api/v1/search/messages?q=needle&cursor='.$bad)->assertUnprocessable();
        $bad = rtrim(strtr(base64_encode(json_encode(['id' => 1])), '+/', '-_'), '=');
        $this->getJson('/api/v1/search/messages?q=needle&cursor='.$bad)->assertUnprocessable();
        $this->switchTo($b);
        $page = $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.unread_count', 32);
        $this->getJson('/api/v1/notifications?cursor='.urlencode($page->json('meta.next_cursor')))->assertOk()->assertJsonCount(12, 'data');
    }

    public function test_conversation_search_includes_only_current_memberships_and_other_member_names(): void
    {
        [$a, $b, $outsider, $id] = $this->setupChat();
        $b->forceFill(['name' => 'Unique search person'])->save();
        $this->getJson('/api/v1/search/conversations?q=Unique')->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonCount(1, 'data');
        $this->switchTo($outsider);
        $this->getJson('/api/v1/search/conversations?q=Unique')->assertOk()->assertJsonCount(0, 'data');
    }
}
