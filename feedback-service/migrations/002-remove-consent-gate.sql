-- Run ONCE using a migration account. Back up the table before execution.
-- Removes the two consent columns and their historical values, not feedback content.
-- Deploy the updated feedback backend immediately afterwards: older code inserts these columns.
ALTER TABLE mini_feedback.feedback_items
  DROP COLUMN privacy_version,
  DROP COLUMN consented_at;
