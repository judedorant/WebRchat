<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Notifications\ResetPassword;
use App\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'StrongPassword123!';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
        Notification::fake();
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create(array_merge(['password' => self::PASSWORD], $attributes));
    }

    private function login(User $user): void
    {
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();
    }

    public function test_registration_creates_only_user_role_hashes_password_and_sends_verification(): void
    {
        $this->postJson('/api/v1/register', ['name' => 'Alex', 'email' => 'ALEX@example.test', 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])
            ->assertCreated()->assertJsonPath('data.roles', ['user'])->assertJsonPath('data.email_verified_at', null)->assertJsonMissingPath('data.password')->assertJsonMissingPath('token');
        $user = User::firstOrFail();
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertSame('alex@example.test', $user->email);
        Notification::assertSentTo($user, VerifyEmail::class);
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertDatabaseCount('user_sessions', 1);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_registration_rejects_privileged_fields_and_weak_passwords(): void
    {
        $this->postJson('/api/v1/register', ['name' => 'Alex', 'email' => 'alex@example.test', 'password' => 'short', 'password_confirmation' => 'short', 'roles' => ['admin']])->assertUnprocessable()->assertJsonValidationErrors(['password', 'roles']);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_guest_cannot_access_profiles_directory_sessions_or_admin(): void
    {
        foreach (['me', 'users', 'sessions', 'admin/access'] as $route) {
            $this->getJson('/api/v1/'.$route)->assertUnauthorized();
        }
    }

    public function test_requests_without_an_approved_spa_origin_are_rejected(): void
    {
        $this->withHeader('Origin', 'https://untrusted.example');
        $this->postJson('/api/v1/login', ['email' => 'a@example.test', 'password' => self::PASSWORD])->assertStatus(419);
    }

    public function test_wrong_credentials_are_generic_and_login_is_rate_limited(): void
    {
        $user = $this->user();
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertTooManyRequests();
    }

    public function test_suspended_account_cannot_log_in(): void
    {
        $user = $this->user(['suspended_at' => now()]);
        $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_suspension_invalidates_an_existing_session(): void
    {
        $user = $this->user();
        $this->login($user);
        $user->forceFill(['suspended_at' => now()])->save();
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertForbidden();
        $this->assertGuest('web');
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_logout_revokes_current_session_and_clears_authentication(): void
    {
        $user = $this->user();
        $this->login($user);
        $this->postJson('/api/v1/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
        $this->assertNotNull($user->sessions()->first()->revoked_at);
    }

    public function test_unverified_user_cannot_read_directory_until_signed_verification(): void
    {
        $user = $this->user(['email_verified_at' => null]);
        $this->login($user);
        $this->get('/api/v1/users')->assertForbidden()->assertHeader('Content-Type', 'application/json');
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $user->id, 'hash' => sha1($user->email)]);
        $this->getJson($url)->assertOk();
        $this->assertTrue($user->fresh()->hasVerifiedEmail());
        $this->getJson('/api/v1/users')->assertOk();
    }

    public function test_expired_tampered_and_other_users_verification_links_are_denied(): void
    {
        $user = $this->user(['email_verified_at' => null]);
        $other = $this->user(['email_verified_at' => null]);
        $this->login($user);
        $expired = URL::temporarySignedRoute('verification.verify', now()->subMinute(), ['id' => $user->id, 'hash' => sha1($user->email)]);
        $this->getJson($expired)->assertForbidden();
        $otherUrl = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $other->id, 'hash' => sha1($other->email)]);
        $this->getJson($otherUrl)->assertForbidden();
        $tampered = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $user->id, 'hash' => str_repeat('a', 40)]);
        $this->getJson($tampered)->assertForbidden();
        $this->assertFalse($user->fresh()->hasVerifiedEmail());
    }

    public function test_forgot_password_hides_account_existence_and_uses_frontend_link(): void
    {
        $user = $this->user();
        $expected = $this->postJson('/api/v1/forgot-password', ['email' => $user->email])->assertAccepted()->json();
        $this->postJson('/api/v1/forgot-password', ['email' => 'missing@example.test'])->assertAccepted()->assertExactJson($expected);
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user) {
            $link = $notification->toMail($user)->actionUrl;

            return str_contains($link, '/reset-password?') && str_contains($link, 'token=');
        });
    }

    public function test_password_reset_is_single_use_and_revokes_sessions(): void
    {
        $user = $this->user();
        $this->login($user);
        $token = Password::createToken($user);
        $input = ['email' => $user->email, 'token' => $token, 'password' => 'ChangedPassword123!', 'password_confirmation' => 'ChangedPassword123!'];
        $this->postJson('/api/v1/reset-password', $input)->assertOk();
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
        $this->assertTrue(Hash::check('ChangedPassword123!', $user->fresh()->password));
        $this->postJson('/api/v1/reset-password', $input)->assertUnprocessable();
        $this->assertNotNull($user->sessions()->first()->revoked_at);
    }

    public function test_invalid_and_expired_reset_tokens_fail(): void
    {
        $user = $this->user();
        $token = Password::createToken($user);
        $data = ['email' => $user->email, 'token' => 'invalid', 'password' => 'ChangedPassword123!', 'password_confirmation' => 'ChangedPassword123!'];
        $this->postJson('/api/v1/reset-password', $data)->assertUnprocessable();
        $this->travel(61)->minutes();
        $this->postJson('/api/v1/reset-password', array_replace($data, ['token' => $token]))->assertUnprocessable();
        $this->assertTrue(Hash::check(self::PASSWORD, $user->fresh()->password));
    }

    public function test_profile_changes_require_reauthentication_for_email_and_cannot_escalate_roles(): void
    {
        $user = $this->user();
        $this->login($user);
        $this->patchJson('/api/v1/profile', ['name' => 'Updated Name', 'bio' => '<script>alert(1)</script>'])->assertOk()->assertJsonPath('data.name', 'Updated Name');
        $this->patchJson('/api/v1/profile', ['roles' => ['admin']])->assertUnprocessable();
        $this->patchJson('/api/v1/profile', ['email' => 'new@example.test'])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->patchJson('/api/v1/profile', ['email' => 'new@example.test', 'current_password' => self::PASSWORD])->assertOk()->assertJsonPath('data.email_verified_at', null);
        Notification::assertSentTo($user, VerifyEmail::class);
        $this->assertSame('new@example.test', $user->fresh()->email);
    }

    public function test_user_directory_does_not_expose_other_users_private_fields(): void
    {
        $user = $this->user();
        $target = $this->user(['name' => 'Visible Person']);
        $this->user(['name' => 'Hidden Person', 'suspended_at' => now()]);
        $this->login($user);
        $this->getJson('/api/v1/users/'.$target->id)->assertOk()->assertJsonMissingPath('data.email')->assertJsonMissingPath('data.roles')->assertJsonMissingPath('data.password');
        $this->getJson('/api/v1/users?search=Visible')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/users?search=Hidden')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_policy_allows_only_self_profile_edits_even_for_admin(): void
    {
        $user = $this->user();
        $other = $this->user();
        $user->roles()->attach(Role::firstOrCreate(['name' => 'admin']));
        $this->assertFalse($user->can('update', $other));
        $this->assertTrue($user->can('update', $user));
    }

    public function test_admin_access_requires_verified_admin_role(): void
    {
        $user = $this->user();
        $this->login($user);
        $this->getJson('/api/v1/admin/access')->assertForbidden();
        $user->roles()->attach(Role::firstOrCreate(['name' => 'admin']));
        Auth::forgetGuards();
        $this->getJson('/api/v1/admin/access')->assertOk();
        $this->assertDatabaseCount('conversation_participants', 0);
    }

    public function test_password_change_checks_current_password_and_rotates_version(): void
    {
        $user = $this->user();
        $this->login($user);
        $before = $user->auth_version;
        $this->putJson('/api/v1/password', ['current_password' => 'wrong', 'password' => 'ChangedPassword123!', 'password_confirmation' => 'ChangedPassword123!'])->assertUnprocessable();
        $this->putJson('/api/v1/password', ['current_password' => self::PASSWORD, 'password' => 'ChangedPassword123!', 'password_confirmation' => 'ChangedPassword123!'])->assertOk();
        $this->assertGreaterThan($before, $user->fresh()->auth_version);
        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_sessions_are_scoped_and_revoked_records_reject_further_requests(): void
    {
        $user = $this->user();
        $other = $this->user();
        $this->login($user);
        $record = $other->sessions()->forceCreate(['id' => (string) Str::uuid(), 'last_active_at' => now(), 'expires_at' => now()->addHour()]);
        $this->getJson('/api/v1/sessions')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.current', true);
        $this->deleteJson('/api/v1/sessions/'.$record->id)->assertNotFound();
        $id = $user->sessions()->first()->id;
        $this->deleteJson('/api/v1/sessions/'.$id)->assertNoContent();
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_revoke_others_preserves_current_session_and_revokes_other_records(): void
    {
        $user = $this->user();
        $this->login($user);
        $other = $user->sessions()->forceCreate(['id' => (string) Str::uuid(), 'last_active_at' => now(), 'expires_at' => now()->addHour()]);
        $this->deleteJson('/api/v1/sessions/others')->assertOk();
        $this->assertNotNull($other->fresh()->revoked_at);
        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_password_length_cannot_exceed_bcrypt_byte_limit(): void
    {
        $password = 'Aa1!'.str_repeat('é', 40);
        $this->postJson('/api/v1/register', ['name' => 'Alex', 'email' => 'long@example.test', 'password' => $password, 'password_confirmation' => $password])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_admin_cli_requires_verified_user_and_is_idempotent(): void
    {
        $unverified = $this->user(['email_verified_at' => null]);
        $this->artisan('app:grant-admin', ['email' => $unverified->email])->assertFailed();
        $user = $this->user();
        $this->artisan('app:grant-admin', ['email' => $user->email])->assertSuccessful();
        $this->artisan('app:grant-admin', ['email' => $user->email])->assertSuccessful();
        $this->assertTrue($user->fresh()->hasRole('admin'));
        $this->assertDatabaseCount('user_roles', 1);
    }

    public function test_login_rotates_session_id(): void
    {
        $user = $this->user();
        $this->get('/sanctum/csrf-cookie')->assertNoContent();
        $before = session()->getId();
        $this->login($user);
        $this->assertNotSame($before, session()->getId());
    }

    public function test_hash_shaped_password_is_treated_as_plaintext_not_a_trusted_hash(): void
    {
        $password = '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $this->postJson('/api/v1/register', ['name' => 'Alex', 'email' => 'hash-shaped@example.test', 'password' => $password, 'password_confirmation' => $password])->assertCreated();
        $user = User::firstOrFail();
        $this->assertNotSame($password, $user->password);
        $this->assertTrue(Hash::check($password, $user->password));
    }
}
