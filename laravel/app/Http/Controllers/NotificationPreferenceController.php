<?php

namespace App\Http\Controllers;

use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function index(): JsonResponse
    {
        $preferences = NotificationPreference::where('user_id', auth()->id())->get();
        return response()->json($preferences);
    }

    public function update(Request $request, NotificationPreference $preference): JsonResponse
    {
        abort_unless($preference->user_id === auth()->id(), 403);

        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

        $preference->update($validated);
        return response()->json($preference);
    }

    public function bulkUpdate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preferences' => 'required|array',
            'preferences.*.id' => 'required|integer|exists:notification_preferences,id',
            'preferences.*.enabled' => 'required|boolean',
        ]);

        $ids = collect($validated['preferences'])->pluck('id');
        $userIds = NotificationPreference::whereIn('id', $ids)->pluck('user_id', 'id');

        // Ensure all preferences belong to the authenticated user
        foreach ($ids as $id) {
            abort_unless($userIds[$id] === auth()->id(), 403);
        }

        foreach ($validated['preferences'] as $pref) {
            NotificationPreference::where('id', $pref['id'])
                ->update(['enabled' => $pref['enabled']]);
        }

        return response()->json(['message' => 'Preferences updated']);
    }
}