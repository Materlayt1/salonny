import { NextResponse } from "next/server";
import { listPublicCategories } from "@/lib/categories";
export async function GET() { try { return NextResponse.json({ categories: await listPublicCategories() }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }); } catch { return NextResponse.json({ error: "Kategoriler alınamadı." }, { status: 500 }); } }
