<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Pagination\Cursor;

class SearchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['q' => ['required', 'string', 'min:2', 'max:100'], 'conversation_id' => ['sometimes', 'integer', 'min:1'], 'cursor' => ['sometimes', 'required', 'string', 'max:1024', function (string $attribute, mixed $value, Closure $fail): void {
            $cursor = Cursor::fromEncoded($value)?->toArray();
            if (! $cursor || ! isset($cursor['id']) || ! (is_int($cursor['id']) || is_string($cursor['id'])) || ! ctype_digit((string) $cursor['id']) || ! is_bool($cursor['_pointsToNextItems'] ?? null)) {
                $fail('Invalid search cursor.');
            }
        }]];
    }
}
