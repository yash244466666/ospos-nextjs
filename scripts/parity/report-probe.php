<?php
/**
 * Runs upstream OSPOS report models and prints their raw rows as JSON.
 * Invoked inside the oracle container; see report-differential.ts.
 */

chdir('/var/www/html');
define('FCPATH', '/var/www/html/public/');
define('ENVIRONMENT', 'production');
require 'app/Config/Paths.php';
$paths = new Config\Paths();
require $paths->systemDirectory . '/Boot.php';
CodeIgniter\Boot::bootConsole($paths);

$spec = json_decode($argv[1] ?? '[]', true);
$result = [];

foreach ($spec as $item) {
    $key = $item['key'];
    $class = '\\App\\Models\\Reports\\' . $item['class'];
    $inputs = $item['inputs'] ?? [];
    try {
        $model = new $class();
        $db = \Config\Database::connect();
        // Summary_report creates MEMORY temp tables with IF NOT EXISTS, so a
        // second report on the same connection would reuse stale rows.
        $db->query('DROP TEMPORARY TABLE IF EXISTS ' . $db->prefixTable('sales_items_taxes_temp'));
        $db->query('DROP TEMPORARY TABLE IF EXISTS ' . $db->prefixTable('sales_report_payments_temp'));
        $data = $model->getData($inputs);
        $summary = $model->getSummaryData($inputs);
        $result[$key] = [
            'data' => $data,
            'summary' => $summary,
            'columns' => $model->getDataColumns(),
        ];
    } catch (\Throwable $e) {
        $conn = isset($model) ? $model->db : ($db ?? null);
        $dbError = $conn ? $conn->error() : [];
        $lastQuery = $conn && $conn->getLastQuery() ? (string) $conn->getLastQuery() : '';
        $result[$key] = [
            'error' => get_class($e) . ': ' . $e->getMessage(),
            'dbError' => $dbError,
            'lastQuery' => $lastQuery,
        ];
    }
}

echo "\n---REPORT-JSON---\n" . json_encode($result) . "\n";
