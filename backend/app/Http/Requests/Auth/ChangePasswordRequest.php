<?php

namespace App\Http\Requests\Auth;

use App\Support\Passwords;
use Illuminate\Foundation\Http\FormRequest;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['current_password' => ['required', 'current_password:web', Passwords::maxBytes()], 'password' => ['required', 'confirmed', 'different:current_password', Passwords::rule()]];
    }
}
