/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — QUAND CHAQUE COLLABORATEUR A VU CHAQUE ÉVÉNEMENT ══════════════════════
 *
 * 🔴 CE FICHIER TOUCHE `pg`. Il ne doit JAMAIS être importé depuis un composant `'use client'` — règle du dépôt
 * depuis l'incident du 24/09/2026, tenue par `clientBoundary.guard.test.ts`. Les écrans passent par les routes.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « L'effet reste PAR COLLABORATEUR jusqu'à ce que CE collaborateur clique sur la
 * vignette, OU ouvre la fiche du bien concerné (par n'importe quel chemin), OU ouvre la vue de l'événement. Il ne
 * s'éteint pas chez un autre collaborateur. Il se rallume à la prochaine mise à jour Monga. »
 *
 * ═══ 🔴🔴 POURQUOI UNE DATE ET NON UN DRAPEAU ═══════════════════════════════════════════════════════════════════
 *
 * L'effet est la COMPARAISON de cette date avec celle de la dernière écriture de Monga. Un drapeau « non lu »
 * aurait demandé, à CHAQUE relève qui écrit une étape, de le rallumer chez TOUS les collaborateurs — autant
 * d'écritures que de comptes, à la minute, pour une information qui se déduit de deux dates.
 *
 * 🔴 ET C'EST CE QUI FAIT QUE L'EFFET SE RALLUME TOUT SEUL : une étape Monga n'écrit RIEN ici. Sa date repasse
 * devant celle de la dernière vue, et la vignette se rallume — chez tout le monde, sauf chez ceux qui ont
 * regardé depuis.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import 'server-only';
import { query } from '../db/client';
import { evenementVuDisponible } from './schema';

/**
 * Marque cet événement vu PAR CE COLLABORATEUR, maintenant.
 *
 * 🔴 `ON CONFLICT … DO UPDATE` : le geste se répète (on reclique la vignette, on rouvre la fiche), et c'est la
 * dernière vue qui compte. Un `INSERT` nu aurait jeté sur la deuxième ouverture ; un test d'existence préalable
 * aurait laissé une fenêtre entre la lecture et l'écriture.
 *
 * ⚠️ `false` QUAND LA MIGRATION 316 MANQUE, et aucune requête ne nomme alors la table absente. Rend `false` aussi
 * quand l'événement n'existe plus (la clé étrangère refuse) : ce n'est pas une erreur, c'est une non-écriture, et
 * l'appelant n'a rien à en faire.
 */
export async function marquerEvenementVu(evenementId: number, compteCle: string): Promise<boolean> {
  if (!(await evenementVuDisponible())) return false;
  const net = compteCle.trim();
  if (net === '') return false;
  try {
    const r = await query(
      `INSERT INTO gestion_evenement_vu (evenement_id, compte_cle, vu_le)
       VALUES ($1, $2, now())
       ON CONFLICT (evenement_id, compte_cle) DO UPDATE SET vu_le = now()`,
      [evenementId, net]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    /* ⚠️ UN ÉVÉNEMENT DISPARU N'EST PAS UNE PANNE : la clé étrangère refuse, et c'est la bonne réponse. On ne
       laisse pas remonter une exception pour un marque-page. */
    return false;
  }
}

/**
 * ══ 🔴 MARQUER VUS TOUS LES ÉVÉNEMENTS D'UN BIEN ═════════════════════════════════════════════════════════════════
 *
 * Arno : l'effet s'éteint aussi quand ce collaborateur « ouvre la fiche du bien concerné (PAR N'IMPORTE QUEL
 * CHEMIN) ». Ouvrir une fiche, c'est donc voir tous les événements qu'elle porte.
 *
 * 🔴 LA LISTE DES ÉVÉNEMENTS EST CELLE QUE LA FICHE AFFICHE, et elle vient du même endroit : l'appelant la lui
 * passe. La recalculer ici avec une seconde requête aurait pu marquer vu un événement que la fiche ne montre pas.
 *
 * ⚠️ RIEN À MARQUER ⇒ ZÉRO REQUÊTE. Une fiche sans événement — l'immense majorité — ne coûte rien.
 */
export async function marquerEvenementsVus(
  evenementIds: readonly number[], compteCle: string,
): Promise<number> {
  if (evenementIds.length === 0) return 0;
  if (!(await evenementVuDisponible())) return 0;
  const net = compteCle.trim();
  if (net === '') return 0;
  const ids = [...new Set(evenementIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return 0;
  try {
    const r = await query(
      `INSERT INTO gestion_evenement_vu (evenement_id, compte_cle, vu_le)
       SELECT x.id, $2, now() FROM unnest($1::bigint[]) AS x(id)
       ON CONFLICT (evenement_id, compte_cle) DO UPDATE SET vu_le = now()`,
      [ids, net]);
    return r.rowCount ?? 0;
  } catch {
    return 0;
  }
}
