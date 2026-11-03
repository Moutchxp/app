// 🔴 D33 (Arno, 03/11/2026) — LES COLLABORATEURS DU GRAPHIQUE « MOIS PAR MOIS » DU CA GLOBAL, LUS EN BASE (LECTURE SEULE). Les comptes actifs (hors
// observateurs) avec leurs FONCTIONS (page Comptes, C9 : `admin_compte_fonction`) et leurs STRUCTURES (`transaction_societe_compte`, « les deux » :
// CRITERIMMO et MACJ) ; et le rapprochement des libellés de négociateur des ventes avec les comptes (la règle existante,
// `comptesRapprochesDesLibelles`). Aucun montant : les chiffres restent ceux que la page reçoit déjà. Sans la 451 : aucune fonction, aucune liste.
import { query } from '../db/client';
import { fonctionsComptesDisponible } from '../admin/schemaDroits';
import { comptesRapprochesDesLibelles } from './repo';
import { libellesDeVente } from '../mon-espace/mesAffaires';
import type { Vente } from './modele';
import type { ActiviteGraphe, CollaborateursGraphe, StructureGraphe } from './grapheGlobal';

export async function lireCollaborateursGraphe(ventes: readonly Vente[]): Promise<CollaborateursGraphe> {
  if (!(await fonctionsComptesDisponible())) return { comptes: [], libelles: {} };
  const { rows } = await query<{ id: string; libelle: string; fonctions: string[] | null; societes: string[] | null }>(
    `SELECT u.id::text, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) AS libelle,
            (SELECT array_agg(DISTINCT f.fonction) FROM admin_compte_fonction f WHERE f.compte_id = u.id AND f.retire_le IS NULL) AS fonctions,
            (SELECT array_agg(DISTINCT s.societe) FROM transaction_societe_compte s WHERE s.compte_id = u.id AND s.retire_le IS NULL) AS societes
       FROM admin_utilisateur u
      WHERE u.actif IS TRUE AND coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur'`);
  const comptes = rows.map((r) => ({ id: Number(r.id), libelle: r.libelle,
    fonctions: (r.fonctions ?? []).filter((x): x is ActiviteGraphe => x === 'vente' || x === 'location' || x === 'gestion'),
    societes: [...new Set((r.societes ?? []).flatMap((x): StructureGraphe[] => (x === 'les_deux' ? ['criterimmo', 'macj'] : x === 'criterimmo' || x === 'macj' ? [x] : [])))] }))
    .filter((c) => c.fonctions.length > 0);
  const tous = [...new Set(ventes.flatMap(libellesDeVente))];
  const rapproches = tous.length === 0 ? {} : await comptesRapprochesDesLibelles(tous);
  const libelles: Record<string, number> = {};
  for (const [l, c] of Object.entries(rapproches)) if (c !== null && comptes.some((x) => x.id === c.id)) libelles[l] = c.id;
  return { comptes, libelles };
}
