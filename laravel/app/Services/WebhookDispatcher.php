<?php

namespace App\Services;

use App\Models\Webhook;
use App\Models\WebhookDelivery;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WebhookDispatcher
{
    private const MAX_ATTEMPTS = 5;
    private const BASE_DELAY = 60; // seconds

    public function dispatch(Webhook $webhook, string $event, array $payload): WebhookDelivery
    {
        $delivery = $webhook->deliveries()->create([
            'event' => $event,
            'payload' => $payload,
            'attempts' => 0,
        ]);

        $this->send($delivery);

        return $delivery;
    }

    public function send(WebhookDelivery $delivery): void
    {
        $webhook = $delivery->webhook;
        $attempt = $delivery->attempts + 1;

        $payload = $delivery->payload;
        $signature = $this->sign($payload, $webhook->secret);

        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'X-Webhook-Signature' => $signature,
            ])->post($webhook->url, $payload);

            $delivery->update([
                'response_code' => $response->status(),
                'attempts' => $attempt,
                'delivered_at' => $response->successful() ? now() : null,
                'next_retry_at' => $response->successful() ? null : $this->nextRetryAt($attempt),
            ]);
        } catch (\Exception $e) {
            Log::error('Webhook delivery failed: ' . $e->getMessage());
            $delivery->update([
                'response_code' => 0,
                'attempts' => $attempt,
                'next_retry_at' => $this->nextRetryAt($attempt),
            ]);
        }
    }

    public function sign(array $payload, string $secret): string
    {
        $body = json_encode($payload);
        return 'sha256=' . hash_hmac('sha256', $body, $secret);
    }

    public function shouldRetry(WebhookDelivery $delivery): bool
    {
        return $delivery->attempts < self::MAX_ATTEMPTS && $delivery->delivered_at === null;
    }

    public function retryDelay(int $attempt): int
    {
        return self::BASE_DELAY * (2 ** ($attempt - 1));
    }

    private function nextRetryAt(int $attempt): \Carbon\Carbon
    {
        return now()->addSeconds($this->retryDelay($attempt));
    }
}