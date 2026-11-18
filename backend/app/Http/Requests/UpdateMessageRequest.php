<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && $this->user()->can('update', $this->route('message'));
    }

    public function rules(): array
    {
        return ['body' => ['required', 'string', 'max:4000', 'regex:/\S/u'], 'sender_id' => ['prohibited'], 'conversation_id' => ['prohibited'], 'type' => ['prohibited'], 'client_uuid' => ['prohibited'], 'reply_to_id' => ['prohibited']];
    }
}
