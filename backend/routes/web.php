<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json(['data' => ['service' => 'WebRchat API', 'version' => 'v1', 'phase' => 1]]));
