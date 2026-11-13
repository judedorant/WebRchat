<?php

namespace App\Http\Requests\Auth;

use App\Support\Passwords;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->email)) {
            $this->merge(['email' => mb_strtolower(trim($this->email))]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:254', Rule::unique('users')],
            'password' => ['required', 'confirmed', Passwords::rule()],
            'role' => ['prohibited'], 'roles' => ['prohibited'], 'email_verified_at' => ['prohibited'],
            'suspended_at' => ['prohibited'], 'auth_version' => ['prohibited'],
        ];
    }
}
