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
    max: process.env.E2E === "1" ? 3 : 10,
    // Keep pooled connections warm for 5 min - the app runs as one
    // long-lived process behind Neon's connection pooler, so churning
    // connections every 20s just added a reconnect (and sometimes a
    // compute wake) onto otherwise-instant queries, which showed up as
    // multi-second search/list stalls.
    idle_timeout: 300,
    connect_timeout: process.env.E2E === "1" ? 30 : 15,
    // Recycle a connection after 30 min so a long-lived one can't go
    // stale against the pooler.
    max_lifetime: 60 * 30,
    // Neon pooler connections are safer without postgres-js prepared
    // statements, especially in dev/E2E where requests can cross pooled
    // sessions as the app hot-reloads.
    prepare: false,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pgClient = client;
  }
}

export const db = drizzle(client, { schema });
