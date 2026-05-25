<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('logs:clear', function () {
    $days = (int) ($this->option('days') ?? 7);
    $logPath = storage_path('logs');

    if (!file_exists($logPath)) {
        $this->info('No logs directory found.');
        return;
    }

    $files = glob($logPath . '/*.log');
    $cutoff = now()->subDays($days)->timestamp;
    $deletedCount = 0;
    $freedBytes = 0;

    foreach ($files as $file) {
        if (filemtime($file) < $cutoff) {
            $freedBytes += filesize($file);
            unlink($file);
            $deletedCount++;
        }
    }

    $this->info("Deleted {$deletedCount} log file(s).");

    if ($freedBytes > 0) {
        $this->info('Freed: ' . $this->formatBytes($freedBytes));
    } else {
        $this->info('Freed: 0 B');
    }
})->purpose('Delete log files older than specified days')
  ->option('days', 'Number of days to retain (default: 7)', 'option', 7);

Schedule::command('logs:clear --days=7')->dailyAt('00:00');

/**
 * Format bytes into human-readable string.
 */
function formatBytes($bytes, $precision = 2)
{
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= (1 << (10 * $pow));
    return round($bytes, $precision) . ' ' . $units[$pow];
}
