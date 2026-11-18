<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReportRequest;
use App\Models\Message;
use App\Models\UserReport;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ReportController extends Controller
{
    public function store(ReportRequest $request): JsonResponse
    {
        abort_if($request->integer('reported_user_id') === $request->user()->id, 422, 'You cannot report yourself.');

        return DB::transaction(function () use ($request): JsonResponse {
            $message = $request->filled('message_id') ? Message::whereKey($request->integer('message_id'))->lockForUpdate()->firstOrFail() : null;
            if ($message) {
                Gate::authorize('view', $message->conversation);
                abort_unless($message->sender_id === $request->integer('reported_user_id'), 422, 'The reported member must be the message author.');
            }
            $report = UserReport::forceCreate(['reporter_id' => $request->user()->id, 'reported_user_id' => $request->integer('reported_user_id'), 'message_id' => $message?->id, 'reason' => $request->validated('reason'), 'status' => 'pending', 'evidence' => $message ? ['message_id' => $message->id, 'sender_id' => $message->sender_id, 'body' => $message->body, 'type' => $message->type, 'created_at' => $message->created_at->toIso8601String(), 'captured_at' => now()->toIso8601String()] : null]);
            Audit::record('report.created', $request->user(), ['report_id' => $report->id]);

            return response()->json(['data' => ['id' => $report->id, 'status' => 'pending']], 201);
        });
    }
}
