<?php
/**
 * EmlakRadar Pro - Kurulum Sihirbazı
 * Veritabanı bağlantısını test eder ve database.php'yi günceller.
 * KURULUM TAMAMLANDIKTAN SONRA BU DOSYAYI SİLİN!
 */

$dbConfigPath = __DIR__ . '/../app/config/database.php';

$message = null;
$success = false;
$currentConfig = [
    'host'     => 'localhost',
    'dbname'   => 'hetagayrimenkul_db',
    'username' => 'hetagayrimenkul_user',
    'password' => '',
];

// Mevcut config'den değerleri oku
if (file_exists($dbConfigPath)) {
    $content = file_get_contents($dbConfigPath);
    if (preg_match("/\\\$host\s*=\s*'([^']*)'/", $content, $m))     $currentConfig['host']     = $m[1];
    if (preg_match("/\\\$dbname\s*=\s*'([^']*)'/", $content, $m))   $currentConfig['dbname']   = $m[1];
    if (preg_match("/\\\$username\s*=\s*'([^']*)'/", $content, $m)) $currentConfig['username'] = $m[1];
    if (preg_match("/\\\$password\s*=\s*'([^']*)'/", $content, $m)) $currentConfig['password'] = $m[1];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $host     = trim($_POST['host'] ?? 'localhost');
    $dbname   = trim($_POST['dbname'] ?? '');
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $action   = $_POST['action'] ?? 'test';

    // Bağlantıyı test et
    $dsn = "mysql:host={$host};dbname={$dbname};charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);

        if ($action === 'save') {
            // database.php dosyasını güncelle
            $newContent = "<?php\n/**\n * EmlakRadar Pro - Veritabanı Bağlantısı\n * PDO MySQL bağlantı yöneticisi\n */\n\nclass Database {\n    private static \$instance = null;\n\n    private static \$host     = '" . addslashes($host) . "';\n    private static \$dbname   = '" . addslashes($dbname) . "';\n    private static \$username = '" . addslashes($username) . "';\n    private static \$password = '" . addslashes($password) . "';\n    private static \$charset  = 'utf8mb4';\n\n    private function __construct() {}\n    private function __clone() {}\n\n    public static function getInstance() {\n        if (self::\$instance === null) {\n            \$dsn = sprintf(\n                'mysql:host=%s;dbname=%s;charset=%s',\n                self::\$host,\n                self::\$dbname,\n                self::\$charset\n            );\n            \$options = [\n                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,\n                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,\n                PDO::ATTR_EMULATE_PREPARES   => false,\n                PDO::MYSQL_ATTR_INIT_COMMAND => \"SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci\",\n            ];\n            try {\n                self::\$instance = new PDO(\$dsn, self::\$username, self::\$password, \$options);\n            } catch (PDOException \$e) {\n                error_log('Veritabani baglanti hatasi: ' . \$e->getMessage());\n                die(json_encode(['success' => false, 'message' => 'Veritabani baglantisi kurulamadi.']));\n            }\n        }\n        return self::\$instance;\n    }\n\n    public static function getConnection() {\n        return self::getInstance();\n    }\n}\n\nfunction db() {\n    return Database::getInstance();\n}\n";

            if (file_put_contents($dbConfigPath, $newContent) !== false) {
                $success = true;
                $message = "Veritabani baglantisi basariyla kaydedildi! database.php guncellendi.";
                $currentConfig = compact('host', 'dbname', 'username', 'password');
            } else {
                $message = "HATA: database.php yazılamadı. Dosya izinlerini kontrol edin.";
            }
        } else {
            $success = true;
            $message = "Bağlantı BAŞARILI! Sunucu: " . $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
        }
    } catch (PDOException $e) {
        $message = "Bağlantı BAŞARISIZ: " . $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EmlakRadar Pro - Kurulum Sihirbazı</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); width: 100%; max-width: 500px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1e3a5f, #2e6da4); padding: 32px; color: #fff; text-align: center; }
        .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
        .header p { font-size: 13px; opacity: 0.8; }
        .body { padding: 32px; }
        .alert { padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.5; }
        .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
        .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .form-group { margin-bottom: 18px; }
        label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        input { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; color: #111827; transition: border-color .2s; }
        input:focus { outline: none; border-color: #2e6da4; box-shadow: 0 0 0 3px rgba(46,109,164,0.15); }
        .btn-row { display: flex; gap: 10px; margin-top: 24px; }
        button { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .2s; }
        button:hover { opacity: 0.88; }
        .btn-test { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .btn-save { background: #1e3a5f; color: #fff; }
        .warning { margin-top: 20px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 12px; color: #92400e; }
    </style>
</head>
<body>
<div class="card">
    <div class="header">
        <h1>Veritabanı Kurulum Sihirbazı</h1>
        <p>EmlakRadar Pro - Bağlantı Yapılandırması</p>
    </div>
    <div class="body">
        <?php if ($message): ?>
            <div class="alert <?= $success ? 'alert-success' : 'alert-error' ?>">
                <?= htmlspecialchars($message) ?>
                <?php if ($success && isset($_POST['action']) && $_POST['action'] === 'save'): ?>
                    <br><br><strong>Sonraki adım:</strong> <a href="index.php">Ana sayfaya git</a> ve bu dosyayı silin: <code>setup.php</code>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="POST">
            <div class="form-group">
                <label>Sunucu (Host)</label>
                <input type="text" name="host" value="<?= htmlspecialchars($_POST['host'] ?? $currentConfig['host']) ?>" placeholder="localhost">
            </div>
            <div class="form-group">
                <label>Veritabanı Adı</label>
                <input type="text" name="dbname" value="<?= htmlspecialchars($_POST['dbname'] ?? $currentConfig['dbname']) ?>" placeholder="hetagayrimenkul_db">
            </div>
            <div class="form-group">
                <label>Kullanıcı Adı</label>
                <input type="text" name="username" value="<?= htmlspecialchars($_POST['username'] ?? $currentConfig['username']) ?>" placeholder="hetagayrimenkul_user">
            </div>
            <div class="form-group">
                <label>Şifre</label>
                <input type="password" name="password" value="<?= htmlspecialchars($_POST['password'] ?? $currentConfig['password']) ?>" placeholder="Veritabanı şifresi">
            </div>
            <div class="btn-row">
                <button type="submit" name="action" value="test" class="btn-test">Bağlantıyı Test Et</button>
                <button type="submit" name="action" value="save" class="btn-save">Kaydet &amp; Uygula</button>
            </div>
        </form>

        <div class="warning">
            <strong>Guvenlik Uyarisi:</strong> Kurulum tamamlandiktan sonra bu dosyayi mutlaka silin veya yeniden adlandirin. Aksi halde veritabani bilgileriniz risk altinda olabilir.
        </div>
    </div>
</div>
</body>
</html>
