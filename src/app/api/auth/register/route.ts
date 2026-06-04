import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, generateToken, SESSION_DURATION_DAYS } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }
    if (username.length < 2 || username.length > 30) {
      return NextResponse.json({ error: "Username must be 2-30 characters" }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    const db = getDb();

    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400000).toISOString();
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, result.lastInsertRowid, expiresAt);

    const response = NextResponse.json({ ok: true, user: { id: result.lastInsertRowid, username } });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_DAYS * 86400,
    });
    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
