<?php

namespace Tests\Feature;

use App\Support\Readiness;
use Mockery;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_readiness_checks_real_test_dependencies(): void
    {
        $this->getJson('/api/v1/health')->assertOk()
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.checks.database', 'ready')
            ->assertJsonPath('data.checks.cache', 'ready');
    }

    public function test_dependency_failure_returns_503_without_internal_details(): void
    {
        $mock = Mockery::mock(Readiness::class);
        $mock->shouldReceive('checks')->once()->andReturn(['database' => 'unavailable', 'cache' => 'ready']);
        $this->app->instance(Readiness::class, $mock);
        $this->getJson('/api/v1/health')->assertStatus(503)
            ->assertExactJson(['data' => ['status' => 'degraded', 'service' => 'WebRchat API', 'checks' => ['database' => 'unavailable', 'cache' => 'ready']]]);
    }

    public function test_unknown_api_route_uses_json(): void
    {
        $this->get('/api/v1/not-implemented')->assertNotFound()->assertHeader('Content-Type', 'application/json');
    }
}
