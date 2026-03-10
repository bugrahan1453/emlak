<?php
/**
 * EmlakRadar Pro - Veritabanı Bağlantısı
 * PDO MySQL bağlantı yöneticisi
 */

class Database {
    private static ?PDO $instance = null;

    private static string $host     = 'localhost';
    private static string $dbname   = 'hetagayrimenkul_db';
    private static string $username = 'hetagayrimenkul_user';
    private static string $password = 'Hetaemrecan99@';
    private static string $charset  = 'utf8mb4';

    private function __construct() {}
    private function __clone() {}

    public static function getInstance(): PDO {
        if (self::$instance === null) {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                self::$host,
                self::$dbname,
                self::$charset
            );
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
            ];
            try {
                self::$instance = new PDO($dsn, self::$username, self::$password, $options);
            } catch (PDOException $e) {
                error_log('Veritabanı bağlantı hatası: ' . $e->getMessage());
                die(json_encode(['success' => false, 'message' => 'Veritabanı bağlantısı kurulamadı.']));
            }
        }
        return self::$instance;
    }

    public static function getConnection(): PDO {
        return self::getInstance();
    }
}

// Kısa kullanım fonksiyonu
function db(): PDO {
    return Database::getInstance();
}
