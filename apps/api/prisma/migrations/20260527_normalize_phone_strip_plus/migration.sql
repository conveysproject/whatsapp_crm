-- Phone number normalization: strip leading + from all contacts.
-- After this migration, phone_number stores plain international digits (e.g. 919907072035)
-- instead of E.164 format (+919907072035). The unique constraint is unchanged.

-- Update contacts that have a + prefix, but only when doing so won't create
-- a unique constraint conflict with an existing no-+ contact in the same org.
-- Contacts that would conflict are left unchanged (rare edge case).
UPDATE contacts
SET phone_number = LTRIM(phone_number, '+')
WHERE phone_number LIKE '+%'
AND NOT EXISTS (
  SELECT 1 FROM contacts b
  WHERE b.organization_id = contacts.organization_id
  AND b.phone_number = LTRIM(contacts.phone_number, '+')
  AND b.id != contacts.id
);
