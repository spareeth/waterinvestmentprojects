-- M12 (PLAN v0.4 0b.11): country and WBG coordinator accounts keep the password an admin handed out.
-- Data only: clears the forced password change for existing accounts of those roles.
UPDATE "User" SET "mustChangePassword" = false WHERE "role" IN ('COUNTRY', 'WBG_COORDINATOR') AND "mustChangePassword" = true;
