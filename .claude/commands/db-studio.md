Open Prisma Studio to browse and edit the WBMSG database visually.

Prerequisites check:
- Confirm `DATABASE_URL` is set in `.env` (run `node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL ? 'DB URL set' : 'ERROR: DATABASE_URL missing')"`)
- If Docker isn't running, remind the user to run `docker compose up -d` first

Then execute: `npx prisma studio`

Prisma Studio opens at http://localhost:5555 and connects using `DATABASE_URL` from `.env`.
