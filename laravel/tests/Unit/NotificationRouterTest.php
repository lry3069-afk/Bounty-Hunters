<?php

namespace Tests\Unit;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\NotificationRouter;
use PHPUnit\Framework\TestCase;

class NotificationRouterTest extends TestCase
{
    private NotificationRouter $router;

    protected function setUp(): void
    {
        parent::setUp();
        $this->router = new NotificationRouter();
    }

    public function test_valid_channels_constant(): void
    {
        $this->assertEquals(['mail', 'slack', 'database'], NotificationRouter::VALID_CHANNELS);
    }

    public function test_channel_constants(): void
    {
        $this->assertEquals('mail', NotificationRouter::CHANNEL_MAIL);
        $this->assertEquals('slack', NotificationRouter::CHANNEL_SLACK);
        $this->assertEquals('database', NotificationRouter::CHANNEL_DATABASE);
    }
}