-- Nebrel backend schema. Apply with: psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS users (
    uuid        UUID PRIMARY KEY,
    username    TEXT        NOT NULL,
    hwid        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));

-- Flat permission flags, one row per granted capability.
CREATE TABLE IF NOT EXISTS user_permissions (
    uuid        UUID NOT NULL REFERENCES users (uuid) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (uuid, permission)
);

CREATE TABLE IF NOT EXISTS friendships (
    requester   UUID NOT NULL REFERENCES users (uuid) ON DELETE CASCADE,
    addressee   UUID NOT NULL REFERENCES users (uuid) ON DELETE CASCADE,
    -- pending, accepted or blocked
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (requester, addressee)
);

CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    uuid        UUID NOT NULL REFERENCES users (uuid) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_uuid_idx ON notifications (uuid, created_at DESC);

-- Additive migration for the friends and private messaging service.
ALTER TABLE users ADD COLUMN IF NOT EXISTS online_state TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_server BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_requests BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_server_invites BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON friendships (LEAST(requester, addressee), GREATEST(requester, addressee));
CREATE TABLE IF NOT EXISTS friend_preferences (
  owner UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  friend UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  ping BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY(owner, friend)
);
CREATE TABLE IF NOT EXISTS private_chats (
  id UUID PRIMARY KEY,
  user_a UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_a, user_b), CHECK(user_a < user_b)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES private_chats(id) ON DELETE CASCADE,
  sender UUID NOT NULL REFERENCES users(uuid),
  content TEXT NOT NULL CHECK(length(content) <= 4000),
  relates_to UUID REFERENCES chat_messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ, edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chat_messages_page_idx ON chat_messages(chat_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reactor UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 32),
  PRIMARY KEY(message_id, reactor, emoji)
);

-- Public names stay attached to their authenticated owner across reconnects.
CREATE TABLE IF NOT EXISTS hosted_servers (
 id uuid PRIMARY KEY,
 owner_uuid uuid NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
 slug text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hosted_servers_owner ON hosted_servers(owner_uuid);

-- Cosmetic capes: user-uploaded textures, held for review before they are
-- shown to anyone but their uploader. The image itself lives in the row
-- (small PNGs, no separate object storage needed) and is served straight
-- back out by cosmetics.js instead of a CDN.
CREATE TABLE IF NOT EXISTS cosmetic_capes (
  hash              TEXT PRIMARY KEY,
  owner_uuid        UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  image             BYTEA NOT NULL,
  review_state      TEXT NOT NULL DEFAULT 'IN_REVIEW' CHECK (review_state IN ('IN_REVIEW','ACCEPTED','DENIED')),
  elytra            BOOLEAN NOT NULL DEFAULT true,
  uses              INT NOT NULL DEFAULT 0,
  moderator_message TEXT NOT NULL DEFAULT 'In Review',
  blur_hash         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cosmetic_capes_owner_idx ON cosmetic_capes(owner_uuid);
CREATE INDEX IF NOT EXISTS cosmetic_capes_accepted_idx ON cosmetic_capes(review_state, created_at DESC);

CREATE TABLE IF NOT EXISTS cape_favorites (
  uuid       UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  cape_hash  TEXT NOT NULL REFERENCES cosmetic_capes(hash) ON DELETE CASCADE,
  PRIMARY KEY(uuid, cape_hash)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_cape TEXT REFERENCES cosmetic_capes(hash) ON DELETE SET NULL;
