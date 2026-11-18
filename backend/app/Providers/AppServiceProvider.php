<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        require base_path('routes/channels.php');
        foreach (['uploads' => 12, 'reactions' => 60, 'notifications' => 120, 'search' => 60, 'safety' => 30, 'reports' => 6, 'groups' => 30, 'group-create' => 6, 'group-images' => 12, 'realtime-auth' => 240, 'realtime-heartbeat' => 12, 'typing' => 120, 'receipts' => 120] as $name => $attempts) {
            RateLimiter::for($name, fn (Request $request) => Limit::perMinute($attempts)->by((string) $request->user()->id));
        }
        RateLimiter::for('messages', fn (Request $request) => Limit::perMinute(60)->by((string) $request->user()->id));
        RateLimiter::for('login', fn (Request $request) => [Limit::perMinute(30)->by($request->ip()), Limit::perMinute(5)->by(Str::lower((string) $request->input('email')).'|'.$request->ip())]);
        RateLimiter::for('registration', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('recovery', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        ResetPassword::createUrlUsing(fn ($user, string $token) => rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->email]));
        VerifyEmail::createUrlUsing(function ($user) {
            $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())]);

            return rtrim(config('app.frontend_url'), '/').'/verify-email?'.http_build_query(['verification_url' => $url]);
        });
    }
}
