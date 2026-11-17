-- Feedback service: MySQL 5.7.8+ / 8.x, InnoDB, utf8mb4.
-- Run using a database administrator against the intended MySQL instance.
-- Initial schema only; IF NOT EXISTS does not upgrade existing tables.
-- Application connections must use UTC and strict SQL mode.
CREATE DATABASE IF NOT EXISTS mini_feedback
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mini_feedback;

-- Store HMAC-SHA256(app_id + separator + verified OpenID), not raw OpenID.
-- HMAC secret belongs in server configuration, never in the database/client.
-- This is pseudonymisation, NOT anonymisation. Never accept identity from client.
CREATE TABLE IF NOT EXISTS feedback_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  app_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identity_hash BINARY(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_identity (app_id, identity_hash)
) ENGINE=InnoDB;

-- Admin login and session handling must be implemented separately.
-- password_hash: scrypt encoded string; never store plaintext passwords.
CREATE TABLE IF NOT EXISTS feedback_admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category ENUM('pronunciation','meaning','new_word','other') NOT NULL DEFAULT 'other',
  content VARCHAR(500) NOT NULL,
  related_word VARCHAR(64) DEFAULT NULL,
  status ENUM('pending','processing','resolved','closed') NOT NULL DEFAULT 'pending',
  privacy_version VARCHAR(32) NOT NULL,
  consented_at DATETIME(3) NOT NULL,
  user_read_at DATETIME(3) DEFAULT NULL,
  last_public_reply_at DATETIME(3) DEFAULT NULL,
  resolved_at DATETIME(3) DEFAULT NULL,
  purge_after DATETIME(3) DEFAULT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_request (user_id, request_id),
  KEY ix_user_list (user_id, created_at, id),
  KEY ix_status_list (status, created_at, id),
  KEY ix_purge (purge_after),
  CONSTRAINT fk_item_user FOREIGN KEY (user_id) REFERENCES feedback_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Only admins write replies/notes in v1. User API MUST filter visibility='public'.
CREATE TABLE IF NOT EXISTS feedback_replies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  feedback_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED DEFAULT NULL,
  visibility ENUM('public','internal') NOT NULL DEFAULT 'public',
  content VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_feedback_replies (feedback_id, created_at, id),
  CONSTRAINT fk_reply_item FOREIGN KEY (feedback_id) REFERENCES feedback_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_reply_admin FOREIGN KEY (admin_id) REFERENCES feedback_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Update item status and append history in the SAME transaction.
CREATE TABLE IF NOT EXISTS feedback_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  feedback_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED DEFAULT NULL,
  from_status ENUM('pending','processing','resolved','closed') NOT NULL,
  to_status ENUM('pending','processing','resolved','closed') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_feedback_history (feedback_id, created_at, id),
  CONSTRAINT fk_history_item FOREIGN KEY (feedback_id) REFERENCES feedback_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_admin FOREIGN KEY (admin_id) REFERENCES feedback_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Optional: replace password AND host before executing these lines separately.
-- Restrict host to the feedback service network; do not default to '%'.
-- CREATE USER 'feedback_app'@'SERVICE_HOST' IDENTIFIED BY 'REPLACE_WITH_RANDOM_PASSWORD';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mini_feedback.* TO 'feedback_app'@'SERVICE_HOST';
-- Runtime user needs no CREATE, DROP, GRANT or access to dictionary databases.
