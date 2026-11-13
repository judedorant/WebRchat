<?php

namespace App\Http\Requests\Auth;

use App\Support\Passwords;
use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['email' => ['required', 'email', 'max:254'], 'token' => ['required', 'string', 'max:255'], 'password' => ['required', 'confirmed', Passwords::rule()]];
    }
}
