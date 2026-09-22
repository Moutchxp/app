import 'server-only';
import { exigerInternaute } from '../../../../../../lib/internaute/authGarde';
import { resoudrePdfCertificat, resoudreVisuelCertificat } from '../../../../../../lib/internaute/espace';
import { recuperer } from '../../../../../../lib/stockage';
import { siteUrlCertificat } from '../../../../../../lib/certificat/siteUrl';
import { genererBufferCertificat } from '../../../../../../lib/pdf/publierCertificatPdf';
import { genererVisuelPng } from '../../../../../../lib/visuel/genererVisuelPng';

// Runtime Node (driver pg + client S3 + générateurs). Route AUTHENTIFIÉE (garde internaute).
export const runtime = 'nodejs';

/**
 * En-têtes communs aux TROIS documents. `private` : la réponse est propre à UN internaute connecté, aucun cache
 * partagé (proxy, tunnel, CDN) ne doit la conserver ; `no-store` : rien sur disque non plus. Un document de
 * certificat porte l'identité du demandeur — il ne se met en cache nulle part.
 */
const CACHE_PRIVE = 'private, no-store';

type Ctx = { params: Promise<{ id: string }> };

/** Base absolue du site (serveur only), pour le QR du visuel — source UNIQUE partagée avec le PDF et l'envoi.
 *  `null` si absente, mal formée, ou (production seulement) temporaire. */
const siteUrl = siteUrlCertificat;

/**
 * GET /api/internaute/espace/certificats/[id]/telecharger — RE-TÉLÉCHARGEMENT des documents d'un certificat.
 *
 * TROIS documents via le paramètre `doc`, TOUS servis en OCTETS DIRECTS par l'application :
 *  - absent | `doc=nominatif` → NOMINATIF STOCKÉ, relu côté serveur (`recuperer`) puis servi (`application/pdf`).
 *  - `doc=anonyme`            → PDF anonymisé RÉGÉNÉRÉ à la volée, octets directs (`application/pdf`).
 *  - `doc=visuel`             → PNG du visuel d'annonce RÉGÉNÉRÉ à la volée, octets directs (`image/png`).
 *  - toute autre valeur       → 400, aucun octet.
 *
 * ⚠️ AUCUNE URL DE STOCKAGE NE SORT D'ICI. Le nominatif était servi par une redirection 302 vers une URL signée
 * MinIO ; deux raisons d'y avoir renoncé (décision du porteur, 2026-09-22) :
 *  1. l'URL signée porte l'endpoint S3 (`localhost:9000` en développement) — injoignable dès qu'on consulte
 *     l'espace ailleurs que depuis le Mac (tunnel, 4G, et demain la production si l'endpoint reste interne) ;
 *  2. une URL signée est un LAISSEZ-PASSER TRANSMISSIBLE pendant toute sa durée de vie vers un PDF qui contient
 *     l'identité du demandeur. Servir par l'application replace le contrôle d'accès à CHAQUE ouverture.
 * La génération des documents à la volée (anonyme, visuel) est INCHANGÉE : seule la livraison change.
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
        'Cache-Control': CACHE_PRIVE,
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
        'Cache-Control': CACHE_PRIVE,
      },
    });
  }

  // ── VOIE NOMINATIF (défaut) : PDF STOCKÉ, relu côté serveur et servi en octets (jamais une URL de stockage) ──
  if (resolution.statut === 'pdf_absent') {
    return Response.json({ erreur: 'PDF pas encore disponible' }, { status: 409 }); // propriétaire, mais PDF non généré
  }
  let pdf;
  try {
    pdf = await recuperer(resolution.cle);
  } catch (e) {
    // Objet absent du stockage, ou stockage non configuré. Le message de l'erreur CONTIENT la clé : on ne
    // journalise que son NOM, et le corps rendu reste générique (aucune clé, aucun identifiant, aucun détail).
    console.error('[espace] document indisponible au stockage', (e as Error)?.name ?? 'Erreur');
    return Response.json({ erreur: 'téléchargement indisponible' }, { status: 503 });
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // NUMÉRO imprimé (pas l'id interne, pas la clé de stockage) : le fichier doit parler au client.
      'Content-Disposition': `inline; filename="Certificat-${resolution.numero}.pdf"`,
      'Cache-Control': CACHE_PRIVE,
    },
  });
}
