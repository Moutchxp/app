import { query } from '../db/client';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { contexteAgDuLot, entreesAg } from './agCoproprieteRepo';
import { arretesDe } from './arreteComptesRepo';
import type { ArreteComptes } from './arreteComptes';
import { lireRestitutionsFaites, restitutionVingtDisponible, SQL_SANS_RESTITUTION_EN_COURS } from './restitutionVingtRepo';
import { agosOfficielles, datesManquantes, suiviVingtPourcent, type CoproConcernee, type LigneVingtPourcent, type SuiviVingtLu } from './vingtPourcent';
export type { LigneVingtPourcent, SuiviVingtLu } from './vingtPourcent';

/**
 * ══ 🔴🔴 LE SUIVI DES 20 % RETENUS — LA LECTURE (Arno, 23/11/2026). IMPUR (base), LECTURE SEULE. ═════════════════════════════════════════════════
 * Les locataires sortis avec 20 % retenus : les sorties validées (468, `retenue_20`) dont les occupations sont toujours sorties (une sortie annulée
 * depuis n'y figure plus). Pour chacune : la copropriété du bien (sinon son immeuble, « à rattacher »), ses AGO OFFICIELLES (jamais les dates
 * projetées enregistrées à la sortie — décision d'Arno du 23/11/2026) et sa date d'arrêté des comptes (512) ; le calcul est `suiviVingtPourcent`,
 * fait ici à chaque lecture : rien n'est stocké par locataire. Sans la 468 : aucune ligne.
 * 🔴 Arno (24/11/2026) — « Restitution faite » (513) : une sortie dont la restitution est EN COURS quitte la liste (et toute alerte) ; elle figure
 * dans `faites` (section repliée « Restitutions faites ») ; une annulation l'y remet. Sans la 513 : toutes les sorties avec retenue restent listées.
 */

export const vingtPourcentDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_sortie_validee', 'retenue_20');

export async function lireSuiviVingtPourcent(): Promise<SuiviVingtLu> {
  const { rows: j } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  const aujourdhui = j[0].j;
  if (!(await vingtPourcentDisponible())) return { aujourdhui, lignes: [], manquantes: [] };
  const avec513 = await restitutionVingtDisponible();
  const { rows } = await query<{ id: string; lot_id: string; date_sortie: string; valide_le: string; logement: string | null; noms: string[] | null }>(
    `SELECT s.id::text, s.lot_id::text, s.date_sortie::text, (s.valide_le AT TIME ZONE 'Europe/Paris')::date::text AS valide_le,
            nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS logement,
            (SELECT array_agg(l.nom ORDER BY l.nom_normalise) FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
              WHERE o.id = ANY(s.occupation_ids)) AS noms
       FROM gestion_location_sortie_validee s JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id
      WHERE s.retenue_20
        AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.id = ANY(s.occupation_ids) AND o.sortie IS NULL)${avec513 ? `
        AND ${SQL_SANS_RESTITUTION_EN_COURS}` : ''}
      ORDER BY s.date_sortie DESC, s.id DESC`);
  // une lecture des AG et du contexte par bien (peu de sorties avec retenue) ; les arrêtés en une requête
  const parLot = new Map<number, { copro: CoproConcernee; officielles: string[] }>();
  for (const lotId of new Set(rows.map((r) => Number(r.lot_id)))) {
    const c = await contexteAgDuLot(lotId);
    const entrees = await entreesAg({ coproprieteId: c?.copropriete?.id ?? null, cle: c?.immeuble?.cle ?? null, lotId });
    // 🔴 Arno (23/11/2026) — un bien SANS copropriété figure aussi dans « Dates manquantes » (sous « Bien sans copropriété », compté dans la pastille)
    const copro: CoproConcernee = c !== null && c.copropriete !== null ? { cle: `copro-${c.copropriete.id}`, coproprieteId: c.copropriete.id, libelle: c.copropriete.libelle, immeuble: c.copropriete.cle, lotId }
      : c !== null && c.immeuble !== null ? { cle: `immeuble-${c.immeuble.cle}`, coproprieteId: null, libelle: c.immeuble.libelle, immeuble: c.immeuble.cle, lotId }
        : { cle: `lot-${lotId}`, coproprieteId: null, libelle: `Bien ${lotId}`, immeuble: null, lotId };
    // sans copropriété : les dates gardées AVEC UNE SORTIE ne comptent plus (Arno, 23/11/2026 : aucune date sur la sortie) ; celles de la fiche du bien, oui
    parLot.set(lotId, { copro, officielles: agosOfficielles(c?.copropriete != null ? entrees : entrees.filter((e) => e.origine !== 'sortie')) });
  }
  const ids = [...new Set([...parLot.values()].map((x) => x.copro?.coproprieteId).filter((x): x is number => typeof x === 'number'))];
  const arretes = await arretesDe(ids);
  const lignes: LigneVingtPourcent[] = rows.map((r) => {
    const p = parLot.get(Number(r.lot_id))!;
    const arrete = p.copro?.coproprieteId != null ? arretes.get(p.copro.coproprieteId) ?? null : null;
    return {
      sortieId: Number(r.id), lotId: Number(r.lot_id), locataires: r.noms ?? [], logement: r.logement, dateSortie: r.date_sortie, valideLe: r.valide_le,
      copropriete: p.copro.coproprieteId === null ? null : { id: p.copro.coproprieteId, libelle: p.copro.libelle, aRattacher: false },
      arrete, suivi: suiviVingtPourcent({ dateSortie: r.date_sortie, valideLe: r.valide_le, arrete, officielles: p.officielles, aujourdhui }),
      cleCopro: p.copro.cle, immeuble: p.copro.immeuble,
      derniereAgo: [...p.officielles].filter((d) => d <= aujourdhui).pop() ?? null,
    };
  });
  const manquantes = datesManquantes(lignes.flatMap((l) => {
    const p = parLot.get(l.lotId)!;
    return [{ copro: p.copro, arrete: l.arrete, officielles: p.officielles, locataires: l.locataires }];
  }));
  return { aujourdhui, lignes, manquantes, restitutionDisponible: avec513, faites: avec513 ? await lireRestitutionsFaites() : [] };
}
