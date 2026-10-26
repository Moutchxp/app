import { query, withTransaction } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import type { Auteur } from '../gestion/gestes';
import type { Issue } from './locationRepo';
import { dateFr, MENTION_EN_PLACE, type RentreOccupeDuBien } from './rentreOccupe';
import { conversionDisponible, convertirDans } from './suivi/conversionMandatRepo';
export type { RentreOccupeDuBien } from './rentreOccupe';

/**
 * ══ 🔴🔴 LOCATION — LE BIEN « RENTRÉ OCCUPÉ » ET LE BAIL DU LOCATAIRE EN PLACE (Arno, 26/10/2026, migration 430). ═══════════════════
 * Lecture de la réponse d'un bien et de sa date d'entrée dans le suivi (la date du mandat), marque du bail du locataire en place,
 * liste des baux en place pour la fiche. Sans la migration 430 : tout se lit vide, et marquer refuse (`sans_schema`).
 * Rien n'est jamais supprimé ; chaque marque a sa ligne au journal (`gestion_journal`).
 */
export async function rentreOccupeDisponible(): Promise<boolean> {
  return (await colonneExisteMemo('gestion_annuaire_lot', 'entre_occupe')) && (await colonneExisteMemo('gestion_bail', 'en_place_prise_gestion'));
}

/** La réponse d'un bien et sa date d'entrée dans le suivi (la date d'effet de son statut). LECTURE SEULE. */
export async function rentreOccupeDuBien(lotId: number): Promise<RentreOccupeDuBien | null> {
  if (!(await rentreOccupeDisponible())) return null;
  const { rows } = await query<{ entre_occupe: boolean | null; depuis: string | null; titre: string }>(
    `SELECT entre_occupe, statut_bien_depuis::text AS depuis,
            coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(adresse), ''), nullif(btrim(commune), ''))), ''), 'Bien n° ' || id) AS titre
       FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  const r = rows[0];
  if (r === undefined) return null;
  return { lotId, entreOccupe: r.entre_occupe, dateMandat: r.entre_occupe === true ? r.depuis : null, titre: r.titre };
}

/**
 * Marque le bail créé comme celui du LOCATAIRE EN PLACE à la prise en gestion. Refusé si le bien n'est pas « rentré occupé ». Lu et
 * verrouillé avant d'écrire (un refus n'écrit rien) ; déjà marqué : rien à faire.
 */
export async function marquerBailEnPlace(bailId: number, auteur: Auteur): Promise<Issue<{ lotId: number; dateMandat: string | null }>> {
  if (!(await rentreOccupeDisponible())) return { etat: 'sans_schema' };
  const lu = await query<{ lot_id: string; entree: string | null; en_place: boolean; entre_occupe: boolean | null; depuis: string | null }>(
    `SELECT b.lot_id::text, b.entree::text, b.en_place_prise_gestion AS en_place, l.entre_occupe, l.statut_bien_depuis::text AS depuis
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id WHERE b.id = $1`, [bailId]);
  const r = lu.rows[0];
  if (r === undefined) return { etat: 'inconnu' };
  if (r.entre_occupe !== true) return { etat: 'refus', motif: 'Ce bien n’est pas marqué « loué au moment de la prise en gestion » : le bail ne peut pas être celui d’un locataire en place.' };
  const lotId = Number(r.lot_id);
  if (r.en_place) return { etat: 'ok', data: { lotId, dateMandat: r.depuis } };
  await withTransaction(async (q) => {
    const { rows } = await q<{ id: string }>('UPDATE gestion_bail SET en_place_prise_gestion = true WHERE id = $1 AND en_place_prise_gestion = false RETURNING id::text', [bailId]);
    if (rows.length === 0) return;
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
             VALUES ('annuaire_lot', $1, 'location_bail_en_place', 'non', 'oui', $2, $3, $4)`,
      [lotId, `bail n° ${bailId}${r.entree ? ` (entrée le ${dateFr(r.entree)})` : ''} : ${MENTION_EN_PLACE}${r.depuis ? ` — mandat de gestion du ${dateFr(r.depuis)}` : ''} ; jamais un bail signé par l’agence`,
        auteur.id, auteur.libelle]);
  });
  return { etat: 'ok', data: { lotId, dateMandat: r.depuis } };
}

