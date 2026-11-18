<?php

namespace App\Support;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GroupManagement
{
    public const MAX_MEMBERS = 100;

    public function create(User $actor, array $data): Conversation
    {
        return DB::transaction(function () use ($actor, $data): Conversation {
            $ids = array_values(array_unique([$actor->id, ...array_map('intval', $data['member_ids'])]));
            $this->availableMembers($ids);
            $group = Conversation::forceCreate(['type' => 'group', 'name' => $data['name'], 'created_by' => $actor->id]);
            foreach ($ids as $id) {
                $group->participants()->attach($id, ['role' => $id === $actor->id ? 'owner' : 'member', 'joined_at' => now()]);
            }
            $this->notify($group, $actor, 'added', array_values(array_diff($ids, [$actor->id])));
            ChatSignal::dispatch($group->id, 'membership', $actor->id);

            return $group;
        }, attempts: 3);
    }

    public function rename(User $actor, Conversation $group, string $name): Conversation
    {
        return DB::transaction(function () use ($actor, $group, $name): Conversation {
            $group = $this->locked($group);
            Gate::forUser($actor)->authorize('manage', $group);
            if ($group->name !== $name) {
                $group->forceFill(['name' => $name])->save();
                $this->notify($group, $actor, 'renamed', $this->others($group, $actor));
                ChatSignal::dispatch($group->id, 'membership', $actor->id);
            }

            return $group;
        }, attempts: 3);
    }

    public function add(User $actor, Conversation $group, array $newIds): Conversation
    {
        return DB::transaction(function () use ($actor, $group, $newIds): Conversation {
            $group = $this->locked($group);
            Gate::forUser($actor)->authorize('manage', $group);
            $existing = $group->participants()->whereNull('conversation_participants.left_at')->pluck('users.id')->all();
            $all = array_values(array_unique([...$existing, ...array_map('intval', $newIds)]));
            if (count($all) > self::MAX_MEMBERS) {
                throw ValidationException::withMessages(['member_ids' => ['A group may have at most 100 active members.']]);
            }
            $added = array_values(array_diff($all, $existing));
            if (! $added) {
                return $group;
            }
            $this->availableMembers($added, $all);
            foreach ($added as $id) {
                $group->participants()->syncWithoutDetaching([$id => ['role' => 'member', 'joined_at' => now(), 'left_at' => null, 'archived_at' => null, 'muted_until' => null]]);
            }
            if ($added) {
                $group->touch();
                $this->notify($group, $actor, 'added', $added);
                ChatSignal::dispatch($group->id, 'membership', $actor->id);
            }

            return $group;
        }, attempts: 3);
    }

    public function role(User $actor, Conversation $group, int $targetId, string $role): Conversation
    {
        return DB::transaction(function () use ($actor, $group, $targetId, $role): Conversation {
            $group = $this->locked($group);
            Gate::forUser($actor)->authorize('manageRoles', $group);
            $target = $group->participants()->where('users.id', $targetId)->whereNull('conversation_participants.left_at')->firstOrFail();
            abort_if($targetId === $actor->id || $target->pivot->role === 'owner', 409, 'Transfer ownership to another active member before changing the owner role.');
            abort_if($target->suspended_at || ! $target->hasVerifiedEmail(), 403, 'This member is unavailable.');
            if ($target->pivot->role === $role) {
                return $group;
            }
            if ($role === 'owner') {
                $group->participants()->updateExistingPivot($actor->id, ['role' => 'admin']);
            }
            $group->participants()->updateExistingPivot($targetId, ['role' => $role]);
            $group->touch();
            $this->notify($group, $actor, $role === 'owner' ? 'ownership_transferred' : 'role_changed', [$targetId], ['role' => $role]);
            ChatSignal::dispatch($group->id, 'membership', $actor->id);

            return $group;
        }, attempts: 3);
    }

