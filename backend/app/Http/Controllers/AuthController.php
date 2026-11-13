<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Support\Audit;
use App\Support\SessionManager;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request, SessionManager $sessions)
    {
        $user = DB::transaction(function () use ($request) {
            $user = User::create([...$request->safe()->only(['name', 'email']), 'password' => Hash::make($request->validated('password'))]);
            $user->refresh();
            $role = Role::firstOrCreate(['name' => 'user']);
            $user->roles()->attach($role);
            Audit::record('auth.registered', $user);

            return $user;
        });
        $sessions->login($request, $user);
        event(new Registered($user));

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function login(LoginRequest $request, SessionManager $sessions)
    {
        $user = User::where('email', $request->validated('email'))->first();
        // A fixed dummy hash prevents a missing account from skipping password hashing work.
        $valid = Hash::check($request->validated('password'), $user?->password ?? config('auth.dummy_password_hash'));
        if (! $user || ! $valid || $user->suspended_at) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are invalid.']]);
        }
        $sessions->login($request, $user);
        Audit::record('auth.logged_in', $user);

        return new UserResource($user);
    }

    public function logout(Request $request, SessionManager $sessions)
    {
        $request->user()->sessions()->whereKey($request->session()->get('device_session_id'))->update(['revoked_at' => now()]);
        Audit::record('auth.logged_out', $request->user());
        $sessions->invalidate($request);

        return response()->noContent();
    }

    public function me(Request $request)
    {
        return (new UserResource($request->user()))->response()->setStatusCode(200);
    }
}
