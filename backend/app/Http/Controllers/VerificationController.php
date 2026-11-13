<?php

namespace App\Http\Controllers;

use App\Support\Audit;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;

class VerificationController extends Controller
{
    public function verify(EmailVerificationRequest $request)
    {
        $request->fulfill();
        Audit::record('auth.email_verified', $request->user());

        return response()->json(['message' => 'Email verified.']);
    }

    public function resend(Request $request)
    {
        if (! $request->user()->hasVerifiedEmail()) {
            $request->user()->sendEmailVerificationNotification();
        }

        return response()->json(['message' => 'A verification link has been sent if your email still needs verification.'], 202);
    }
}
