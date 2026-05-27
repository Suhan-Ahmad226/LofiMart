# Prisma Migration Status

The Commerce OS runtime is now wired around PostgreSQL through Prisma for the App Router
inventory and warehouse APIs, health checks, cache warm jobs, and worker processes.

Current production baseline
- PostgreSQL is the primary database via `DATABASE_URL`.
- Redis backs cache, queue, and distributed rate limiting.
- BullMQ workers run from `src/server/worker.ts`.
- The custom `server.ts` surface now uses Prisma/PostgreSQL for runtime persistence.

Recommended local bootstrap
1. Start infrastructure with `docker compose up -d`.
2. Copy `.env.example` to `.env`.
3. Run `npm install`.
4. Run `npm run prisma:generate`.
5. Run `npm run prisma:migrate -- --name init_commerce_os`.
6. Start the app with `npm run dev`.
7. Start workers with `npm run worker`.

Production smoke checklist
1. Run `npm run prisma:deploy`.
2. Run `npm run build`.
3. Run `npm run start`.
4. Verify `GET /api/health` returns a healthy response.
5. Run `npm run start:worker`.
