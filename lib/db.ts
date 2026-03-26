import { Pool } from "pg";

declare global {
  var __bovinoPool: Pool | undefined;
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no esta definida.");
  }

  if (!global.__bovinoPool) {
    global.__bovinoPool = new Pool({
      connectionString,
    });
  }

  return global.__bovinoPool;
}
