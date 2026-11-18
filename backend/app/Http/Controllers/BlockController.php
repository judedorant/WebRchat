<?php

namespace App\Http\Controllers;

use App\Events\ChatSignal;
use App\Models\Conversation;
use App\Models\User;
use App\Models\UserBlock;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class BlockController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => UserBlock::where('blocker_id', $request->user()->id)->with('blocked:id,name')->orderByDesc('id')->get()->map(fn ($block) => ['user_id' => $block->blocked_id, 'name' => $block->blocked?->name ?? 'Former member'])]);
    }

    public function store(Request $request, User $user): Response
    {
        return $this->change($request, $user, true);
    }

    public function destroy(Request $request, User $user): Response
    {
        return $this->change($request, $user, false);
    }

    private function change(Request $request, User $user, bool $block): Response
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);
        abort_if($request->user()->id === $user->id, 422, 'You cannot block yourself.');
        DB::transaction(function () use ($request, $user, $block): void {
            $ids = [$request->user()->id, $user->id];
            sort($ids);
            User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $attributes = ['blocker_id' => $request->user()->id, 'blocked_id' => $user->id];
            if ($block) {
                UserBlock::unguarded(fn () => UserBlock::firstOrCreate($attributes));
            } else {
                UserBlock::where($attributes)->delete();
            }
            Audit::record($block ? 'user.blocked' : 'user.unblocked', $request->user(), ['user_id' => $user->id]);
            $conversation = Conversation::where('direct_user_low_id', $ids[0])->where('direct_user_high_id', $ids[1])->first();
            if ($conversation) {
                ChatSignal::dispatch($conversation->id, 'conversation', $request->user()->id);
            }
        });

        return response()->noContent();
    }
}
