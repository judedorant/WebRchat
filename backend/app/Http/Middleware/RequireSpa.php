<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireSpa
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->hasSession(), 419, 'Initialize the SPA session from an approved first-party origin.');

        $response = $next($request);
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
