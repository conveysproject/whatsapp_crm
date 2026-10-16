-- WhatsApp Admin: fixed WABA-only role (docs/prd-whatsapp-admin-role.md)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'whatsappAdmin';
