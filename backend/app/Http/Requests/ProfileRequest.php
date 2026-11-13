<?php

namespace App\Http\Requests;

use App\Support\Passwords;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->user());
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
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'email' => ['sometimes', 'required', 'email', 'max:254', Rule::unique('users')->ignore($this->user()->id)],
            'bio' => ['sometimes', 'nullable', 'string', 'max:500'],
            'current_password' => [Rule::requiredIf($this->has('email') && $this->email !== $this->user()->email), 'nullable', 'current_password:web', Passwords::maxBytes()],
            'role' => ['prohibited'], 'roles' => ['prohibited'], 'id' => ['prohibited'],
            'suspended_at' => ['prohibited'], 'email_verified_at' => ['prohibited'], 'auth_version' => ['prohibited'],
        ];
    }
}
