<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TypingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id
            && $this->user()->can('send', $this->route('conversation'));
    }

    public function rules(): array
    {
        return ['typing' => ['required', 'boolean'], 'user_id' => ['prohibited'], 'body' => ['prohibited']];
    }
}
