import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton connection for Next.js
const globalForDb = globalThis as unknown as { conn: ReturnType<typeof postgres> };

const conn =
  globalForDb.conn ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export * from "./schema";
