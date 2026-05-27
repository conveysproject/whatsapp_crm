-- Phone number normalization: strip leading + from all contacts.
-- After this migration, phone_number stores plain international digits (e.g. 919907072035)
-- instead of E.164 format (+919907072035). The unique constraint is unchanged.

-- Remove + contacts that would cause a unique conflict with an already-correct (no-+) contact.
-- The no-+ version is already in the right format (created from WhatsApp inbound).
DELETE FROM contacts
WHERE phone_number LIKE '+%'
AND id IN (
  SELECT a.id
  FROM contacts a
  JOIN contacts b
    ON b.organization_id = a.organization_id
    AND b.phone_number = LTRIM(a.phone_number, '+')
  WHERE a.phone_number LIKE '+%'
);

-- Strip the + prefix from all remaining contacts that still have it.
UPDATE contacts
SET phone_number = LTRIM(phone_number, '+')
WHERE phone_number LIKE '+%';
