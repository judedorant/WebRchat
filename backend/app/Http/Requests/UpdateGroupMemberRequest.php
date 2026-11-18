<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGroupMemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && ($this->user()->can('manageRoles', $this->route('group')));
    }

    public function rules(): array
    {
        return ['role' => ['required', Rule::in(['owner', 'admin', 'member'])], 'user_id' => ['prohibited']];
    }
}
