import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { exporterEnPdf, lireContenuFichier, lireMetadonnees } from '../../../../../../lib/gestion/drive';
import { verdictJoindre } from '../../../../../../lib/gestion/driveVerdict';
import {
  APERCU_TAILLE_MAX, messageSansApercu, motifTropGros, passeParExport, sorteApercu, typeServi,
} from '../../../../../../lib/gestion/apercuDrive';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';

/**
 * /api/admin/gestion/drive/apercu — LOT DRIVE-VISUALISER-ET-DOSSIERS : VOIR UN FICHIER DU DRIVE SANS LE JOINDRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 UN APERÇU EST UNE LECTURE DE CONTENU — DONC LA MÊME RÈGLE QUE « JOINDRE », AU MOT PRÈS. Voir un avis
 * d'imposition à l'écran, c'est le lire ; l'interdit de « Documents clients scannés » porte sur la LECTURE du
 * contenu, pas sur son acheminement. Cette route appelle donc `verdictJoindre` — la seule copie de la règle — et
 * refuse en remontant toute la chaîne des parents, à n'importe quelle profondeur.
 *
 * 🔴🔴 LE TYPE SERVI EST LE NÔTRE, JAMAIS CELUI DU FICHIER. Le contenu sort sur NOTRE origine, dans un cadre de
 * NOTRE page : un `.html` rangé dans le Drive s'exécuterait avec nos cookies de session. On sert donc UNIQUEMENT les
 * types d'une liste blanche (`apercuDrive.typeServi`) — PDF, images matricielles, texte brut — et l'en-tête
 * `Content-Type` porte la valeur de la LISTE, pas celle que le fichier prétend avoir. SVG en est absent : c'est le
 * seul format « image » qui peut contenir du code.
 *
 * 🔒 LECTURE SEULE, ET AUCUNE COPIE NULLE PART. `files.get`, `alt=media`, et `files.export` pour les documents
 * Google — un GET qui calcule un PDF à la volée, sans rien créer dans le Drive. Pas un `files.create`, pas un
 * `files.update`, pas un `permissions.create`. Rien n'est écrit sur notre disque non plus : les octets traversent.
 *
 * ⚠️ `no-store` ET `X-Content-Type-Options: nosniff` : le document d'un client ne doit pas rester dans le cache du
 * navigateur, et le navigateur ne doit pas deviner un type que nous n'avons pas écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  const url = new URL(request.url);
  const fichier = (url.searchParams.get('fichier') ?? '').trim();
  if (fichier === '') return json({ etat: 'refus', message: 'Aucun fichier demandé.' }, 400);

  try {
    // ── ① 🔴🔴 LA RÈGLE, AVANT TOUTE LECTURE DE CONTENU. Elle n'est pas discutable et elle n'est pas dupliquée. ──
    const v = await verdictJoindre(jeton.jeton, fichier);
    if (!v.joindre) {
      return json({ etat: 'refus', message: v.motif ?? 'Le contenu de ce fichier ne peut pas être affiché.' }, 403);
    }

    const meta = await lireMetadonnees(jeton.jeton, fichier, { fetch });
    if (!meta.ok) return json({ etat: 'indisponible', message: meta.motif }, 200);

    // ── ② LA LISTE BLANCHE. Hors d'elle, on le DIT — un cadre vide se lirait comme une panne. ────────────────────
    const type = typeServi(meta.valeur.typeMime);
    if (type === null || sorteApercu(meta.valeur.typeMime) === 'aucun') {
      return json({ etat: 'sans_apercu', message: messageSansApercu(meta.valeur.typeMime) }, 415);
    }

    // ── ③ LA TAILLE. Un aperçu se regarde ; tirer 20 Mo pour jeter un œil ferait attendre pour rien. ─────────────
    const taille = meta.valeur.tailleOctets ?? 0;
    if (taille > APERCU_TAILLE_MAX) {
      return json({ etat: 'sans_apercu', message: motifTropGros(taille) }, 413);
    }

    // ── ④ LES OCTETS. Un document Google n'en a pas : on l'EXPORTE en PDF, ce qui reste un GET. ──────────────────
    const octets = passeParExport(meta.valeur.typeMime)
      ? await exporterEnPdf(jeton.jeton, fichier, { fetch }, APERCU_TAILLE_MAX)
      : await lireContenuFichier(jeton.jeton, fichier, { fetch }, APERCU_TAILLE_MAX);
    if (!octets.ok) return json({ etat: 'sans_apercu', message: octets.motif }, 415);

    /**
     * ⚠️ `Content-Disposition: inline` SANS nom de fichier. Le nom d'un document de client (« Bail DUPONT.pdf »)
     * n'a pas à voyager dans un en-tête que le navigateur peut consigner : l'écran l'affiche déjà, il le connaît.
     */
    return new Response(new Uint8Array(octets.valeur), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(octets.valeur.byteLength),
        'Content-Disposition': 'inline',
        'Cache-Control': SANS_CACHE,
        'X-Content-Type-Options': 'nosniff',
        // Le cadre de l'aperçu est dans NOTRE page, et nulle part ailleurs.
        'Content-Security-Policy': "default-src 'none'; img-src data: blob: 'self'; frame-ancestors 'self'",
      },
    });
  } catch (e) {
    console.error('[api/admin/gestion/drive/apercu] lecture impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}
