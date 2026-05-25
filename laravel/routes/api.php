<?php

use App\Http\Controllers\NotificationPreferenceController;
use App\Http\Controllers\WebhookController;
use Illuminate\Support\Facades\Route;

Route::apiResource('webhooks', WebhookController::class);
Route::post('webhooks/{webhook}/deliver', [WebhookController::class, 'deliver']);

Route::get('notifications/preferences', [NotificationPreferenceController::class, 'index']);
Route::put('notifications/preferences/{preference}', [NotificationPreferenceController::class, 'update']);
Route::post('notifications/preferences/bulk', [NotificationPreferenceController::class, 'bulkUpdate']);