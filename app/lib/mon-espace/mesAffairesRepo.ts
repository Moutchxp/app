// 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — « MES AFFAIRES » LUES EN BASE, EN LECTURE SEULE. Aucune table, aucune copie : les ventes du Suivi CA
// (`lireVentes(null)`), filtrées et réduites ICI, côté serveur, pour le compte qui demande (mesAffaires.ts). Pas de `import 'server-only'` (même
// convention que les dépôts de la Transaction, lus par les épreuves).
import { query } from '../db/client';
import { comptesRapprochesDesLibelles, lireVentes, transactionDisponible } from '../transaction/repo';
import type { Vente } from '../transaction/modele';
import { compteursMonEspace, estAMoi, libellesDeVente, mesCotes, sansCommissionsDesAutres, type CompteursMonEspace, type MesAffaires, type Moi, type VenteMonEspace } from './mesAffaires';

const VIDE = (aujourdhui: string): CompteursMonEspace => ({ compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } },
  actees: { annee: Number(aujourdhui.slice(0, 4)), nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } } });

/**
 * Qui est ce compte pour les ventes : son id, et les libellés de négociateur qui le désignent — les parties et le dossier qui portent son
 * compte, et tout libellé des fichiers que la règle existante rattache à lui (alias posé à la main, nom complet ou adresse d'un seul compte,
 * prénom d'un seul compte). PUR sauf la lecture des comptes. LECTURE SEULE.
 */
export async function moiDansLesVentes(compteId: number, ventes: readonly Vente[]): Promise<Moi> {
  const libelles = new Set<string>();
  for (const v of ventes) {
    for (const p of v.repartition?.parties ?? []) if (p.compteId === compteId && p.negociateur !== null) libelles.add(p.negociateur);
    if (v.dossier?.entree?.id === compteId && v.dossier.entree.nom) libelles.add(v.dossier.entree.nom);
    if (v.dossier?.sortie?.id === compteId && v.dossier.sortie.nom) libelles.add(v.dossier.sortie.nom);
  }
  const tous = [...new Set(ventes.flatMap(libellesDeVente))];
  const rapproches = tous.length === 0 ? {} : await comptesRapprochesDesLibelles(tous);
  for (const [l, c] of Object.entries(rapproches)) if (c !== null && c.id === compteId) libelles.add(l);
  return { compteId, libelles };
}

/** « Mes affaires » du compte `compteId` (le droit est déjà vérifié par la route). LECTURE SEULE. */
export async function lireMesAffaires(compteId: number, aujourdhui: string): Promise<MesAffaires> {
  const { rows } = await query<{ role: string; prenom: string | null }>('SELECT role, prenom FROM admin_utilisateur WHERE id = $1', [compteId]);
  const administrateur = rows[0]?.role === 'administrateur';
  const titulaire = { id: compteId, prenom: rows[0]?.prenom ?? null, administrateur };
  if (!(await transactionDisponible())) return { disponible: false, aujourdhui, titulaire, ventes: [], compteurs: VIDE(aujourdhui) };
  const toutes = await lireVentes(null);
  const moi = await moiDansLesVentes(compteId, toutes);
  // Les compteurs se calculent sur les ventes ENTIÈRES (aucune donnée retirée ne fausse un montant) ; la réponse, elle, est réduite.
  const compteurs = compteursMonEspace(toutes, moi, aujourdhui);
  const ventes: VenteMonEspace[] = administrateur
    ? toutes.map((v) => ({ ...v, mesCotes: mesCotes(v, moi) }))
    : toutes.filter((v) => estAMoi(v, moi)).map((v) => ({ ...sansCommissionsDesAutres(v, moi), mesCotes: mesCotes(v, moi) }));
  return { disponible: true, aujourdhui, titulaire, ventes, compteurs };
}
