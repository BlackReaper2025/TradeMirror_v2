CREATE TABLE IF NOT EXISTS `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `broker_or_firm` text NOT NULL,
  `starting_balance` real NOT NULL,
  `current_balance` real NOT NULL,
  `daily_target` real NOT NULL,
  `account_type` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `selected_account_id` text,
  `theme_mode` text DEFAULT 'auto',
  `last_opened_page` text DEFAULT 'dashboard'
);

CREATE TABLE IF NOT EXISTS `daily_stats` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `day` text NOT NULL,
  `total_pnl` real DEFAULT 0,
  `trade_count` integer DEFAULT 0,
  `win_count` integer DEFAULT 0,
  `loss_count` integer DEFAULT 0,
  `avg_win` real DEFAULT 0,
  `avg_loss` real DEFAULT 0,
  `win_rate` real DEFAULT 0,
  `profit_factor` real DEFAULT 0,
  `max_drawdown` real DEFAULT 0,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);

CREATE TABLE IF NOT EXISTS `fatigue_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `duration_minutes` integer DEFAULT 90 NOT NULL,
  `is_enabled` integer DEFAULT 1 NOT NULL,
  `bypass_count` integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS `inspiration_folders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `local_path` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS `quotes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `text` text NOT NULL,
  `author` text NOT NULL,
  `category` text,
  `is_active` integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS `trade_journal` (
  `id` text PRIMARY KEY NOT NULL,
  `trade_id` text NOT NULL,
  `emotion_before` text,
  `emotion_after` text,
  `mistakes` text,
  `lessons` text,
  `confidence_score` integer,
  `discipline_score` integer,
  `freeform_notes` text,
  FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`)
);

CREATE TABLE IF NOT EXISTS `trades` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `opened_at` text NOT NULL,
  `closed_at` text,
  `instrument` text NOT NULL,
  `side` text NOT NULL,
  `setup_name` text,
  `entry_price` real,
  `stop_price` real,
  `target_price` real,
  `size` real,
  `fees` real DEFAULT 0,
  `pnl` real DEFAULT 0,
  `screenshot_path` text,
  `technical_notes` text,
  `tags` text,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
);
