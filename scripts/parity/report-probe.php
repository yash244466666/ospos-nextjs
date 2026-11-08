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
        // Summary_report/detailed reports create MEMORY temp tables with IF NOT
        // EXISTS, so a second report on the same connection would reuse stale
        // rows.
        foreach (['sales_items_taxes_temp', 'sales_report_payments_temp', 'sales_items_temp', 'receivings_items_temp'] as $tempTable) {
            $db->query('DROP TEMPORARY TABLE IF EXISTS ' . $db->prefixTable($tempTable));
        }
        if (!empty($item['create']) && method_exists($model, 'create')) {
            $model->create($inputs);
        }
        $data = $model->getData($inputs);
        $details = null;
        if (is_array($data) && isset($data['summary']) && isset($data['details'])) {
            $details = $data['details'];
            $data = $data['summary'];
        }
        $summary = !empty($item['summaryFromData'])
            ? $model->getSummaryData($data)
            : $model->getSummaryData($inputs);
        $result[$key] = [
            'data' => $data,
            'details' => $details,
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
