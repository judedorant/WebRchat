<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class SchemaTest extends TestCase
{
    use RefreshDatabase;

    private function conversation(int $a, int $b): int
    {
        return DB::table('conversations')->insertGetId(['type' => 'direct', 'created_by' => $a, 'direct_user_low_id' => min($a, $b), 'direct_user_high_id' => max($a, $b), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_all_domain_tables_exist_and_role_seed_is_repeatable(): void
    {
        foreach (['users', 'roles', 'user_roles', 'conversations', 'conversation_participants', 'messages', 'message_attachments', 'message_reactions', 'message_reads', 'user_blocks', 'user_reports', 'notifications', 'audit_logs', 'platform_settings'] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->seed(RoleSeeder::class);
        $this->seed(RoleSeeder::class);
        $this->assertDatabaseCount('roles', 2);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_direct_pair_cannot_be_duplicated(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->modelKeys();
        $this->conversation($a, $b);
        $this->expectException(QueryException::class);
        $this->conversation($b, $a);
    }

    public function test_reversed_direct_pair_is_rejected(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->modelKeys();
        $this->expectException(QueryException::class);
        DB::table('conversations')->insert(['type' => 'direct', 'created_by' => $a, 'direct_user_low_id' => $b, 'direct_user_high_id' => $a]);
    }

    public function test_sender_client_uuid_is_unique_across_retries(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->modelKeys();
        $id = $this->conversation($a, $b);
        $data = ['conversation_id' => $id, 'sender_id' => $a, 'client_uuid' => (string) Str::uuid(), 'body' => 'Hello'];
        DB::table('messages')->insert($data);
        $this->expectException(QueryException::class);
        DB::table('messages')->insert($data);
    }

    public function test_reply_cannot_reference_another_conversation(): void
    {
        [$a, $b, $c] = User::factory()->count(3)->create()->modelKeys();
        $first = $this->conversation($a, $b);
        $second = $this->conversation($a, $c);
        $parent = DB::table('messages')->insertGetId(['conversation_id' => $first, 'sender_id' => $a, 'client_uuid' => (string) Str::uuid()]);
        $this->expectException(QueryException::class);
        DB::table('messages')->insert(['conversation_id' => $second, 'sender_id' => $a, 'client_uuid' => (string) Str::uuid(), 'reply_to_id' => $parent]);
    }

    public function test_blocking_self_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->expectException(QueryException::class);
        DB::table('user_blocks')->insert(['blocker_id' => $user->id, 'blocked_id' => $user->id]);
    }
}
