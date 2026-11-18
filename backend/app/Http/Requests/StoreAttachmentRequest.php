<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAttachmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->header('X-Chat-Account', (string) $this->user()->id) === (string) $this->user()->id && $this->user()->can('send', $this->route('conversation'));
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('client_uuid'))) {
            $this->merge(['client_uuid' => strtolower($this->input('client_uuid'))]);
        }
    }

    public function rules(): array
    {
        return ['client_uuid' => ['required', 'uuid'], 'body' => ['nullable', 'string', 'max:4000'],
            'kind' => ['required', Rule::in(['image', 'file', 'voice'])],
            'file' => ['required', 'file', 'max:10240', 'mimetypes:image/jpeg,image/png,image/webp,application/pdf,text/plain,audio/webm,video/webm,audio/ogg,application/ogg,audio/mpeg,audio/mp4,audio/x-wav,audio/wav'],
            'reply_to_id' => ['nullable', 'integer', Rule::exists('messages', 'id')->where('conversation_id', $this->route('conversation')->id)->whereNull('deleted_at')],
            'sender_id' => ['prohibited'], 'message_id' => ['prohibited'], 'path' => ['prohibited']];
    }

    public function after(): array
    {
        return [function ($validator): void {
            $file = $this->file('file');
            if ($validator->errors()->any() || ! $file) {
                return;
            }
            $mime = $file->getMimeType();
            $valid = match ($this->input('kind')) {
                'image' => in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) && ($dimensions = @getimagesize($file->getRealPath())) && $dimensions[0] <= 4096 && $dimensions[1] <= 4096,
                'voice' => in_array($mime, ['audio/webm', 'video/webm', 'audio/ogg', 'application/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-wav', 'audio/wav'], true),
                default => in_array($mime, ['application/pdf', 'text/plain'], true),
            };
            if (! $valid) {
                $validator->errors()->add('file', 'Choose a valid image (up to 4096 × 4096), PDF, plain text file, or audio recording matching its kind.');
            }
        }];
    }
}
