<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Pagination\Cursor;

class ChatPageRequest extends FormRequest
{
    public function authorize(): bool
    {
        $conversation = $this->route('conversation');

        return ! $conversation || $this->user()->can('view', $conversation);
    }

    public function rules(): array
    {
        return [
            'after_id' => ['sometimes', 'integer', 'min:0'],
            'ids' => ['sometimes', 'array', 'min:1', 'max:100', 'prohibits:after_id,cursor'],
            'ids.*' => ['integer', 'min:1', 'distinct'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'cursor' => ['sometimes', 'required', 'string', 'max:1024', function (string $attribute, mixed $value, Closure $fail): void {
                $parameters = Cursor::fromEncoded($value)?->toArray();
                if (! $parameters || ! isset($parameters['id']) || ! (is_int($parameters['id']) || is_string($parameters['id'])) || ! is_bool($parameters['_pointsToNextItems'] ?? null) || ! ctype_digit((string) $parameters['id']) || (int) $parameters['id'] < 1) {
                    $fail('The cursor is invalid.');
                }
                if (! $this->route('conversation') && validator(['updated_at' => $parameters['updated_at'] ?? null], ['updated_at' => ['required', 'date']])->fails()) {
                    $fail('The conversation cursor is invalid.');
                }
            }],
        ];
    }
}
