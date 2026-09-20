import { neon } from "@neondatabase/serverless";

/**
 * Neon serverless SQL client (HTTP). Uses DATABASE_URL from the environment.
 * Route handlers must never import this in Client Components.
 */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return neon(url);
}
