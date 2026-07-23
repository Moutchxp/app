import 'server-only';
import { exigerInternaute } from '../../../../../../lib/internaute/authGarde';
import { resoudrePdfCertificat, resoudreVisuelCertificat } from '../../../../../../lib/internaute/espace';
import { urlSignee } from '../../../../../../lib/stockage';
import { genererBufferCertificat } from '../../../../../../lib/pdf/publierCertificatPdf';
import { genererVisuelPng } from '../../../../../../lib/visuel/genererVisuelPng';

// Runtime Node (driver pg + client S3 + générateurs). Route AUTHENTIFIÉE (garde internaute).
export const runtime = 'nodejs';

/** Durée COURTE de l'URL signée de re-téléchargement (secondes) : le clic suit immédiatement. */
const DUREE_URL_S = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Base absolue du site (serveur only), pour le QR du visuel. `null` si absente/mal formée. */
function siteUrl(): string | null {
  const u = (process.env.SITE_URL ?? '').trim();
  return /^https?:\/\/.+/.test(u) ? u.replace(/\/+$/, '') : null;
}

/**
 * GET /api/internaute/espace/certificats/[id]/telecharger — RE-TÉLÉCHARGEMENT des documents d'un certificat.
 *
 * TROIS documents via le paramètre `doc` :
 *  - absent | `doc=nominatif` → NOMINATIF STOCKÉ, servi via URL signée COURTE (302) — comportement historique inchangé.
 *  - `doc=anonyme`            → PDF anonymisé RÉGÉNÉRÉ à la volée, octets directs (`application/pdf`).
 *  - `doc=visuel`             → PNG du visuel d'annonce RÉGÉNÉRÉ à la volée, octets directs (`image/png`).
 *  - toute autre valeur       → 400, aucun octet.
 *
 * SÉCURITÉ (anti-IDOR) : `exigerInternaute` d'abord ; puis `resoudrePdfCertificat` est LE GATE de propriété UNIQUE —
 * appelé EN PREMIER pour les TROIS valeurs de `doc`, il produit le `404` indistinguable et uniforme (jointure
 * `internaute_projet.internaute_id` ; 0 ligne → introuvable, aucune fuite). La propriété est établie AVANT toute
 * génération. Les documents régénérés (anonyme/visuel) sont PURS et NON NOMINATIFS ; ils ne dépendent pas du PDF stocké,
 * donc `pdf_absent` (certificat bien à lui, nominatif pas encore déposé) les sert quand même — seul le nominatif est `409`.
 * `resoudreVisuelCertificat` porte une SECONDE barrière de propriété (filet) : passé le gate, une lecture à 0 ligne
 * (incohérence qui ne doit jamais survenir) → `404`. Aucun octet, aucune donnée sensible ni identifiant loggés.
 * Statuts : 400 (doc inconnu) / 404 (pas à lui / inexistant) / 409 (nominatif pas encore disponible) / 503 (indisponible).
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const garde = await exigerInternaute(request);
  if ('refus' in garde) return garde.refus;

  const doc = new URL(request.url).searchParams.get('doc');
  if (doc !== null && doc !== 'nominatif' && doc !== 'anonyme' && doc !== 'visuel') {
    return Response.json({ erreur: 'document inconnu' }, { status: 400 }); // valeur non prévue → aucun octet, aucune génération
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ erreur: 'introuvable' }, { status: 404 });
  const certificatId = Number(id);

  // ── GATE DE PROPRIÉTÉ UNIQUE (avant toute génération, pour les 3 valeurs de `doc`) ──
  let resolution;
  try {
    resolution = await resoudrePdfCertificat(garde.internauteId, certificatId);
  } catch (e) {
    console.error('[espace] résolution certificat indisponible', (e as Error)?.name ?? 'Erreur'); // nom d'erreur seul, jamais d'identifiant
    return Response.json({ erreur: 'indisponible' }, { status: 503 });
  }
  if (resolution.statut === 'introuvable') {
    return Response.json({ erreur: 'introuvable' }, { status: 404 }); // pas à lui / inexistant → aucune fuite
  }

  // ── VOIE ANONYME : PDF régénéré à la volée (indépendant du PDF stocké → servi même si `pdf_absent`) ──
  if (doc === 'anonyme') {
    let pdf;
    try {
      pdf = await genererBufferCertificat(certificatId, { anonymise: true, typeDocument: 'anonyme' });
    } catch {
      return Response.json({ erreur: 'indisponible' }, { status: 503 });
    }
    if (!pdf) return Response.json({ erreur: 'indisponible' }, { status: 503 }); // générateur null → sans détail technique
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // NUMÉRO imprimé (pas l'id interne) : le fichier atterrit dans les Téléchargements du client, il doit lui parler.
        'Content-Disposition': `inline; filename="Certificat-anonymise-${resolution.numero}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // ── VOIE VISUEL : PNG régénéré à la volée (indépendant du PDF stocké → servi même si `pdf_absent`) ──
  if (doc === 'visuel') {
    const base = siteUrl();
    if (!base) return Response.json({ erreur: 'indisponible' }, { status: 503 }); // QR impossible sans base absolue
    let v;
    try {
      v = await resoudreVisuelCertificat(garde.internauteId, certificatId);
    } catch {
      return Response.json({ erreur: 'indisponible' }, { status: 503 });
    }
    if (!v) return Response.json({ erreur: 'introuvable' }, { status: 404 }); // gate passé mais lecture vide → incohérence
    let png;
    try {
      png = await genererVisuelPng({ verdict: v.verdict, score: v.score, reference: v.reference, urlBase: base, descriptif: v.descriptif });
    } catch {
      return Response.json({ erreur: 'indisponible' }, { status: 503 });
    }
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="Visuel-annonce-${v.reference}.png"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // ── VOIE NOMINATIF (défaut) : URL signée COURTE, 302 — comportement historique STRICTEMENT inchangé ──
  if (resolution.statut === 'pdf_absent') {
    return Response.json({ erreur: 'PDF pas encore disponible' }, { status: 409 }); // propriétaire, mais PDF non généré
  }
  try {
    const url = await urlSignee(resolution.cle, DUREE_URL_S);
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[espace] URL signée indisponible', (e as Error)?.name ?? 'Erreur'); // nom d'erreur seul, jamais d'identifiant
    return Response.json({ erreur: 'téléchargement indisponible' }, { status: 503 });
  }
}
