import { NextResponse } from "next/server";
import { LEGAL_DOCUMENTS } from "@/config/legal-documents";
export async function GET(_request: Request, { params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!Object.hasOwn(LEGAL_DOCUMENTS, document)) return NextResponse.json({ error: "Metin bulunamadı." }, { status: 404 });
  return NextResponse.json(LEGAL_DOCUMENTS[document as keyof typeof LEGAL_DOCUMENTS], { headers: { "Cache-Control": "public, s-maxage=300" } });
}
