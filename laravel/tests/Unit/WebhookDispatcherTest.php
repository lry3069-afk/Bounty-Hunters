<?php

namespace Tests\Unit;

use App\Models\Webhook;
use App\Services\WebhookDispatcher;
use PHPUnit\Framework\TestCase;

class WebhookDispatcherTest extends TestCase
{
    private WebhookDispatcher $dispatcher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dispatcher = new WebhookDispatcher();
    }

    public function test_sign_generates_correct_hmac_sha256(): void
    {
        $payload = ['event' => 'test', 'data' => ['id' => 1]];
        $secret = 'test-secret-key-1234567890';

        $signature = $this->dispatcher->sign($payload, $secret);

        $this->assertStringStartsWith('sha256=', $signature);
        $expected = 'sha256=' . hash_hmac('sha256', json_encode($payload), $secret);
        $this->assertEquals($expected, $signature);
    }

    public function test_sign_is_deterministic(): void
    {
        $payload = ['foo' => 'bar'];
        $secret = 'my-secret';

        $sig1 = $this->dispatcher->sign($payload, $secret);
        $sig2 = $this->dispatcher->sign($payload, $secret);

        $this->assertEquals($sig1, $sig2);
    }

    public function test_retry_delay_exponential_backoff(): void
    {
        $this->assertEquals(60, $this->dispatcher->retryDelay(1));
        $this->assertEquals(120, $this->dispatcher->retryDelay(2));
        $this->assertEquals(240, $this->dispatcher->retryDelay(3));
        $this->assertEquals(480, $this->dispatcher->retryDelay(4));
        $this->assertEquals(960, $this->dispatcher->retryDelay(5));
    }

    public function test_retry_delay_grows_exponentially(): void
    {
        $delay1 = $this->dispatcher->retryDelay(1);
        $delay2 = $this->dispatcher->retryDelay(2);

        $this->assertGreaterThan($delay1, $delay2);
        $this->assertEquals($delay1 * 2, $delay2);
    }
}