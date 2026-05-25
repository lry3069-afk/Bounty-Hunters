<?php

namespace Tests\Feature;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private NotificationPreference $preference;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->preference = NotificationPreference::create([
            'user_id' => $this->user->id,
            'channel' => 'mail',
            'event_type' => 'order.created',
            'enabled' => true,
        ]);
    }

    public function test_user_can_list_preferences(): void
    {
        $response = $this->actingAs($this->user)->getJson('/api/notifications/preferences');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    public function test_user_can_update_single_preference(): void
    {
        $response = $this->actingAs($this->user)
            ->putJson("/api/notifications/preferences/{$this->preference->id}", [
                'enabled' => false,
            ]);

        $response->assertStatus(200);
        $this->preference->refresh();
        $this->assertFalse($this->preference->enabled);
    }

    public function test_user_cannot_update_another_users_preference(): void
    {
        $other = User::factory()->create();
        $response = $this->actingAs($other)
            ->putJson("/api/notifications/preferences/{$this->preference->id}", [
                'enabled' => false,
            ]);

        $response->assertStatus(403);
    }

    public function test_bulk_update_changes_multiple_preferences(): void
    {
        $p2 = NotificationPreference::create([
            'user_id' => $this->user->id,
            'channel' => 'slack',
            'event_type' => 'order.created',
            'enabled' => true,
        ]);

        $response = $this->actingAs($this->user)->postJson('/api/notifications/preferences/bulk', [
            'preferences' => [
                ['id' => $this->preference->id, 'enabled' => false],
                ['id' => $p2->id, 'enabled' => false],
            ],
        ]);

        $response->assertStatus(200);
        $this->preference->refresh();
        $p2->refresh();
        $this->assertFalse($this->preference->enabled);
        $this->assertFalse($p2->enabled);
    }

    public function test_bulk_update_rejects_other_users_preferences(): void
    {
        $other = User::factory()->create();
        $otherPref = NotificationPreference::create([
            'user_id' => $other->id,
            'channel' => 'mail',
            'event_type' => 'order.created',
            'enabled' => true,
        ]);

        $response = $this->actingAs($this->user)->postJson('/api/notifications/preferences/bulk', [
            'preferences' => [
                ['id' => $this->preference->id, 'enabled' => false],
                ['id' => $otherPref->id, 'enabled' => false],
            ],
        ]);

        $response->assertStatus(403);
    }
}