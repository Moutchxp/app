import { query } from '../db/client';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { contexteAgDuLot, entreesAg } from './agCoproprieteRepo';
import { arretesDe } from './arreteComptesRepo';
import type { ArreteComptes } from './arreteComptes';
import { lireRestitutionsFaites, restitutionVingtDisponible, SQL_SANS_RESTITUTION_EN_COURS } from './restitutionVingtRepo';
import { agosOfficielles, datesManquantes, suiviVingtPourcent, type ContactsSortie, type CoproConcernee, type LigneVingtPourcent, type PersonneContact, type SuiviVingtLu } from './vingtPourcent';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { formaterTelephone } from '../gestion/telephoneAffichage';
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
  const { rows } = await query<{ id: string; lot_id: string; lot_cle: string | null; date_sortie: string; valide_le: string; logement: string | null; noms: string[] | null }>(
    `SELECT s.id::text, s.lot_id::text, lo.wippimmo_id::text AS lot_cle, s.date_sortie::text, (s.valide_le AT TIME ZONE 'Europe/Paris')::date::text AS valide_le,
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
    // 🔴 Arno (23/11/2026) — un bien SANS copropriété figure aussi dans « Dates / copropriétés manquantes » (sous « Bien sans copropriété », compté dans la pastille)
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
      sortieId: Number(r.id), lotId: Number(r.lot_id), lotCle: r.lot_cle, locataires: r.noms ?? [], logement: r.logement, dateSortie: r.date_sortie, valideLe: r.valide_le,
      copropriete: p.copro.coproprieteId === null ? null : { id: p.copro.coproprieteId, libelle: p.copro.libelle, aRattacher: false },
      arrete, suivi: suiviVingtPourcent({ dateSortie: r.date_sortie, valideLe: r.valide_le, arrete, officielles: p.officielles, aujourdhui }),
      cleCopro: p.copro.cle, immeuble: p.copro.immeuble,
      derniereAgo: [...p.officielles].filter((d) => d <= aujourdhui).pop() ?? null,
    };
  });
  // 🔴 (Arno, 24/11/2026, 23h53) les coordonnées des locataires et des propriétaires, au strict minimum (écran interne, rien n'est envoyé)
  const contacts = await contactsDesSorties(rows.map((r) => ({ sortieId: Number(r.id), lotId: Number(r.lot_id) }))).catch(() => new Map<number, ContactsSortie>());
  for (const l of lignes) { const c = contacts.get(l.sortieId); if (c !== undefined) l.contacts = c; }
  const manquantes = datesManquantes(lignes.flatMap((l) => {
    const p = parLot.get(l.lotId)!;
    return [{ copro: p.copro, arrete: l.arrete, officielles: p.officielles, locataires: l.locataires }];
  }));
  return { aujourdhui, lignes, manquantes, restitutionDisponible: avec513, faites: avec513 ? await lireRestitutionsFaites() : [] };
}

/**
 * 🔴🔴 Arno (24/11/2026, 23h53) — « voir toutes les coordonnées des locataires et des propriétaires réduites au strict minimum : nom, prénom, e-mail,
 * téléphone ». Par sortie : ses locataires (les occupations de la sortie) et les propriétaires du bien (le titulaire et l'indivision en cours) ; pour
 * chacun le PREMIER e-mail et le PREMIER téléphone encore valables (dans l'ordre de la fiche). LECTURE SEULE ; l'écran est interne.
 */
async function contactsDesSorties(sorties: readonly { sortieId: number; lotId: number }[]): Promise<Map<number, ContactsSortie>> {
  const out = new Map<number, ContactsSortie>();
  if (sorties.length === 0) return out;
  const ids = sorties.map((x) => x.sortieId);
  const lots = [...new Set(sorties.map((x) => x.lotId))];
  const { rows: locs } = await query<{ sortie: string; id: string; nom: string | null; prenom: string | null }>(
    `SELECT s.id::text AS sortie, l.id::text, l.nom, nullif(btrim(l.prenom), '') AS prenom
       FROM gestion_location_sortie_validee s JOIN gestion_annuaire_occupation o ON o.id = ANY(s.occupation_ids) JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE s.id = ANY($1::bigint[]) ORDER BY l.nom_normalise, l.id`, [ids]);
  const avecIndivision = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'proprietaire_id');
  const { rows: pros } = await query<{ lot: string; id: string; nom: string | null; prenom: string | null; complet: string | null }>(
    `SELECT x.lot::text, p.id::text, p.nom, nullif(btrim(p.prenom), '') AS prenom, p.nom_complet AS complet
       FROM (SELECT id AS lot, proprietaire_id AS pid, 0 AS rang FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND proprietaire_id IS NOT NULL
             ${avecIndivision ? 'UNION SELECT lot_id, proprietaire_id, 1 FROM gestion_annuaire_lot_proprietaire WHERE lot_id = ANY($1::bigint[]) AND jusqu_a IS NULL' : ''}) x
       JOIN gestion_annuaire_proprietaire p ON p.id = x.pid
      ORDER BY x.lot, x.rang, p.id`, [lots]);
  const vivante = await conditionCoordonneeVivante('c');
  const { rows: co } = await query<{ sujet: string; sujet_id: string; sorte: string; valeur: string | null; brute: string | null }>(
    `SELECT c.sujet, c.sujet_id::text, c.sorte, c.valeur, c.valeur_brute AS brute FROM gestion_annuaire_contact c
      WHERE ((c.sujet = 'locataire' AND c.sujet_id = ANY($1::bigint[])) OR (c.sujet = 'proprietaire' AND c.sujet_id = ANY($2::bigint[])))
        AND c.sorte IN ('telephone', 'email') AND c.absent_le IS NULL${vivante} ORDER BY c.rang, c.id`,
    [[...new Set(locs.map((x) => Number(x.id)))], [...new Set(pros.map((x) => Number(x.id)))]]);
  const premier = (sujet: string, id: string, sorte: string) => co.find((c) => c.sujet === sujet && c.sujet_id === id && c.sorte === sorte && ((c.brute ?? c.valeur ?? '').trim() !== ''));
  const personne = (sujet: 'locataire' | 'proprietaire', id: string, nom: string): PersonneContact => {
    const e = premier(sujet, id, 'email'); const t = premier(sujet, id, 'telephone');
    const affiche = t === undefined ? '' : formaterTelephone(t.valeur, t.brute);
    // 🔴 (Arno, 25/11/2026) « Envoyer un mail » : TOUTES les adresses encore valables (le contrôle « un mail par locataire » les reconnaît toutes)
    const emails = [...new Set(co.filter((c) => c.sujet === sujet && c.sujet_id === id && c.sorte === 'email').map((c) => (c.brute ?? c.valeur ?? '').trim()).filter((x) => x !== ''))];
    return { nom, emails, email: e === undefined ? null : (e.brute ?? e.valeur ?? '').trim(),
      telephone: t === undefined || affiche === '' ? null : { affiche, lien: `tel:${(t.valeur ?? t.brute ?? '').replace(/[^\d+]/g, '')}` } };
  };
  const nomDe = (prenom: string | null, nom: string | null, complet?: string | null): string =>
    (prenom !== null && (nom ?? '').trim() !== '' ? `${prenom} ${(nom ?? '').trim()}` : (complet ?? nom ?? '').trim()) || '—';
  for (const s of sorties) {
    out.set(s.sortieId, {
      locataires: locs.filter((l) => Number(l.sortie) === s.sortieId).map((l) => personne('locataire', l.id, nomDe(l.prenom, l.nom))),
      proprietaires: pros.filter((p) => Number(p.lot) === s.lotId).map((p) => personne('proprietaire', p.id, nomDe(p.prenom, p.nom, p.complet))),
    });
  }
  return out;
}
