interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;

  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
}
