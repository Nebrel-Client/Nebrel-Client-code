const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

export const env = {
  port: Number(required("PORT", "4000")),
  host: required("HOST", "127.0.0.1"),
  jwtSecret: required("JWT_SECRET"),
  tokenTtl: Number(required("TOKEN_TTL", "604800")),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
};

if (env.jwtSecret.length < 64 || env.jwtSecret === "change-me") throw new Error("JWT_SECRET must contain at least 64 random characters");
