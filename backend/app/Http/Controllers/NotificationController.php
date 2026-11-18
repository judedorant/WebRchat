<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['cursor' => ['sometimes', 'required', 'string', 'max:1024']]);
        if ($request->has('cursor')) {
            $cursor = Cursor::fromEncoded($request->query('cursor'))?->toArray();
            abort_unless($cursor && isset($cursor['id'], $cursor['created_at']) && is_string($cursor['id']) && Str::isUuid($cursor['id']) && is_string($cursor['created_at']) && is_bool($cursor['_pointsToNextItems'] ?? null) && ! validator(['date' => $cursor['created_at']], ['date' => 'date'])->fails(), 422, 'Invalid notification cursor.');
        }
        $query = DB::table('notifications')->where('notifiable_type', User::class)->where('notifiable_id', $request->user()->id)->whereIn('type', ['group.membership', 'chat.message']);
        $count = (clone $query)->whereNull('read_at')->count();
        $page = $query->orderByDesc('created_at')->orderByDesc('id')->cursorPaginate(20);

        return response()->json(['data' => $page->getCollection()->map(fn ($row) => ['id' => $row->id, 'data' => json_decode($row->data, true), 'read_at' => $row->read_at ? Carbon::parse($row->read_at)->toIso8601String() : null, 'created_at' => Carbon::parse($row->created_at)->toIso8601String()]), 'meta' => ['next_cursor' => $page->nextCursor()?->encode(), 'unread_count' => $count]]);
    }

    public function update(Request $request, string $notification): JsonResponse
    {
        abort_unless($request->header('X-Chat-Account', (string) $request->user()->id) === (string) $request->user()->id, 403);
        $record = DB::table('notifications')->where('id', $notification)->where('notifiable_type', User::class)->where('notifiable_id', $request->user()->id)->whereIn('type', ['group.membership', 'chat.message'])->first();
        abort_unless($record, 404);
        DB::table('notifications')->where('id', $notification)->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['data' => ['id' => $notification, 'read' => true]]);
    }
}