    public function remove(User $actor, Conversation $group, int $targetId, bool $leaving = false): void
    {
        DB::transaction(function () use ($actor, $group, $targetId, $leaving): void {
            $group = $this->locked($group);
            Gate::forUser($actor)->authorize($leaving ? 'view' : 'manage', $group);
            $target = $group->participants()->where('users.id', $targetId)->whereNull('conversation_participants.left_at')->firstOrFail();
            if ($leaving) {
                abort_unless($targetId === $actor->id, 403);
                abort_if($target->pivot->role === 'owner' && $group->participants()->whereNull('conversation_participants.left_at')->count() > 1, 409, 'Transfer ownership before leaving this group.');
            } else {
                $actorRole = $group->participants()->where('users.id', $actor->id)->firstOrFail()->pivot->role;
                abort_if($targetId === $actor->id || $target->pivot->role === 'owner' || ($actorRole === 'admin' && $target->pivot->role !== 'member'), 403, 'You cannot remove this member.');
            }
            $group->participants()->updateExistingPivot($targetId, ['left_at' => now(), 'role' => 'member']);
            $group->touch();
            $this->notify($group, $actor, $leaving ? 'left' : 'removed', [$targetId]);
            // A removed member receives an ID-only invalidation, never new content.
            ChatSignal::dispatch($group->id, 'membership', $actor->id, null, null, [$targetId]);
        }, attempts: 3);
    }

    public function image(User $actor, Conversation $group, ?UploadedFile $file): Conversation
    {
        $path = $file?->store('group-images', 'local');
        abort_if($file && ! $path, 500, 'Unable to save the group image.');
        try {
            return DB::transaction(function () use ($actor, $group, $path): Conversation {
                $group = $this->locked($group);
                Gate::forUser($actor)->authorize('manage', $group);
                $old = $group->image_path;
                $group->forceFill(['image_path' => $path])->save();
                $this->notify($group, $actor, 'image_changed', $this->others($group, $actor));
                ChatSignal::dispatch($group->id, 'membership', $actor->id);
                if ($old) {
                    DB::afterCommit(fn () => Storage::disk('local')->delete($old));
                }

                return $group;
            }, attempts: 3);
        } catch (\Throwable $exception) {
            if ($path) {
                Storage::disk('local')->delete($path);
            }
            throw $exception;
        }
    }

    private function locked(Conversation $group): Conversation
    {
        return Conversation::where('type', 'group')->whereKey($group->id)->lockForUpdate()->firstOrFail();
    }

    private function availableMembers(array $ids, ?array $groupIds = null): void
    {
        $members = User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
        abort_unless($members->count() === count($ids) && $members->every(fn (User $user) => $user->hasVerifiedEmail() && ! $user->suspended_at), 403, 'One or more members are unavailable.');
        $all = $groupIds ?? $ids;
        $blocked = UserBlock::where(fn ($blocks) => $blocks->whereIn('blocker_id', $ids)->whereIn('blocked_id', $all))
            ->orWhere(fn ($blocks) => $blocks->whereIn('blocked_id', $ids)->whereIn('blocker_id', $all))->exists();
        abort_if($blocked, 403, 'These members cannot share a new group membership.');
    }

    private function others(Conversation $group, User $actor): array
    {
        return $group->participants()->whereNull('conversation_participants.left_at')->where('users.id', '!=', $actor->id)->pluck('users.id')->all();
    }

    private function notify(Conversation $group, User $actor, string $action, array $recipients, array $extra = []): void
    {
        $rows = [];
        foreach (array_unique($recipients) as $id) {
            $rows[] = ['id' => (string) Str::uuid(), 'type' => 'group.membership', 'notifiable_type' => User::class, 'notifiable_id' => $id,
                'data' => json_encode(['conversation_id' => $group->id, 'group_name' => $group->name, 'action' => $action, 'actor_name' => $actor->name, ...$extra], JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now()];
        }
        if ($rows) {
            DB::table('notifications')->insert($rows);
        }
    }
}
