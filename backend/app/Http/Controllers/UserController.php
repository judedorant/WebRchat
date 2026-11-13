<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:100']]);
        $users = User::whereNotNull('email_verified_at')->whereNull('suspended_at')
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('name', 'like', '%'.addcslashes($search, '%_\\').'%'))
            ->orderBy('id')->cursorPaginate(20);

        return UserResource::collection($users);
    }

    public function show(User $user)
    {
        Gate::authorize('view', $user);

        return new UserResource($user);
    }
}
