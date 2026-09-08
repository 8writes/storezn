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
    // Keep pooled connections warm for 5 min - the app runs as one
    // long-lived process behind Neon's connection pooler, so churning
    // connections every 20s just added a reconnect (and sometimes a
    // compute wake) onto otherwise-instant queries, which showed up as
    // multi-second search/list stalls.
    idle_timeout: 300,
    connect_timeout: 15,
    // Recycle a connection after 30 min so a long-lived one can't go
    // stale against the pooler.
    max_lifetime: 60 * 30,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pgClient = client;
  }
}

export const db = drizzle(client, { schema });
