<?php
require_once dirname(__DIR__) . '/app/config/app.php';
require_once APP_DIR . '/helpers/JWT.php';
require_once APP_DIR . '/helpers/Functions.php';
require_once APP_DIR . '/middleware/Auth.php';

Auth::logout();
redirect(APP_URL . '/index.php');
