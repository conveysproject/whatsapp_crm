-- Phone number normalization: strip leading + from all contacts.
-- After this migration, phone_number stores plain international digits (e.g. 919907072035)
-- instead of E.164 format (+919907072035). The unique constraint is unchanged.

-- Safety check: handle the edge case where stripping + would create a duplicate
-- (same org already has both "+91xxx" and "91xxx"). Those should not exist but
-- this avoids a constraint violation if they do.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT organization_id, LTRIM(phone_number, '+') AS stripped
    FROM contacts
    WHERE phone_number LIKE '+%'
    GROUP BY organization_id, LTRIM(phone_number, '+')
    HAVING COUNT(*) > 1
  ) AS dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot normalize: % organization(s) have duplicate phones after stripping +. Resolve manually first.', dup_count;
  END IF;
END $$;

-- Strip the + prefix
UPDATE contacts
SET phone_number = LTRIM(phone_number, '+')
WHERE phone_number LIKE '+%';
