<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id;
    }

    public function rules(): array
    {
        return ['reported_user_id' => ['required', 'integer', 'exists:users,id'], 'message_id' => ['nullable', 'integer', 'exists:messages,id'], 'reason' => ['required', 'string', 'min:10', 'max:1000', 'regex:/\S/u'], 'reporter_id' => ['prohibited'], 'status' => ['prohibited'], 'reviewed_by' => ['prohibited']];
    }
}
