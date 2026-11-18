<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AddGroupMembersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && ($this->user()->can('manage', $this->route('group')));
    }

    public function rules(): array
    {
        return ['member_ids' => ['required', 'array', 'min:1', 'max:99'], 'member_ids.*' => ['required', 'integer', 'min:1', 'distinct'], 'role' => ['prohibited'], 'roles' => ['prohibited']];
    }
}
