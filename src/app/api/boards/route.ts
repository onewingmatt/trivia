import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

// List all saved boards
export async function GET(req: NextRequest) {
  try {
    const boardsDir = path.join(process.cwd(), "src", "data", "boards");
    if (!fs.existsSync(boardsDir)) {
      return NextResponse.json({ boards: [] });
    }

    const files = fs.readdirSync(boardsDir)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse();

    const boards = files.map(fname => {
      const full = path.join(boardsDir, fname);
      try {
        const raw = fs.readFileSync(full, "utf-8");
        const data = JSON.parse(raw);
        const cats = (data.categories || []).map((c: any) => c.name);
        return {
          id: fname.replace(".json", ""),
          filename: fname,
          categories: cats,
          verified: data.verified || 0,
          total: data.questions?.length || 0,
          date: fname.split("_")[0] || "",
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ boards });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list boards" },
      { status: 500 }
    );
  }
}

// Load a specific board by filename
export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const boardPath = path.join(process.cwd(), "src", "data", "boards", filename);
    if (!fs.existsSync(boardPath)) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const raw = fs.readFileSync(boardPath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json({ board: data.categories });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load board" },
      { status: 500 }
    );
  }
}
