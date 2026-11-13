<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class GrantAdmin extends Command
{
    protected $signature = 'app:grant-admin {email} {--force : Confirm a production role change}';

    protected $description = 'Grant the admin role to an existing active, verified account';

    public function handle(): int
    {
        if (app()->environment('production') && ! $this->option('force')) {
            $this->error('Production requires --force to confirm the role change.');

            return self::FAILURE;
        }
        $user = User::where('email', mb_strtolower($this->argument('email')))->whereNull('suspended_at')->whereNotNull('email_verified_at')->first();
        if (! $user) {
            $this->error('No active, verified account found.');

            return self::FAILURE;
        }
        DB::transaction(function () use ($user) {
            $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['name' => 'admin'])->id]);
            Audit::record('role.admin_granted_by_cli', null, ['target_user_id' => $user->id]);
        });
        $this->info('Administrator role granted. No conversation membership or message access was granted.');

        return self::SUCCESS;
    }
}
