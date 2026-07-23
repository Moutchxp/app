import { verifierCertificat, verifierParReference } from "../../lib/db/certificatVerification";
import { genererBufferCertificat } from "../../lib/pdf/publierCertificatPdf";
import { genererVisuelPng } from "../../lib/visuel/genererVisuelPng";
import { query } from "../../lib/db/client";

/**
 * GET /verifier/document — SERT le document correspondant au QR scanné (aperçu en ligne).
 *
 * CONTRÔLE D'ACCÈS : REJOUE LITTÉRALEMENT le gate de la page (`app/verifier/page.tsx`). La route ne peut JAMAIS servir plus
 * que ce que la page révèle — elle réutilise les vérificateurs existants, sans aucun contrôle parallèle.
 *  - `doc=visuel` → `verifierParReference(ref)` ; ne sert le PNG QUE si `visuel_verifie` (référence seule, sans adresse).
 *  - sinon (certificat) → `verifierCertificat(n, j)` ; ne sert le PDF QUE si `verifie` (jeton correct).
 *  - TOUT autre statut (sans_compte, existe, inexistant, reference_invalide, numero_invalide) → 404 SANS aucun octet.
 *
 * ⚠️ On ne sert JAMAIS le PDF NOMINATIF (il porte l'identité du demandeur) : côté certificat, on régénère TOUJOURS le rendu
 * ANONYMISÉ (`anonymise:true`, bloc Demandeur masqué). Générateurs PURS → aucune écriture, aucun dépôt, aucun UPDATE (les
 * documents ne sont pas persistés, ils sont régénérés à la demande). Le jeton n'est JAMAIS journalisé (aucun log ici).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base absolue du site (serveur only), pour le QR du visuel. `null` si absente/mal formée. */
function siteUrl(): string | null {
  const u = (process.env.SITE_URL ?? "").trim();
  return /^https?:\/\/.+/.test(u) ? u.replace(/\/+$/, "") : null;
}

/** Refus SANS aucun octet ni détail (statut seul). */
const refus = (status: number) => new Response(null, { status });

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const doc = params.get("doc");

  try {
    // ── VOIE VISUEL (référence seule) ──
    if (doc === "visuel") {
      const r = await verifierParReference(params.get("ref"));
      if (r.statut !== "visuel_verifie") return refus(404); // même gate que la page : rien d'autre ne débloque le visuel
      const base = siteUrl();
      if (!base) return refus(503); // QR impossible sans base absolue → indisponible, sans détail
      const v = r.visuel;
      const png = await genererVisuelPng({ verdict: v.verdict, score: v.score, reference: v.reference, urlBase: base, descriptif: v.descriptif });
      return new Response(new Uint8Array(png), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="Visuel-annonce-${v.reference}.png"`,
          "Cache-Control": "no-store", // contenu sous contrôle d'accès : jamais mis en cache (navigateur ou intermédiaire)
        },
      });
    }

    // ── VOIE CERTIFICAT (numéro + jeton) → rendu ANONYMISÉ uniquement ──
    const r = await verifierCertificat(params.get("n"), params.get("j"));
    if (r.statut !== "verifie") return refus(404); // jeton absent/faux, one-shot, introuvable, invalide → 404, aucun octet
    const numero = r.certificat.numero;
    // L'id du certificat n'est pas renvoyé par le vérificateur : on le résout APRÈS le gate (lecture seule, aucun effet de bord).
    const res = await query<{ id: number }>(`SELECT id FROM certificat WHERE numero = $1`, [numero]);
    const id = res.rows[0]?.id;
    if (id === undefined) return refus(404);
    // TOUJOURS anonymisé — jamais le nominatif.
    const pdf = await genererBufferCertificat(id, { anonymise: true, typeDocument: "anonyme" });
    if (!pdf) return refus(503); // SITE_URL absente / carte indisponible → indisponible, sans détail technique
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Certificat-anonymise-${numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Aucune exception non capturée ne fuit ; aucun détail, jamais le jeton.
    return refus(503);
  }
}
