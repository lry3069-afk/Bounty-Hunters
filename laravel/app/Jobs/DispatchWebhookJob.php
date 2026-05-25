<?php

namespace App\Jobs;

use App\Models\Webhook;
use App\Services\WebhookDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class DispatchWebhookJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(
        public Webhook $webhook,
        public string $event,
        public array $payload
    ) {}

    public function handle(WebhookDispatcher $dispatcher): void
    {
        $delivery = $dispatcher->dispatch($this->webhook, $this->event, $this->payload);

        while ($dispatcher->shouldRetry($delivery)) {
            $delivery->refresh();
            if ($delivery->delivered_at !== null) {
                break;
            }
            $delay = $dispatcher->retryDelay($delivery->attempts);
            $this->release($delay);
        }
    }

    public function backoff(): array
    {
        return [60, 120, 240, 480, 960];
    }
}