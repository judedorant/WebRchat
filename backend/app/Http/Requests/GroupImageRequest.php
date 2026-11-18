<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GroupImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && ($this->user()->can('manage', $this->route('group')));
    }

    public function rules(): array
    {
        return ['image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:max_width=2048,max_height=2048']];
    }
}
