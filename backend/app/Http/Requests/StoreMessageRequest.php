<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id
            && $this->user()->can('send', $this->route('conversation'));
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('client_uuid'))) {
            $this->merge(['client_uuid' => strtolower($this->input('client_uuid'))]);
        }
    }

    public function rules(): array
    {
        return [
            'client_uuid' => ['required', 'uuid'],
            'body' => ['required', 'string', 'max:4000', 'regex:/\S/u'],
            'sender_id' => ['prohibited'], 'conversation_id' => ['prohibited'],
            'type' => ['prohibited'], 'reply_to_id' => ['nullable', 'integer', Rule::exists('messages', 'id')->where('conversation_id', $this->route('conversation')->id)->whereNull('deleted_at')], 'attachments' => ['prohibited'],
        ];
    }
}
