<?php

namespace App\Observers;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\NotificationRouter;

class UserObserver
{
    public const DEFAULT_EVENTS = [
        'user.registered',
        'user.password_reset',
        'order.created',
        'order.shipped',
    ];

    public const DEFAULT_CHANNELS = [
        NotificationRouter::CHANNEL_MAIL,
        NotificationRouter::CHANNEL_DATABASE,
    ];

    public function created(User $user): void
    {
        $preferences = [];

        foreach (self::DEFAULT_EVENTS as $eventType) {
            foreach (self::DEFAULT_CHANNELS as $channel) {
                $preferences[] = [
                    'user_id' => $user->id,
                    'channel' => $channel,
                    'event_type' => $eventType,
                    'enabled' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
        }

        // Use chunks for large datasets; fine for defaults here
        foreach (array_chunk($preferences, 50) as $chunk) {
            NotificationPreference::insert($chunk);
        }
    }
}