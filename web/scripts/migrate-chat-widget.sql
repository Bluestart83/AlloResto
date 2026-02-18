-- Migration: add chat widget fields to restaurants
-- Run on AlloResto database (SQLite or PostgreSQL)

ALTER TABLE restaurants ADD COLUMN chat_enabled BOOLEAN DEFAULT false;
ALTER TABLE restaurants ADD COLUMN chat_mode VARCHAR(20) DEFAULT 'text';
ALTER TABLE restaurants ADD COLUMN chat_title VARCHAR(100);
ALTER TABLE restaurants ADD COLUMN chat_open_on_load BOOLEAN DEFAULT false;
