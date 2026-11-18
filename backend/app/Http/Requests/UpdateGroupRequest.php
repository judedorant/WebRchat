<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && ($this->user()->can('manage', $this->route('group')));
    }

    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:120', 'regex:/\S/u'], 'created_by' => ['prohibited'], 'image_path' => ['prohibited'], 'type' => ['prohibited']];
    }
}
