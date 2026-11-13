<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CsrfTest extends TestCase
{
    use RefreshDatabase;

    public function test_cookie_spa_login_without_csrf_token_is_rejected(): void
    {
        $this->app['env'] = 'local';
        $this->withHeader('Origin', 'http://localhost:5173')
            ->postJson('/api/v1/login', ['email' => 'a@example.test', 'password' => 'StrongPassword123!'])
            ->assertStatus(419);
    }
}
