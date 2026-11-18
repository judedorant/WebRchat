<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreConversationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id;
    }

    public function rules(): array
    {
        return [
            'recipient_id' => ['required', 'integer', 'min:1', 'not_in:'.$this->user()->id],
            'type' => ['prohibited'], 'participants' => ['prohibited'], 'created_by' => ['prohibited'],
        ];
    }
}
