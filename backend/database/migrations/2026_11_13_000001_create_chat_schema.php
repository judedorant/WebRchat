<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable();
            $table->string('bio', 500)->nullable();
            $table->timestamp('last_seen_at')->nullable()->index();
            $table->timestamp('suspended_at')->nullable()->index();
            $table->softDeletes();
        });
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 32)->unique();
            $table->timestamps();
        });
        Schema::create('user_roles', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['user_id', 'role_id']);
            $table->index('role_id');
        });
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['direct', 'group']);
            $table->string('name', 120)->nullable();
            $table->string('image_path')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('direct_user_low_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('direct_user_high_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
            // Conversations are retained; users archive them through their own membership.
            $table->unique(['direct_user_low_id', 'direct_user_high_id'], 'direct_pair_unique');
            $table->index(['last_message_at', 'id']);
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE conversations ADD CONSTRAINT conversation_pair_check CHECK ((type = 'direct' AND direct_user_low_id IS NOT NULL AND direct_user_high_id IS NOT NULL AND direct_user_low_id < direct_user_high_id) OR (type = 'group' AND direct_user_low_id IS NULL AND direct_user_high_id IS NULL))");
        } else {
            // SQLite has no ALTER TABLE ADD CHECK. Equivalent insert/update triggers
            // keep local schema tests meaningful; MySQL is the production target.
            foreach (['INSERT', 'UPDATE'] as $event) {
                $name = 'conversation_pair_'.strtolower($event);
                DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON conversations WHEN NOT ((NEW.type = 'direct' AND NEW.direct_user_low_id IS NOT NULL AND NEW.direct_user_high_id IS NOT NULL AND NEW.direct_user_low_id < NEW.direct_user_high_id) OR (NEW.type = 'group' AND NEW.direct_user_low_id IS NULL AND NEW.direct_user_high_id IS NULL)) BEGIN SELECT RAISE(ABORT, 'Invalid conversation pair'); END");
            }
        }
        Schema::create('conversation_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('role', ['owner', 'admin', 'member'])->default('member');
            $table->timestamp('joined_at')->useCurrent();
            $table->timestamp('left_at')->nullable();
            $table->timestamp('muted_until')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
            $table->unique(['conversation_id', 'user_id']);
            $table->index(['user_id', 'left_at', 'conversation_id'], 'participant_user_active_index');
        });
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->restrictOnDelete();
            $table->uuid('client_uuid');
            $table->enum('type', ['text', 'image', 'file', 'voice'])->default('text');
            $table->text('body')->nullable();
            $table->unsignedBigInteger('reply_to_id')->nullable();
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['sender_id', 'client_uuid']);
            $table->unique(['id', 'conversation_id'], 'message_conversation_unique');
            $table->index(['conversation_id', 'id']);
            $table->foreign(['reply_to_id', 'conversation_id'])->references(['id', 'conversation_id'])->on('messages')->restrictOnDelete();
        });
        Schema::create('message_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->string('disk', 32)->default('local');
            $table->string('path')->unique();
            $table->string('original_name');
            $table->string('mime_type', 127);
            $table->unsignedBigInteger('size');
            $table->enum('kind', ['image', 'file', 'voice']);
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
        });
        Schema::create('message_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('emoji', 32);
            $table->timestamps();
            $table->unique(['message_id', 'user_id', 'emoji']);
        });
        Schema::create('message_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['message_id', 'user_id']);
            $table->index(['user_id', 'read_at']);
        });
        Schema::create('user_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('blocker_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('blocked_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['blocker_id', 'blocked_id']);
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE user_blocks ADD CONSTRAINT block_other_user_check CHECK (blocker_id <> blocked_id)');
        } else {
            foreach (['INSERT', 'UPDATE'] as $event) {
                $name = 'block_other_user_'.strtolower($event);
                DB::unprepared("CREATE TRIGGER {$name} BEFORE {$event} ON user_blocks WHEN NEW.blocker_id = NEW.blocked_id BEGIN SELECT RAISE(ABORT, 'Cannot block self'); END");
            }
        }
        Schema::create('user_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reporter_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('reported_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('message_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('reason', 1000);
            $table->enum('status', ['pending', 'reviewing', 'resolved', 'dismissed'])->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->string('notifiable_type');
            $table->foreignId('notifiable_id')->constrained('users')->cascadeOnDelete();
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['notifiable_type', 'notifiable_id', 'read_at'], 'notification_user_unread_index');
        });
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 100)->index();
            $table->string('subject_type', 100)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->uuid('request_id')->nullable()->index();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['subject_type', 'subject_id']);
        });
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->json('value');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['platform_settings', 'audit_logs', 'notifications', 'user_reports', 'user_blocks', 'message_reads', 'message_reactions', 'message_attachments'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('messages', function (Blueprint $table) {
            $table->dropForeign(['reply_to_id', 'conversation_id']);
        });
        foreach (['messages', 'conversation_participants', 'conversations', 'user_roles', 'roles'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['last_seen_at']);
            $table->dropIndex(['suspended_at']);
            $table->dropColumn(['avatar_path', 'bio', 'last_seen_at', 'suspended_at', 'deleted_at']);
        });
    }
};