/** Le bail est-il celui d'un locataire en place ? (`false` sans la 430). LECTURE SEULE. */
export async function bailEnPlace(bailId: number): Promise<boolean> {
  if (!(await rentreOccupeDisponible())) return false;
  const { rows } = await query<{ en_place: boolean }>('SELECT en_place_prise_gestion AS en_place FROM gestion_bail WHERE id = $1', [bailId]);
  return rows[0]?.en_place === true;
}

export interface BailEnPlaceLu { bailId: number; lotId: number; titre: string; entree: string | null; dateMandat: string | null }

/** Les baux « locataire en place » d'un locataire ou d'un bien, pour la mention de la fiche. LECTURE SEULE. */
export async function bauxEnPlace(o: { locataireId?: number; lotId?: number }): Promise<BailEnPlaceLu[]> {
  if (!(await rentreOccupeDisponible()) || (o.locataireId === undefined && o.lotId === undefined)) return [];
  const { rows } = await query<{ id: string; lot_id: string; titre: string; entree: string | null; depuis: string | null }>(
    `SELECT b.id::text, b.lot_id::text, b.entree::text, l.statut_bien_depuis::text AS depuis,
            coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), ''))), ''), 'Bien n° ' || l.id) AS titre
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id
      WHERE b.en_place_prise_gestion
        AND ${o.locataireId !== undefined ? 'b.id IN (SELECT oc.bail_id FROM gestion_annuaire_occupation oc WHERE oc.locataire_id = $1)' : 'b.lot_id = $1'}
      ORDER BY b.entree, b.id`, [o.locataireId ?? o.lotId]);
  return rows.map((r) => ({ bailId: Number(r.id), lotId: Number(r.lot_id), titre: r.titre, entree: r.entree, dateMandat: r.depuis }));
}

// ══ 🔴 R4 — LES BIENS EXISTANTS : rien ne bascule d'office. Le script `location:rentre-occupe` lit, et n'écrit qu'avec --appliquer. ══════════

/** L'état d'un bien pour le script : réponse, statut, sa dernière entrée en gestion (et sa correction), ses annexes, ses baux et leurs lignes de suivi. */
export interface EtatCas {
  lotId: number; titre: string; proprietaire: string; statut: string | null; entreOccupe: boolean | null;
  entree: { transitionId: number; effetLe: string; corrigeeLe: string | null } | null;
  annexes: { lotId: number; transitionId: number | null; effetLe: string | null }[];
  baux: { bailId: number; entree: string | null; sortie: string | null; enPlace: boolean; occupants: string;
    activites: { id: number; type: string; dateSignature: string; honoHt: number }[] }[];
}

const DERNIERE_ENTREE = `SELECT t.id::text, t.effet_le::text AS effet,
       (SELECT c.effet_le::text FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = t.id AND c.retire_le IS NULL) AS corrige
  FROM gestion_bien_statut_transition t
 WHERE t.lot_id = $1 AND t.apres = 'en_gestion' AND t.avant IS DISTINCT FROM 'en_gestion'
 ORDER BY t.survenu_le DESC, t.id DESC LIMIT 1`;

