import 'server-only';
import { exigerLocation } from '../../../../../lib/location/garde';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { jetonPourRequete } from '../../../../../lib/gestion/jetonCollaborateur';
import { fichiersDriveDuBien, joindreDepuisDrive, joindreDepuisOrdinateur, octetsPieceSortie } from '../../../../../lib/location/piecesSortieRepo';
import { PIECE_MAX_OCTETS } from '../../../../../lib/location/validationSortie';
import { dispositionTelechargement } from '../../../../../lib/stockage';

/**
 * ══ 🔴🔴 LES PIÈCES JOINTES DE « VALIDER L'ÉTAT DES LIEUX DE SORTIE » (Arno, 11/11/2026, migration 468) ═════════════════════════════════════
 *   · GET  ?drive=<occupation>  → les fichiers du dossier Drive du BIEN (LECTURE SEULE ; « Documents clients scannés » refusé) ;
 *   · GET  ?piece=<id>          → les octets d'une pièce (téléchargement depuis l'historique) ;
 *   · POST JSON { occupationId, driveIds, dejaJointes }       → « Joindre » depuis le Drive du bien (lecture des octets, AUCUNE écriture Drive) ;
 *   · POST multipart (occupationId, dejaJointes, fichier×N)   → depuis l'ordinateur (glisser-déposer, « Parcourir »).
 * Réservé, comme la validation de la sortie, à un utilisateur de la GESTION (droit relu en base).
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (x: unknown, status = 200): Response => Response.json(x, { status, headers: ENTETES });
const MOTIF_GESTION = 'La sortie est validée par un utilisateur de la Gestion.';
const id = (brut: unknown): number | null => { const s = String(brut ?? ''); return /^[1-9]\d{0,15}$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null; };
const tailles = (brut: unknown): { taille: number }[] => (Array.isArray(brut) ? brut : []).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 40).map((taille) => ({ taille }));

async function garde(request: Request): Promise<Response | null> {
  const g = await exigerLocation(request);
  if ('refus' in g) return g.refus;
  if (await exigerCompteActif(request, 'gestion') !== null) return json({ etat: 'refus', motif: MOTIF_GESTION }, 403);
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await garde(request);
  if (refus) return refus;
  const url = new URL(request.url);
  const piece = id(url.searchParams.get('piece'));
  if (piece !== null) {
    const p = await octetsPieceSortie(piece);
    if (p === null) return json({ etat: 'inconnu' }, 404);
    return new Response(new Uint8Array(p.octets), { headers: { ...ENTETES, 'Content-Type': p.typeMime, 'Content-Disposition': dispositionTelechargement(p.nom) } });
  }
  const occ = id(url.searchParams.get('drive'));
  if (occ === null) return json({ etat: 'refus', motif: 'Demande incomplète.' }, 400);
  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'refus', motif: jeton.motif }, 409);
  const r = await fichiersDriveDuBien(occ, jeton.jeton);
  return json(r.etat === 'ok' ? { etat: 'ok', data: r.data } : r, r.etat === 'refus' ? 409 : 200);
}

export async function POST(request: Request): Promise<Response> {
  const refus = await garde(request);
  if (refus) return refus;
  const auteur = await auteurDeLaRequete(request);
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const f = await request.formData().catch(() => null);
    if (f === null) return json({ etat: 'refus', motif: 'Envoi illisible.' }, 400);
    const occ = id(f.get('occupationId'));
    if (occ === null) return json({ etat: 'refus', motif: 'Demande incomplète.' }, 400);
    const fichiers: { nom: string; typeMime: string | null; octets: Buffer }[] = [];
    const refusAvant: string[] = [];
    for (const x of f.getAll('fichier')) {
      if (!(x instanceof File)) continue;
      // La taille, AVANT de charger les octets en mémoire.
      if (x.size > PIECE_MAX_OCTETS) { refusAvant.push(`« ${x.name} » : au-delà de ${PIECE_MAX_OCTETS / (1024 * 1024)} Mo par fichier.`); continue; }
      fichiers.push({ nom: x.name, typeMime: x.type || null, octets: Buffer.from(await x.arrayBuffer()) });
    }
    const r = await joindreDepuisOrdinateur(occ, fichiers, tailles(JSON.parse(String(f.get('dejaJointes') ?? '[]'))), auteur);
    return json(r.etat === 'ok' ? { etat: 'ok', data: { ...r.data, refus: [...refusAvant, ...r.data.refus] } } : r, r.etat === 'ok' ? 200 : 409);
  }
  const corps = await request.json().catch(() => null) as { occupationId?: unknown; driveIds?: unknown; dejaJointes?: unknown } | null;
  const occ = id(corps?.occupationId);
  const ids = (Array.isArray(corps?.driveIds) ? corps!.driveIds as unknown[] : []).filter((x): x is string => typeof x === 'string' && /^[\w-]{10,200}$/.test(x));
  if (occ === null || ids.length === 0) return json({ etat: 'refus', motif: 'Demande incomplète.' }, 400);
  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'refus', motif: jeton.motif }, 409);
  const r = await joindreDepuisDrive(occ, ids, tailles(corps?.dejaJointes), jeton.jeton, auteur);
  return json(r, r.etat === 'ok' ? 200 : 409);
}
