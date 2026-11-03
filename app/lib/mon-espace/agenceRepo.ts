// 🔴 MON ESPACE, LOT 10 (Arno, 02/11/2026) — LE MODE AGENCE, LU EN BASE, EN LECTURE SEULE. Les données de la structure sont celles du Suivi CA
// (`lireDonneesSociete`, la même lecture que sa page) ; les chiffres, ceux de ses écrans (`agence.ts`). Réservé aux ADMINISTRATEURS : la route le
// vérifie (403), et cette fonction le revérifie (jamais une structure entière pour un collaborateur). Pas de `import 'server-only'` (convention des dépôts).
import { titulaireDuCompte } from './compteRepo';
import { lireDonneesSociete } from '../transaction/donneesSociete';
import { lireVentes, transactionDisponible } from '../transaction/repo';
import { compteursAgence, societeDeLAgence, statistiquesAgence, type Agence } from './agence';
import { empreinteDe, mesCotes, type MesAffaires, type VenteMonEspace } from './mesAffaires';
import { moiDansLesVentes, poserAuteurs, schemaMonEspace } from './mesAffairesRepo';

export const MOTIF_AGENCE_ADMIN = 'Le mode agence est réservé aux administrateurs.';

/** Le compte est-il administrateur (relu en base) ? 🔴 « Les coûts » : et associé (`titulaireDuCompte`, la lecture partagée). */
const titulaireDe = titulaireDuCompte;

/** Le mode agence : toute la structure, comme le Suivi CA ; null : le compte n'est pas administrateur (la route répond 403). LECTURE SEULE. */
export async function lireAgence(compteId: number, agence: Agence, aujourdhui: string): Promise<MesAffaires | null> {
  const titulaire = await titulaireDe(compteId);
  if (!titulaire.administrateur) return null;
  const d = await lireDonneesSociete(societeDeLAgence(agence), aujourdhui);
  const moi = await moiDansLesVentes(compteId, d.ventes);
  const ventes: VenteMonEspace[] = d.ventes.map((v) => ({ ...v, mesCotes: mesCotes(v, moi), commissionsRetirees: false }));
  await poserAuteurs(ventes);
  return { disponible: d.disponible, aujourdhui, titulaire, ventes, compteurs: compteursAgence(d, aujourdhui), schema: await schemaMonEspace(),
    nomsNegociateurs: d.nomsNegociateurs, statutsNegociateurs: d.statutsNegociateurs, statistiques: statistiquesAgence(d, aujourdhui),
    retrocessions: d.retrocessions, agence: { cle: agence, societe: d.societe } };
}

/** L'empreinte du mode agence (le rafraîchissement) : toutes les affaires de la structure et leur version ; null : pas administrateur. LECTURE SEULE. */
export async function empreinteAgence(compteId: number, agence: Agence): Promise<string | null> {
  if (!(await titulaireDe(compteId)).administrateur) return null;
  if (!(await transactionDisponible())) return '';
  return empreinteDe(await lireVentes(societeDeLAgence(agence)));
}
