import { cookies, headers } from "next/headers";
import { getDb, SESSION_DURATION_DAYS } from "./db";

export interface AuthUser {
  id: number;
  username: string;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  
  const cookieToken = cookieStore.get("session")?.value;
  const authHeader = headerStore.get("authorization");
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  
  const token = cookieToken || headerToken;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as { id: number; username: string } | undefined;

  if (!row) return null;
  return { id: row.id, username: row.username };
}
