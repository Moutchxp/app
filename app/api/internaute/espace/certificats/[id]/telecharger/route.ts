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

/**
 * Réponse d'ERREUR de cette route, avec le MÊME en-tête de cache que les documents servis.
 *
 * Pourquoi : une réponse d'erreur de cette route peut être enregistrée SOUS LE NOM D'UN DOCUMENT par le
 * navigateur — constaté le 22/09, un 401 rendait un JSON de 29 octets là où l'internaute attendait un `.png`.
 * Elle ne doit donc pas non plus être conservée par un cache intermédiaire, qui la resservirait à la place du
 * document. Aucune garde n'est touchée : ni le statut, ni le corps ne changent.
 */
function erreur(corps: Record<string, string>, status: number): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': CACHE_PRIVE } });
}

/**
 * Même en-tête, posé sur une réponse construite AILLEURS — le 401 de la garde partagée `exigerInternaute`.
 * On la RECOPIE à l'identique (statut, corps) en ajoutant seulement `Cache-Control` : la garde elle-même reste
 * inchangée, et son 401 générique (anti-fuite) l'est aussi.
 */
function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', CACHE_PRIVE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * `Content-Disposition` du document. `inline` par défaut — l'ÉCRAN D'APERÇU affiche le document et ne doit JAMAIS
 * déclencher d'invite de téléchargement. `?telecharger=1` (bouton « Télécharger ce document ») bascule en `attachment`
 * avec le MÊME nom de fichier : c'est là, et seulement là, que le navigateur propose d'enregistrer.
 *
 * Le nom est nettoyé comme `stockage.dispositionTelechargement` (retrait de `"` `\` et des retours de ligne) :
 * anti-injection d'en-tête. Les noms réels sont déjà contraints en base (`SAVV-AAAA-NNNNNN`, `SVAV-XXXX-XXXX`) —
 * ceinture et bretelles.
 */
function disposition(nomFichier: string, telechargement: boolean): string {
  const nom = nomFichier.replace(/[\r\n"\\]/g, '_').trim();
  return `${telechargement ? 'attachment' : 'inline'}; filename="${nom}"`;
}

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
  if ('refus' in garde) return sansCache(garde.refus); // 401 de la garde — statut et corps inchangés, cache interdit

  const parametres = new URL(request.url).searchParams;
  const doc = parametres.get('doc');
  if (doc !== null && doc !== 'nominatif' && doc !== 'anonyme' && doc !== 'visuel') {
    return erreur({ erreur: 'document inconnu' }, 400); // valeur non prévue → aucun octet, aucune génération
  }
  // Mode de livraison : aperçu (défaut, `inline`) ou téléchargement (`attachment`). N'affecte QUE l'en-tête
  // `Content-Disposition` — mêmes octets, même garde, même `Cache-Control`.
  const telechargement = parametres.get('telecharger') === '1';

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return erreur({ erreur: 'introuvable' }, 404);
  const certificatId = Number(id);

  // ── GATE DE PROPRIÉTÉ UNIQUE (avant toute génération, pour les 3 valeurs de `doc`) ──
  let resolution;
  try {
    resolution = await resoudrePdfCertificat(garde.internauteId, certificatId);
  } catch (e) {
    console.error('[espace] résolution certificat indisponible', (e as Error)?.name ?? 'Erreur'); // nom d'erreur seul, jamais d'identifiant
    return erreur({ erreur: 'indisponible' }, 503);
  }
  if (resolution.statut === 'introuvable') {
    return erreur({ erreur: 'introuvable' }, 404); // pas à lui / inexistant → aucune fuite
  }

  // ── VOIE ANONYME : PDF régénéré à la volée (indépendant du PDF stocké → servi même si `pdf_absent`) ──
  if (doc === 'anonyme') {
    let pdf;
    try {
      pdf = await genererBufferCertificat(certificatId, { anonymise: true, typeDocument: 'anonyme' });
    } catch {
      return erreur({ erreur: 'indisponible' }, 503);
    }
    if (!pdf) return erreur({ erreur: 'indisponible' }, 503); // générateur null → sans détail technique
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // NUMÉRO imprimé (pas l'id interne) : le fichier atterrit dans les Téléchargements du client, il doit lui parler.
        'Content-Disposition': disposition(`Certificat-anonymise-${resolution.numero}.pdf`, telechargement),
        'Cache-Control': CACHE_PRIVE,
      },
    });
  }

  // ── VOIE VISUEL : PNG régénéré à la volée (indépendant du PDF stocké → servi même si `pdf_absent`) ──
  if (doc === 'visuel') {
    const base = siteUrl();
    if (!base) return erreur({ erreur: 'indisponible' }, 503); // QR impossible sans base absolue
    let v;
    try {
      v = await resoudreVisuelCertificat(garde.internauteId, certificatId);
    } catch {
      return erreur({ erreur: 'indisponible' }, 503);
    }
    if (!v) return erreur({ erreur: 'introuvable' }, 404); // gate passé mais lecture vide → incohérence
    let png;
    try {
      png = await genererVisuelPng({ verdict: v.verdict, score: v.score, reference: v.reference, urlBase: base, descriptif: v.descriptif });
    } catch {
      return erreur({ erreur: 'indisponible' }, 503);
    }
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': disposition(`Visuel-annonce-${v.reference}.png`, telechargement),
        'Cache-Control': CACHE_PRIVE,
      },
    });
  }

  // ── VOIE NOMINATIF (défaut) : PDF STOCKÉ, relu côté serveur et servi en octets (jamais une URL de stockage) ──
  if (resolution.statut === 'pdf_absent') {
    return erreur({ erreur: 'PDF pas encore disponible' }, 409); // propriétaire, mais PDF non généré
  }
  let pdf;
  try {
    pdf = await recuperer(resolution.cle);
  } catch (e) {
    // Objet absent du stockage, ou stockage non configuré. Le message de l'erreur CONTIENT la clé : on ne
    // journalise que son NOM, et le corps rendu reste générique (aucune clé, aucun identifiant, aucun détail).
    console.error('[espace] document indisponible au stockage', (e as Error)?.name ?? 'Erreur');
    return erreur({ erreur: 'téléchargement indisponible' }, 503);
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // NUMÉRO imprimé (pas l'id interne, pas la clé de stockage) : le fichier doit parler au client.
      'Content-Disposition': disposition(`Certificat-${resolution.numero}.pdf`, telechargement),
      'Cache-Control': CACHE_PRIVE,
    },
  });
}
