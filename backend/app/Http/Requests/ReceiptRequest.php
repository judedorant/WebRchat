<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id
            && $this->user()->can('view', $this->route('conversation'));
    }

    public function rules(): array
    {
        return ['message_ids' => ['required', 'array', 'min:1', 'max:100'], 'message_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'status' => ['required', Rule::in(['delivered', 'read'])], 'user_id' => ['prohibited'], 'read_at' => ['prohibited'], 'delivered_at' => ['prohibited']];
    }
}
