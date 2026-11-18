<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReactionRequest extends FormRequest
{
    public const EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🎉', '👎', '🔥'];

    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && $this->user()->can('send', $this->route('message')->conversation);
    }

    public function rules(): array
    {
        return ['emoji' => ['required', Rule::in(self::EMOJI)], 'user_id' => ['prohibited']];
    }
}
