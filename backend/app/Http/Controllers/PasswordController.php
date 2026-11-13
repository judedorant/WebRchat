<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\User;
use App\Support\Audit;
use App\Support\SessionManager;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordController extends Controller
{
    public function forgot(ForgotPasswordRequest $request)
    {
        $input = $request->validated();
        $user = User::where('email', mb_strtolower(trim($input['email'])))->whereNull('suspended_at')->first();
        if ($user) {
            Password::sendResetLink(['email' => $user->email]);
        }

        return response()->json(['message' => 'If an eligible account exists, a password reset link has been sent.'], 202);
    }

    public function reset(ResetPasswordRequest $request)
    {
        $input = $request->validated();
        $input['email'] = mb_strtolower(trim($input['email']));
        $status = Password::reset($input, function (User $user, string $password) {
            abort_if($user->suspended_at, 403, 'This account is suspended.');
            DB::transaction(function () use ($user, $password) {
                $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60), 'auth_version' => $user->auth_version + 1])->save();
                $user->sessions()->whereNull('revoked_at')->update(['revoked_at' => now()]);
                Audit::record('auth.password_reset', $user);
            });
            event(new PasswordReset($user));
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => ['This password reset link is invalid or expired.']]);
        }

        return response()->json(['message' => 'Your password has been reset. Please sign in.']);
    }

    public function change(ChangePasswordRequest $request, SessionManager $sessions)
    {
        $data = $request->validated();
        DB::transaction(function () use ($request, $data, $sessions) {
            $user = $request->user();
            $user->forceFill(['password' => Hash::make($data['password']), 'remember_token' => Str::random(60)])->save();
            $sessions->revokeOthers($request, $user);
            Audit::record('auth.password_changed', $user);
        });

        return response()->json(['message' => 'Password updated. Your other sessions have been signed out.']);
    }
}
