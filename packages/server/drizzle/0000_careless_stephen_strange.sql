CREATE TABLE `sync_data` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
