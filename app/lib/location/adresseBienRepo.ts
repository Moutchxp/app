import { query, type RequeteTx } from '../db/client';
import { AUCUNE_ADRESSE, adresseDeLaLigne, controlerAdresse, natureAdresseDisponible } from '../gestion/adresseSaisieRepo';
import { metaPropre, type AdresseFiche, type NatureAdresse } from '../gestion/adresseSaisie';

/**
 * ══ 🔴🔴 L'ADRESSE D'UN BIEN, AU SERVEUR (Arno, 17/11/2026, « Adresses uniformisées », lot 3, migration 485). IMPUR (base). ══════════════════
 * Décision d'Arno : « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse) passent sur ChampAdresseBan réutilisé
 * tel quel ; plus de Code postal / Commune tapés à la main ; adresse absente de la liste = saisie libre autorisée avec confirmation, marquée « hors
 * liste — à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. »
 * La MÊME règle que la fiche d'une personne (lot 2, `controlerAdresse`) : une adresse nouvelle ou changée est RETROUVÉE dans la Base Adresse Nationale,
 * sauf « hors liste » confirmée ; une adresse non touchée n'est ni revérifiée ni requalifiée. Un bien est en France : jamais « à l'étranger ».
 * Sans la 485 : la saisie d'avant (aucun contrôle), comme pour les personnes sans la 480.
 */

export const MOTIF_BIEN_ETRANGER = 'Un bien est en France : choisissez son adresse dans la liste, ou confirmez « Adresse absente de la liste ? ». Rien n’est enregistré.';

export type ControleAdresseBien = { ok: true; nature: NatureAdresse | null; ecrire: boolean } | { ok: false; motif: string };

/** L'adresse d'un bien telle qu'en base (sa nature, si la 485 est posée) ; un bien inconnu : aucune adresse. */
export async function adresseDuBien(lotId: number, q: RequeteTx = query): Promise<AdresseFiche> {
  const avec = await natureAdresseDisponible('gestion_annuaire_lot');
  const { rows } = await q<Record<string, unknown>>(
    `SELECT adresse, code_postal, commune, ${avec ? 'adresse_nature' : 'NULL::text AS adresse_nature'}, NULL::text AS adresse_pays FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  return rows[0] === undefined ? AUCUNE_ADRESSE : adresseDeLaLigne(rows[0]);
}

/**
 * Le contrôle, AVANT toute écriture : `avant` (null : un bien à créer), l'adresse saisie, et ce que l'écran en dit (`adresseSaisie`). Rend la nature
 * à écrire (`ecrire`) ou le refus. `appel` : le service national (épreuves).
 */
export async function controlerAdresseBien(avant: AdresseFiche | null, apres: { adresse?: string | null; codePostal?: string | null; commune?: string | null },
  metaBrute: unknown, appel: typeof fetch = fetch): Promise<ControleAdresseBien> {
  const lue = metaPropre(metaBrute);
  if (lue?.nature === 'etranger') return { ok: false, motif: MOTIF_BIEN_ETRANGER };
  // « liste » ne requalifie jamais une adresse d'avant ce lot qu'on n'a pas touchée : seule la sortie de « hors liste » compte comme un changement
  const meta = lue !== undefined && lue.nature === 'liste' && avant?.nature !== 'hors_liste' ? { ...lue, nature: null } : lue;
  const r = await controlerAdresse(await natureAdresseDisponible('gestion_annuaire_lot'), avant ?? AUCUNE_ADRESSE, apres, meta, appel);
  if (!r.ok) return r;
  return r.ecrire ? { ok: true, nature: r.nature, ecrire: true } : { ok: true, nature: null, ecrire: false };
}

/**
 * Le contrôle d'un bien EXISTANT : son adresse lue en base ; un bien importé de WIPPIMMO (adresse tenue par l'import, jamais écrite ici) ou inconnu :
 * rien à contrôler.
 */
export async function controlerAdresseBienExistant(lotId: number, apres: { adresse?: string | null; codePostal?: string | null; commune?: string | null },
  metaBrute: unknown, appel: typeof fetch = fetch): Promise<ControleAdresseBien> {
  const { rows } = await query<{ wippimmo_id: string }>('SELECT wippimmo_id FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  if (rows[0] === undefined || !rows[0].wippimmo_id.startsWith('app-')) return { ok: true, nature: null, ecrire: false };
  return controlerAdresseBien(await adresseDuBien(lotId), apres, metaBrute, appel);
}

/** La nature retenue, écrite avec l'adresse (dans la transaction de l'appelant). Rien sans la 485. */
export async function ecrireNatureAdresseBien(q: RequeteTx, lotId: number, nature: NatureAdresse | null): Promise<void> {
  if (!(await natureAdresseDisponible('gestion_annuaire_lot'))) return;
  await q('UPDATE gestion_annuaire_lot SET adresse_nature = $2 WHERE id = $1', [lotId, nature]);
}
