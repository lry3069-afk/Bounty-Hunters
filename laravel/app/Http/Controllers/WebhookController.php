<?php

namespace App\Http\Controllers;

use App\Models\Webhook;
use App\Services\WebhookDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    public function index(): JsonResponse
    {
        $webhooks = Webhook::all();
        return response()->json($webhooks);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'required|url',
            'secret' => 'required|string|min:16',
            'events' => 'required|array',
            'active' => 'boolean',
        ]);

        $webhook = Webhook::create($validated);
        return response()->json($webhook, 201);
    }

    public function show(Webhook $webhook): JsonResponse
    {
        return response()->json($webhook->load('deliveries'));
    }

    public function update(Request $request, Webhook $webhook): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'url',
            'secret' => 'string|min:16',
            'events' => 'array',
            'active' => 'boolean',
        ]);

        $webhook->update($validated);
        return response()->json($webhook);
    }

    public function destroy(Webhook $webhook): JsonResponse
    {
        $webhook->delete();
        return response()->json(null, 204);
    }

    public function deliver(Request $request, Webhook $webhook): JsonResponse
    {
        $validated = $request->validate([
            'event' => 'required|string',
            'payload' => 'required|array',
        ]);

        $dispatcher = app(WebhookDispatcher::class);
        $delivery = $dispatcher->dispatch($webhook, $validated['event'], $validated['payload']);

        return response()->json($delivery);
    }
}