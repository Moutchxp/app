import { query, type RequeteTx } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { sqlPersonneVivante } from './personneVivanteSql';
import { carteEstComplete, verdictFamille, type Geste } from './carteComplete';

/**
 * ══ 🔴🔴 L'INVARIANT DE LA CARTE COMPLÈTE, CÔTÉ SERVEUR (Arno, 18/10/2026). IMPUR (base). ══════════════════════════════
 *
 * « Chaque famille doit toujours garder au moins UNE carte client complète. Le serveur applique la même règle (refus
 * explicite), pas seulement l'écran. » Appelé DANS la transaction des gestes de carte (`archiverPersonne`,
 * `supprimerPersonne`, `modifierPersonne`), APRÈS le `FOR UPDATE` et AVANT toute écriture.
 *
 * LES FAMILLES D'UNE PERSONNE (ses cartes sœurs, actives : ni archivées, ni supprimées) :
 *   · PROPRIÉTAIRE : pour chacun de ses biens (les deux sources de propriété, celle de l'import et les liens EN COURS de
 *     la Gestion — la même lecture que le garde « dernier propriétaire »), les propriétaires actifs de ce bien ;
 *   · LOCATAIRE : pour chacune de ses locations EN COURS, les occupants en cours du même bien.
 *   Sans bien / sans location en cours : sa famille, c'est lui seul.
 * COMPLÈTE = un nom, un téléphone et un e-mail VIVANTS (ni absents du dernier export, ni archivés à la main).
 * Le verdict lui-même est le module PUR (`verdictFamille`) : une fiche ancienne sans carte complète n'est jamais bloquée.
 */
export type SujetCarte = 'proprietaire' | 'locataire';
const TABLE: Record<SujetCarte, string> = { proprietaire: 'gestion_annuaire_proprietaire', locataire: 'gestion_annuaire_locataire' };

async function familles(q: RequeteTx, sujet: SujetCarte, id: number): Promise<number[][]> {
  const actif = `pr.archive_le IS NULL AND ${await sqlPersonneVivante('pr')}`;
  const sql = sujet === 'proprietaire'
    ? `WITH lots AS (
         SELECT id FROM gestion_annuaire_lot WHERE proprietaire_id = $1
         UNION SELECT lot_id FROM gestion_annuaire_lot_proprietaire WHERE proprietaire_id = $1 AND jusqu_a IS NULL)
       SELECT array_agg(DISTINCT m.pid) AS membres
         FROM lots l
         CROSS JOIN LATERAL (
           SELECT lo.proprietaire_id AS pid FROM gestion_annuaire_lot lo WHERE lo.id = l.id AND lo.proprietaire_id IS NOT NULL
           UNION SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = l.id AND lp.jusqu_a IS NULL) m
         JOIN gestion_annuaire_proprietaire pr ON pr.id = m.pid
        WHERE ${actif}
        GROUP BY l.id`
    : `WITH lots AS (SELECT DISTINCT lot_id FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND sortie IS NULL AND lot_id IS NOT NULL)
       SELECT array_agg(DISTINCT o.locataire_id) AS membres
         FROM lots l
         JOIN gestion_annuaire_occupation o ON o.lot_id = l.lot_id AND o.sortie IS NULL
         JOIN gestion_annuaire_locataire pr ON pr.id = o.locataire_id
        WHERE ${actif}
        GROUP BY l.lot_id`;
  const { rows } = await q<{ membres: (string | number)[] }>(sql, [id]);
  const liste = rows.map((r) => r.membres.map(Number)).map((m) => (m.includes(id) ? m : [...m, id]));
  return liste.length === 0 ? [[id]] : liste;
}

/** La complétude ACTUELLE (en base) de chaque personne demandée. */
export async function completudes(q: RequeteTx, sujet: SujetCarte, ids: readonly number[]): Promise<Map<number, boolean>> {
  if (ids.length === 0) return new Map();
  const vivante = await conditionCoordonneeVivante('c');
  const nom = sujet === 'proprietaire' ? `coalesce(nullif(btrim(p.nom), ''), p.nom_complet)` : 'p.nom';
  const coord = (sorte: string): string => `EXISTS (SELECT 1 FROM gestion_annuaire_contact c WHERE c.sujet = '${sujet}' AND c.sujet_id = p.id
      AND c.sorte = '${sorte}' AND c.absent_le IS NULL${vivante} AND btrim(coalesce(c.valeur, '')) <> '')`;
  const { rows } = await q<{ id: string; complete: boolean }>(
    `SELECT p.id::text, (btrim(coalesce(${nom}, '')) <> '' AND ${coord('telephone')} AND ${coord('email')}) AS complete
       FROM ${TABLE[sujet]} p WHERE p.id = ANY($1::bigint[])`, [[...ids]]);
  return new Map(rows.map((r) => [Number(r.id), r.complete]));
}

/**
 * Le refus (motif) si le geste ferait tomber une des familles de cette personne à zéro carte complète, sinon `null`.
 * `apres` = la complétude de la carte APRÈS le geste (`null` = elle quitte la famille : archivage, suppression).
 */
export async function refusFamilleCarte(q: RequeteTx, sujet: SujetCarte, id: number, apres: boolean | null, geste: Geste): Promise<string | null> {
  const fams = await familles(q, sujet, id);
  const comp = await completudes(q, sujet, [...new Set(fams.flat())]);
  for (const f of fams) {
    const motif = verdictFamille(f.map((m) => ({ id: m, complete: comp.get(m) === true })), id, apres, geste);
    if (motif !== null) return motif;
  }
  return null;
}

/**
 * Une CRÉATION de la Location (nouveau propriétaire, nouveaux locataires) : la famille a-t-elle au moins UNE carte client
 * complète — une carte saisie, ou une fiche existante retenue par « Utiliser cette fiche » ? (règle 1 d'Arno)
 */
export async function familleAUneCarteComplete(
  sujet: SujetCarte, cartes: readonly { nom?: string | null; coordonnees?: readonly { sorte: string; valeur: string }[] }[], existants: readonly number[],
): Promise<boolean> {
  if (cartes.some((c) => carteEstComplete({ nom: c.nom, coordonnees: c.coordonnees ?? [] }))) return true;
  if (existants.length === 0) return false;
  const comp = await completudes((t, p) => query(t, p), sujet, existants);
  return [...comp.values()].some((x) => x);
}
