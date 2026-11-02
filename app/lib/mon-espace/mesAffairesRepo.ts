// 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — « MES AFFAIRES » LUES EN BASE, EN LECTURE SEULE. Aucune table, aucune copie : les ventes du Suivi CA
// (`lireVentes(null)`), filtrées et réduites ICI, côté serveur, pour le compte qui demande (mesAffaires.ts). Pas de `import 'server-only'` (même
// convention que les dépôts de la Transaction, lus par les épreuves).
import { query } from '../db/client';
import { comptesRapprochesDesLibelles, libellesDePaye, lireRetrocessions, lireStatutsNegociateurs, lireVentes, nomsAffichesNegociateurs, transactionDisponible } from '../transaction/repo';
import { mesVentesActees, statistiquesMonEspace } from './statistiques';
import { mandatDisponible, personneTypeDisponible, prixVenteDisponible, repartitionDisponible, uniteCommissionDisponible } from '../admin/schemaDroits';
import type { Vente } from '../transaction/modele';
import { compteursMonEspace, empreinteDe, estAMoi, libellesDeVente, mesCotes, sansCommissionsDesAutres, type CompteursMonEspace, type MesAffaires, type Moi, type VenteMonEspace } from './mesAffaires';

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
    ? toutes.map((v) => ({ ...v, mesCotes: mesCotes(v, moi), commissionsRetirees: false }))
    : toutes.filter((v) => estAMoi(v, moi)).map((v) => {
      const reduite = sansCommissionsDesAutres(v, moi);
      return { ...reduite, mesCotes: mesCotes(v, moi), commissionsRetirees: reduite.lignes.length !== v.lignes.length };
    });
  // 🔴 LOT 4 — ce que la fiche dépliée lit d'ordinaire dans les références de la Transaction, calculé sur la SEULE réponse (rien de plus).
  const schema = { lotD: await repartitionDisponible(), personneType: await personneTypeDisponible(), uniteCommission: await uniteCommissionDisponible(),
    prixVente: await prixVenteDisponible(), mandat: await mandatDisponible() };
  // 🔴 LOT 7 — l'auteur de la dernière écriture de chaque affaire (l'entrée du journal qui fait sa version), pour « Léa a mis à jour … ».
  const versions = [...new Set(ventes.map((v) => v.version ?? 0).filter((x) => x > 0))];
  const { rows: auteurs } = versions.length === 0 ? { rows: [] as Record<string, unknown>[] } : await query<Record<string, unknown>>(
    `SELECT j.id, j.auteur_id, j.auteur_libelle, u.prenom FROM transaction_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id WHERE j.id = ANY($1::bigint[])`, [versions]);
  const parVersion = new Map(auteurs.map((a) => [Number(a.id), { auteurId: a.auteur_id == null ? null : Number(a.auteur_id), prenom: a.prenom == null ? null : String(a.prenom),
    libelle: String(a.auteur_libelle) }]));
  for (const v of ventes) v.derniereModification = parVersion.get(v.version ?? 0) ?? null;
  const nomsNegociateurs = await nomsAffichesNegociateurs([...new Set(ventes.flatMap(libellesDeVente))]).catch(() => ({}));
  const statutsNegociateurs = await lireStatutsNegociateurs(libellesDePaye(ventes)).catch(() => ({}));
  // 🔴 LOT 8 — mes statistiques (sur les ventes ENTIÈRES : aucun montant faussé par une commission retirée) et les rétrocessions liées à mes ventes
  // actées, ou saisies à mon nom (le bloc « par apporteur », comme celui du Suivi CA).
  const statistiques = statistiquesMonEspace(toutes, moi, aujourdhui);
  const mesIds = new Set(mesVentesActees(toutes, moi).map((v) => v.id));
  const retrocessions = (await lireRetrocessions(null).catch(() => [])).filter((r) => (r.venteId !== null && mesIds.has(r.venteId)) || (r.venteId === null && moi.libelles.has(r.negociateur)));
  return { disponible: true, aujourdhui, titulaire, ventes, compteurs, schema, nomsNegociateurs, statutsNegociateurs, statistiques, retrocessions };
}

/**
 * 🔴 LOT 7 — l'empreinte de « mes affaires » (le rafraîchissement automatique) : les affaires que ce compte voit (un administrateur : toutes) et
 * leur version — la même règle que `lireMesAffaires`, sans rien d'autre. LECTURE SEULE.
 */
export async function empreinteMesAffaires(compteId: number): Promise<string> {
  if (!(await transactionDisponible())) return '';
  const { rows } = await query<{ role: string }>('SELECT role FROM admin_utilisateur WHERE id = $1', [compteId]);
  const toutes = await lireVentes(null);
  if (rows[0]?.role === 'administrateur') return empreinteDe(toutes);
  const moi = await moiDansLesVentes(compteId, toutes);
  return empreinteDe(toutes.filter((v) => estAMoi(v, moi)));
}
