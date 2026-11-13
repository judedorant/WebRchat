<?php

namespace App\Support;

use Illuminate\Validation\Rules\Password;

class Passwords
{
    public static function rule(): Password
    {
        return Password::min(12)->mixedCase()->numbers()->rules([self::maxBytes()]);
    }

    public static function maxBytes(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if (is_string($value) && strlen($value) > 72) {
                $fail('The password must not exceed 72 bytes.');
            }
        };
    }
}