/** LECTURE SEULE. `null` : bien inconnu ou base sans la migration 430. */
export async function etatDuCas(lotId: number): Promise<EtatCas | null> {
  if (!(await rentreOccupeDisponible())) return null;
  const l = (await query<{ titre: string; proprietaire: string | null; statut: string | null; entre_occupe: boolean | null }>(
    `SELECT coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(lo.adresse), ''), nullif(btrim(lo.commune), ''))), ''), 'Bien n° ' || lo.id) AS titre,
            p.nom_complet AS proprietaire, lo.statut_bien AS statut, lo.entre_occupe
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire p ON p.id = lo.proprietaire_id WHERE lo.id = $1`, [lotId])).rows[0];
  if (l === undefined) return null;
  const e = (await query<{ id: string; effet: string; corrige: string | null }>(DERNIERE_ENTREE, [lotId])).rows[0];
  const annexes = [];
  for (const a of (await query<{ id: string }>(
    `SELECT ax.annexe_id::text AS id FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
      WHERE ax.parent_id = $1 AND an.annexe_detachee_le IS NULL ORDER BY ax.annexe_id`, [lotId])).rows) {
    const ea = (await query<{ id: string; effet: string; corrige: string | null }>(DERNIERE_ENTREE, [Number(a.id)])).rows[0];
    annexes.push({ lotId: Number(a.id), transitionId: ea === undefined ? null : Number(ea.id), effetLe: ea === undefined ? null : ea.corrige ?? ea.effet });
  }
  const baux = [];
  for (const b of (await query<{ id: string; entree: string | null; sortie: string | null; en_place: boolean; occupants: string | null }>(
    `SELECT b.id::text, b.entree::text, b.sortie::text, b.en_place_prise_gestion AS en_place,
            (SELECT string_agg(concat_ws(' ', lc.nom, lc.prenom), ', ') FROM gestion_annuaire_occupation o
               JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id WHERE o.bail_id = b.id) AS occupants
       FROM gestion_bail b WHERE b.lot_id = $1 ORDER BY b.entree NULLS LAST, b.id`, [lotId])).rows) {
    const act = (await query<{ id: string; type: string; d: string; hono: string }>(
      `SELECT id::text, type, date_signature::text AS d, (hono_proprietaire_ht + hono_locataire_ht)::text AS hono
         FROM gestion_location_activite WHERE bail_id = $1 AND annule_le IS NULL ORDER BY date_signature, id`, [Number(b.id)])).rows;
    baux.push({ bailId: Number(b.id), entree: b.entree, sortie: b.sortie, enPlace: b.en_place, occupants: b.occupants ?? '—',
      activites: act.map((x) => ({ id: Number(x.id), type: x.type, dateSignature: x.d, honoHt: Number(x.hono) })) });
  }
  return { lotId, titre: l.titre, proprietaire: l.proprietaire ?? '—', statut: l.statut, entreOccupe: l.entre_occupe,
    entree: e === undefined ? null : { transitionId: Number(e.id), effetLe: e.effet, corrigeeLe: e.corrige }, annexes, baux };
}

/**
 * --appliquer, POUR UN BIEN PROUVÉ (décision d'Arno) : le bien marqué « rentré occupé » ; la date du mandat posée comme date d'effet
 * CORRIGÉE de sa dernière entrée en gestion (et de celle de ses annexes rattachées entrées le même jour) — la transition d'origine n'est
 * jamais réécrite ; le bail du locataire en place marqué (s'il est donné). Les lignes de suivi commercial ne sont PAS touchées : elles
 * sont listées, à corriger par Arno dans « Suivi du mois ». Une seule transaction ; rien n'est supprimé ; tout est journalisé.
 */
