import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";

// Singleton pattern to avoid creating too many connections during dev hot-reload
const globalForDb = globalThis;

let client;
if (globalForDb.__pgClient) {
  client = globalForDb.__pgClient;
} else {
  client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pgClient = client;
  }
}

export const db = drizzle(client, { schema });
