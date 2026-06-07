import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, generateToken, SESSION_DURATION_DAYS } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
      | { id: number; username: string; password_hash: string }
      | undefined;

    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400000).toISOString();
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expiresAt);

    const response = NextResponse.json({ 
      ok: true, 
      user: { id: user.id, username: user.username },
      token 
    });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_DAYS * 86400,
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
