<?php

namespace App\Services;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Support\Collection;

class NotificationRouter
{
    public const CHANNEL_MAIL = 'mail';
    public const CHANNEL_SLACK = 'slack';
    public const CHANNEL_DATABASE = 'database';

    public const VALID_CHANNELS = [
        self::CHANNEL_MAIL,
        self::CHANNEL_SLACK,
        self::CHANNEL_DATABASE,
    ];

    /**
     * Route a notification event to all enabled channels for the user.
     *
     * @param User $user
     * @param string $eventType
     * @param array $data
     * @return Collection of channel names that received the notification
     */
    public function route(User $user, string $eventType, array $data): Collection
    {
        $enabledChannels = $this->getEnabledChannels($user, $eventType);
        $routed = collect();

        foreach ($enabledChannels as $channel) {
            $this->send($channel, $user, $eventType, $data);
            $routed->push($channel);
        }

        return $routed;
    }

    /**
     * Get all enabled channels for a user + event type.
     */
    public function getEnabledChannels(User $user, string $eventType): Collection
    {
        return NotificationPreference::where('user_id', $user->id)
            ->where('event_type', $eventType)
            ->where('enabled', true)
            ->pluck('channel');
    }

    /**
     * Check if a specific channel is enabled for a user + event.
     */
    public function isEnabled(User $user, string $channel, string $eventType): bool
    {
        return NotificationPreference::where('user_id', $user->id)
            ->where('channel', $channel)
            ->where('event_type', $eventType)
            ->where('enabled', true)
            ->exists();
    }

    /**
     * Send notification to a specific channel (stub — implement actual delivery).
     */
    protected function send(string $channel, User $user, string $eventType, array $data): void
    {
        match ($channel) {
            self::CHANNEL_MAIL => $this->sendMail($user, $eventType, $data),
            self::CHANNEL_SLACK => $this->sendSlack($user, $eventType, $data),
            self::CHANNEL_DATABASE => $this->sendDatabase($user, $eventType, $data),
        };
    }

    protected function sendMail(User $user, string $eventType, array $data): void
    {
        // Actual mail sending via Laravel Notification facade
        // $user->notify(new EventNotification($eventType, $data));
    }

    protected function sendSlack(User $user, string $eventType, array $data): void
    {
        // Actual Slack webhook dispatch
    }

    protected function sendDatabase(User $user, string $eventType, array $data): void
    {
        // Store in database notifications table
    }
}