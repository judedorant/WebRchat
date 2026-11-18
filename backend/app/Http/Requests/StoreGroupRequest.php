<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && (true);
    }

    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120', 'regex:/\S/u'], 'member_ids' => ['required', 'array', 'min:1', 'max:99'], 'member_ids.*' => ['required', 'integer', 'min:1', 'distinct', 'not_in:'.$this->user()->id], 'created_by' => ['prohibited'], 'roles' => ['prohibited'], 'type' => ['prohibited'], 'image_path' => ['prohibited']];
    }
}
