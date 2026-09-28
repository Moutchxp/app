import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { listerRecents, type SorteRecent } from '../../../../../lib/gestion/recentsPieceRepo';

/**
 * /api/admin/gestion/pieces-recentes (lot EDITEUR-PJ) — CE QUE CETTE PERSONNE A DÉJÀ JOINT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'HISTORIQUE EST CELUI DU COMPTE CONNECTÉ, ET DE LUI SEUL. Aucun paramètre ne permet de demander celui d'un
 * autre : le compte est lu dans la session, jamais dans la requête. Voir dans sa liste le NOM d'un fichier auquel on
 * n'a pas accès serait déjà une fuite, même sans pouvoir l'ouvrir.
 *
 * 🔴🔴 CETTE ROUTE NE PARLE PAS AU DRIVE. Elle lit notre table, rien d'autre : ni `files.list`, ni `files.get`, et
 * évidemment aucune écriture. Ouvrir un « récent » du Drive repasse par `/drive/fichiers`, qui redemande le jeton
 * par délégation et laisse Google appliquer SES droits.
 *
 * 🔒 AUCUNE CLÉ DE STOCKAGE UTILISABLE NE SORT D'ICI POUR AUTRUI : la clé d'une pièce locale n'est rendue qu'à son
 * propre compte, et la route de dépôt revérifie l'appartenance avant de relire le moindre octet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Les sortes demandées, filtrées. Une valeur inconnue est IGNORÉE, jamais passée à la requête. */
export function sortesDemandees(brut: string | null): SorteRecent[] {
  const permises: SorteRecent[] = ['drive_fichier', 'drive_dossier', 'locale'];
  const demandees = (brut ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (demandees.length === 0) return permises;
  return permises.filter((p) => demandees.includes(p));
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const auteur = await auteurDeLaRequete(request);
  /**
   * ⚠️ LA VOIE DE SECOURS (mot de passe partagé, `sub` nul) N'A PAS D'HISTORIQUE, et c'est juste : un historique
   * est celui d'une personne. On rend une liste vide DISPONIBLE — la fonction marche, il n'y a simplement rien.
   */
  if (auteur.id === null) {
    return Response.json({ etat: 'ok', lignes: [], disponible: true },
      { headers: { 'Cache-Control': SANS_CACHE } });
  }

  const sortes = sortesDemandees(new URL(request.url).searchParams.get('sorte'));
  try {
    const r = await listerRecents(auteur.id, sortes);
    return Response.json({ etat: 'ok', ...r }, { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « vous n'avez rien joint », ce qui serait faux.
    console.error('[gestion/pieces-recentes] lecture impossible', e);
    return Response.json({ etat: 'erreur', lignes: [], disponible: true },
      { status: 503, headers: { 'Cache-Control': SANS_CACHE } });
  }
}
