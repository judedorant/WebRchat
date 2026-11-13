<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class SchemaSmoke extends Command
{
    protected $signature = 'app:schema-smoke';

    protected $description = 'Verify key MySQL constraints inside a rolled-back local transaction';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing']) || DB::getDriverName() !== 'mysql') {
            $this->error('Requires local/testing with MySQL. No changes made.');

            return self::FAILURE;
        }
        DB::beginTransaction();
        try {
            [$a, $b, $c] = User::factory()->count(3)->create()->modelKeys();
            $pair = ['type' => 'direct', 'created_by' => $a, 'direct_user_low_id' => $a, 'direct_user_high_id' => $b];
            $first = DB::table('conversations')->insertGetId($pair);
            $this->rejected(fn () => DB::table('conversations')->insert($pair), 1062);
            $this->rejected(fn () => DB::table('conversations')->insert(array_replace($pair, ['direct_user_low_id' => $b, 'direct_user_high_id' => $a])), 3819);
            $second = DB::table('conversations')->insertGetId(array_replace($pair, ['direct_user_high_id' => $c]));
            $message = ['conversation_id' => $first, 'sender_id' => $a, 'client_uuid' => (string) Str::uuid(), 'body' => 'Schema smoke'];
            $parent = DB::table('messages')->insertGetId($message);
            $this->rejected(fn () => DB::table('messages')->insert($message), 1062);
            $this->rejected(fn () => DB::table('messages')->insert(array_replace($message, ['conversation_id' => $second, 'client_uuid' => (string) Str::uuid(), 'reply_to_id' => $parent])), 1452);
            DB::table('messages')->insert(array_replace($message, ['client_uuid' => (string) Str::uuid(), 'reply_to_id' => $parent]));
            $this->rejected(fn () => DB::table('user_blocks')->insert(['blocker_id' => $a, 'blocked_id' => $a]), 3819);
            $this->info('MySQL: duplicate pairs, ordered pairs, client UUIDs, reply scope and self-block checks passed; valid reply accepted.');
        } finally {
            DB::rollBack();
        }

        return self::SUCCESS;
    }

    private function rejected(callable $operation, int $expectedCode): void
    {
        try {
            $operation();
        } catch (QueryException $exception) {
            if (($exception->errorInfo[1] ?? null) === $expectedCode) {
                return;
            }
            throw $exception;
        }
        throw new RuntimeException('Expected MySQL constraint violation '.$expectedCode);
    }
}
