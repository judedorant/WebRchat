<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileRequest;
use App\Http\Resources\UserResource;
use App\Support\Audit;
use App\Support\SessionManager;
use Illuminate\Support\Facades\DB;

class ProfileController extends Controller
{
    public function update(ProfileRequest $request, SessionManager $sessions)
    {
        $user = $request->user();
        $emailChanged = $request->has('email') && $request->email !== $user->email;
        DB::transaction(function () use ($request, $user, $emailChanged, $sessions) {
            $user->forceFill($request->safe()->only(['name', 'email', 'bio']));
            if ($emailChanged) {
                $user->email_verified_at = null;
            }
            $user->save();
            if ($emailChanged) {
                $sessions->revokeOthers($request, $user);
            }
            Audit::record('profile.updated', $user, ['fields' => array_keys($request->safe()->only(['name', 'email', 'bio']))]);
        });
        if ($emailChanged) {
            $user->sendEmailVerificationNotification();
        }

        return new UserResource($user);
    }
}
