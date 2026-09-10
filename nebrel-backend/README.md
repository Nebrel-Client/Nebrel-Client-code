# Nebrel Backend

Node.js 24, PostgreSQL 16 and Redis 7 backend for the Nebrel launcher.
See `NEBREL-ANLEITUNG.md` in this archive for deployment to the existing FeatherPanel server.

Preserve `.env` when updating. Start with `npm ci --omit=dev && node --env-file=.env src/server.js`.
Schema migrations run transactionally on startup. Back up the database before upgrading.

For a new local installation, copy `.env.example` to `.env` and configure the database, Redis and a random JWT_SECRET of at least 64 characters. Run a single backend process.

Tests: `npm ci` then `npm test`. Tests use isolated PGlite databases, real Fastify HTTP/WebSocket handlers and mocked Mojang session verification; they do not touch production data.

Authentication verifies a one-use login challenge against Mojang, and never accepts a username or UUID alone as proof of ownership. HTTP and WebSocket requests require a signed Bearer token. Friend relationships and chat membership are checked server-side.

Pack metadata under `data/` is optional; missing files return empty catalogs. In-game server presence and invites, account bridge login, and custom cape/CDN services are not provided by this backend.
