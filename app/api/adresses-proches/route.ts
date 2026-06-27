import { NextResponse } from "next/server";
import { adressesProches } from "../../lib/db/adressesProches";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lat, lon } = body;
    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json({ ok: false, erreur: "lat/lon requis (number)" }, { status: 400 });
    }
    const adresses = await adressesProches(lat, lon);
    return NextResponse.json({ ok: true, adresses });
  } catch (e) {
    console.error("[adresses-proches]", (e as Error)?.message);
    return NextResponse.json({ ok: false, erreur: "erreur serveur" }, { status: 500 });
  }
}