export async function appliquerCas(o: { lotId: number; dateMandat: string; bailId: number | null; ligneSuivi?: number | null }, auteur: Auteur): Promise<Issue<{ lignes: string[] }>> {
  if (!(await rentreOccupeDisponible()) || !(await colonneExisteMemo('gestion_bien_statut_effet_corrige', 'effet_le'))) return { etat: 'sans_schema' };
  const avant = await etatDuCas(o.lotId);
  if (avant === null) return { etat: 'inconnu' };
  if (avant.statut !== 'en_gestion') return { etat: 'refus', motif: `Le bien ${o.lotId} n’est pas « en gestion » (statut : ${avant.statut ?? '—'}).` };
  if (avant.entree === null) return { etat: 'refus', motif: `Le bien ${o.lotId} n’a aucune entrée en gestion journalisée.` };
  if (o.bailId !== null && !avant.baux.some((b) => b.bailId === o.bailId)) return { etat: 'refus', motif: `Le bail ${o.bailId} n’est pas un bail du bien ${o.lotId}.` };
  /* 🔴 Arno (26/10/2026, décision D, 431) — la ligne de suivi du bail en place, CONVERTIE dans la même transaction. Vérifiée avant d'écrire :
     elle doit être une ligne d'un bail de ce bien ; déjà convertie : rien à refaire. */
  const ligne = o.ligneSuivi ?? null;
  let convertir = false;
  if (ligne !== null) {
    if (!(await conversionDisponible())) return { etat: 'refus', motif: 'Convertir une ligne de suivi : disponible après la mise à jour (migration 431).' };
    const l = (await query<{ bail_id: string | null; type: string; converti: boolean; annule: boolean }>(
      'SELECT bail_id::text, type, converti_le IS NOT NULL AS converti, annule_le IS NOT NULL AS annule FROM gestion_location_activite WHERE id = $1', [ligne])).rows[0];
    if (l === undefined) return { etat: 'refus', motif: `La ligne de suivi n° ${ligne} n’existe pas.` };
    if (l.bail_id === null || !avant.baux.some((b) => b.bailId === Number(l.bail_id))) return { etat: 'refus', motif: `La ligne de suivi n° ${ligne} n’est pas celle d’un bail du bien ${o.lotId}.` };
    if (l.annule) return { etat: 'refus', motif: `La ligne de suivi n° ${ligne} est annulée.` };
    if (!l.converti && l.type !== 'bail') return { etat: 'refus', motif: `La ligne de suivi n° ${ligne} n’est pas un « Bail » (« ${l.type} »).` };
    convertir = !l.converti;
  }
  const entree = avant.entree;
  const origine = entree.corrigeeLe ?? entree.effetLe;
  const motif = `bien rentré occupé : entrée dans le suivi à la date du mandat de gestion (${dateFr(o.dateMandat)}) — script location:rentre-occupe`;
  const lignes: string[] = [];
  await withTransaction(async (q) => {
    await q('SELECT 1 FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [o.lotId]);
    if (avant.entreOccupe !== true) {
      await q('UPDATE gestion_annuaire_lot SET entre_occupe = true WHERE id = $1', [o.lotId]);
      lignes.push(`bien ${o.lotId} : rentré occupé (avant : ${avant.entreOccupe === null ? 'non renseigné' : 'non'})`);
    }
    const transitions = [{ lotId: o.lotId, id: entree.transitionId },
      ...avant.annexes.filter((a) => a.transitionId !== null && a.effetLe === origine).map((a) => ({ lotId: a.lotId, id: a.transitionId as number }))];
    for (const t of transitions) {
      const deja = await q<{ effet: string }>('SELECT effet_le::text AS effet FROM gestion_bien_statut_effet_corrige WHERE transition_id = $1 AND retire_le IS NULL FOR UPDATE', [t.id]);
      if (deja.rows[0]?.effet === o.dateMandat) continue;
      if (deja.rows.length > 0) {
        await q('UPDATE gestion_bien_statut_effet_corrige SET retire_le = now(), retire_par_libelle = $2 WHERE transition_id = $1 AND retire_le IS NULL', [t.id, auteur.libelle]);
      }
      await q('INSERT INTO gestion_bien_statut_effet_corrige (transition_id, effet_le, motif, auteur_libelle) VALUES ($1, $2::date, $3, $4)', [t.id, o.dateMandat, motif, auteur.libelle]);
      lignes.push(`bien ${t.lotId} : entrée en gestion ${dateFr(origine)} → ${dateFr(o.dateMandat)} (transition n° ${t.id}, d’origine conservée)`);
    }
    if (o.bailId !== null && !avant.baux.find((b) => b.bailId === o.bailId)?.enPlace) {
      await q('UPDATE gestion_bail SET en_place_prise_gestion = true WHERE id = $1', [o.bailId]);
      lignes.push(`bail ${o.bailId} : ${MENTION_EN_PLACE}`);
    }
    if (convertir && ligne !== null) {
      const c = await convertirDans(q, ligne, o.dateMandat, auteur);
      // Un refus ici (la ligne a changé entre la lecture et l'écriture) défait TOUTE la transaction : rien n'est écrit à moitié.
      if ('refus' in c) throw new Error(`conversion refusée : ${c.refus}`);
      lignes.push(c.fait);
    }
    if (lignes.length > 0) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
               VALUES ('annuaire_lot', $1, 'location_rentre_occupe', $2, $3, $4, $5, $6)`,
        [o.lotId, `entrée ${dateFr(origine)}`, `entrée ${dateFr(o.dateMandat)}`, `${motif} : ${lignes.join(' ; ')}`, auteur.id, auteur.libelle]);
    }
  });
  return { etat: 'ok', data: { lignes } };
}

/** Un CANDIDAT « rentré occupé » (liste seule) : bien en gestion, réponse non renseignée, bail en cours à l'entrée commencé nettement avant. */
export interface CandidatRentreOccupe { lotId: number; titre: string; proprietaire: string; entreeGestion: string; bailId: number; bailEntree: string; occupants: string }

/** LECTURE SEULE. Les biens dont le bail en cours à l'entrée en gestion a commencé au moins `ecartJours` avant. */
export async function candidatsRentreOccupe(ecartJours: number): Promise<CandidatRentreOccupe[]> {
  if (!(await rentreOccupeDisponible())) return [];
  const effet = (await colonneExisteMemo('gestion_bien_statut_effet_corrige', 'effet_le'))
    ? 'coalesce((SELECT c.effet_le FROM gestion_bien_statut_effet_corrige c WHERE c.transition_id = t.id AND c.retire_le IS NULL), t.effet_le)' : 't.effet_le';
  const { rows } = await query<{ lot_id: string; titre: string; proprietaire: string | null; entree_gestion: string; bail_id: string; bail_entree: string; occupants: string | null }>(
    `SELECT lo.id::text AS lot_id,
            coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(lo.adresse), ''), nullif(btrim(lo.commune), ''))), ''), 'Bien n° ' || lo.id) AS titre,
            p.nom_complet AS proprietaire, e.effet::text AS entree_gestion, b.id::text AS bail_id, b.entree::text AS bail_entree,
            (SELECT string_agg(concat_ws(' ', lc.nom, lc.prenom), ', ') FROM gestion_annuaire_occupation o
               JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id WHERE o.bail_id = b.id) AS occupants
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = lo.proprietaire_id
       JOIN LATERAL (SELECT ${effet} AS effet FROM gestion_bien_statut_transition t
                      WHERE t.lot_id = lo.id AND t.apres = 'en_gestion' AND t.avant IS DISTINCT FROM 'en_gestion'
                      ORDER BY t.survenu_le DESC, t.id DESC LIMIT 1) e ON true
       JOIN gestion_bail b ON b.lot_id = lo.id AND b.entree IS NOT NULL AND b.entree <= e.effet - $1::int AND (b.sortie IS NULL OR b.sortie > e.effet)
      WHERE lo.statut_bien = 'en_gestion' AND lo.entre_occupe IS NULL
      ORDER BY e.effet DESC, lo.id, b.entree`, [ecartJours]);
  return rows.map((r) => ({ lotId: Number(r.lot_id), titre: r.titre, proprietaire: r.proprietaire ?? '—', entreeGestion: r.entree_gestion,
    bailId: Number(r.bail_id), bailEntree: r.bail_entree, occupants: r.occupants ?? '—' }));
}
