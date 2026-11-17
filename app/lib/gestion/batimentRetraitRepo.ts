import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { batimentDe } from './batimentsCopropriete';
import { adresseCleDuBien, batimentCleDuBien, chargerAnciens, digicodesDesAdresses } from './digicodesRepo';

/**
 * ══ 🔴🔴 RETIRER UN BÂTIMENT DE LA COPROPRIÉTÉ (Arno, 17/11/2026, migration 488) ════════════════════════════════════════════════════════════════
 * La décision d'Arno : « Le « − » sur un bâtiment déjà enregistré dans la copropriété mais SANS code : après confirmation (« Retirer le bâtiment X de la
 * copropriété ? Il ne sera plus proposé ; il reste dans l'historique »), le bâtiment est marqué retiré (date, auteur), jamais effacé ; il ne revient plus à la
 * réouverture ni dans le menu des bâtiments ; il peut être recréé ensuite par « Ajouter nouveau bâtiment » (il reprend alors sa ligne). Refus clair si un bien
 * est encore relié à ce bâtiment (dire lesquels). »
 * Le registre (476) ne s'efface jamais : l'état d'un bâtiment est le DERNIER de ses événements (gestion_copropriete_batiment_etat, ajout seul) — 'retire',
 * 'repris' ; aucun : actif.
 */

/**
 * 🔴🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3 : « l'unicité (copropriété, nom) est remplacée par (copropriété, adresse, nom) :
 * un « A » est accepté à une autre adresse de la même copropriété, refusé une seconde fois à la même adresse ») Le registre s'écrit-il PAR ADRESSE ? —
 * la colonne de la 489 ET l'unicité de la 490. Sans elles : comme avant (un nom unique dans toute la copropriété).
 */
let parAdresse: Promise<boolean> | null = null;
export async function registreParAdresse(q: RequeteTx = query): Promise<boolean> {
  if (parAdresse !== null && await parAdresse) return true; // seul un « oui » se retient : une migration posée serveur allumé est vue aussitôt
  parAdresse = (async () => (await colonneExisteMemo('gestion_copropriete_batiment', 'adresse_cle'))
    && (await q<{ ok: boolean }>(`SELECT count(*) = 1 AS ok FROM pg_indexes WHERE tablename = 'gestion_copropriete_batiment' AND indexname = 'gestion_copropriete_batiment_sans_adresse_unique'`)
      .then((r) => r.rows[0]?.ok === true).catch(() => false)))();
  return parAdresse;
}
/** Pour les épreuves : oublier ce qui a été lu. */
export const oublierRegistreParAdresse = (): void => { parAdresse = null; };
/** La clé d'un bâtiment à SON adresse (« 7 rue x#a ») ; sans adresse (à préciser, ou base sans la 489) : « #a », valable dans toute la copropriété. PUR. */
export const cleBatimentAdresse = (adresseCle: string | null | undefined, batimentCle: string): string => `${adresseCle ?? ''}#${batimentCle}`;
/** Un bâtiment est-il retiré à cette adresse ? (retiré à son adresse, ou retiré sans adresse : partout). PUR. */
export const estRetire = (retires: ReadonlySet<string>, adresseCle: string | null | undefined, batimentCle: string): boolean =>
  retires.has(cleBatimentAdresse(adresseCle, batimentCle)) || retires.has(cleBatimentAdresse(null, batimentCle));

/** La migration 488 est-elle en base ? */
export const etatBatimentDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_copropriete_batiment_etat', 'etat');

/** Le fragment SQL « ce bâtiment du registre est actif » (alias de gestion_copropriete_batiment). */
export const sqlBatimentActif = (alias: string): string =>
  `coalesce((SELECT e.etat FROM gestion_copropriete_batiment_etat e WHERE e.batiment_id = ${alias}.id ORDER BY e.id DESC LIMIT 1), 'repris') <> 'retire'`;

/** Les bâtiments RETIRÉS d'une copropriété, par leur clé à leur adresse (`cleBatimentAdresse` ; lire avec `estRetire`). Vide sans la 488. */
export async function batimentsRetires(coproprieteId: number | null, q: RequeteTx = query): Promise<Set<string>> {
  if (coproprieteId === null || !(await etatBatimentDisponible())) return new Set();
  const avecAdresse = await colonneExisteMemo('gestion_copropriete_batiment', 'adresse_cle');
  const { rows } = await q<{ cle: string; adresse: string | null }>(
    `SELECT b.batiment_cle AS cle, ${avecAdresse ? 'b.adresse_cle' : 'NULL::text'} AS adresse FROM gestion_copropriete_batiment b WHERE b.copropriete_id = $1 AND NOT (${sqlBatimentActif('b')})`, [coproprieteId]);
  return new Set(rows.map((r) => cleBatimentAdresse(r.adresse, r.cle)));
}

/** Recréé par « Ajouter nouveau bâtiment » : un bâtiment retiré est REPRIS (un événement de plus ; rien n'est effacé) — 🔴 (lot 3) à SON adresse. */
export async function reprendreSiRetire(q: RequeteTx, coproprieteId: number | string, batimentCle: string, auteur: Auteur, adresseCle: string | null = null): Promise<void> {
  if (!(await etatBatimentDisponible())) return;
  const parAdr = await registreParAdresse(q);
  await q(`INSERT INTO gestion_copropriete_batiment_etat (batiment_id, etat, par, par_libelle)
           SELECT b.id, 'repris', $3, $4 FROM gestion_copropriete_batiment b WHERE b.copropriete_id = $1 AND b.batiment_cle = $2 AND NOT (${sqlBatimentActif('b')})${parAdr ? ' AND b.adresse_cle IS NOT DISTINCT FROM $5' : ''}`,
  [coproprieteId, batimentCle, auteur.id, auteur.libelle, ...(parAdr ? [adresseCle] : [])]);
}

/**
 * Le retrait, dans la transaction de l'appelant. Refus clairs, rien d'écrit : sans la 488 ; un bâtiment inconnu du registre ; déjà retiré ; encore un
 * digicode (ou un changement prévu) à une adresse de la copropriété ; des biens encore reliés (dits : « adresse — lot … »).
 */
export async function retirerBatiment(q: RequeteTx, c: { coproprieteCle: string; adresseCles: readonly string[]; adresseCle?: string | null }, libelleBrut: string, auteur: Auteur,
  instant: Date = new Date()): Promise<{ ok: true } | { ok: false; motif: string }> {
  if (!(await etatBatimentDisponible())) return { ok: false, motif: 'Retirer un bâtiment demande la mise à jour de la base (migration 488) : rien n’est enregistré.' };
  const b = batimentDe(libelleBrut);
  if (b === null) return { ok: false, motif: 'Bâtiment non désigné : rien n’est enregistré.' };
  // 🔴 (lot 3) le bâtiment À SON ADRESSE (le « A » du 7 n'est pas celui du 9) ; un bâtiment sans adresse (à préciser) se retire aussi
  const parAdr = (await registreParAdresse(q)) && c.adresseCle !== undefined;
  const { rows } = await q<{ id: string; actif: boolean }>(
    `SELECT b.id::text, (${sqlBatimentActif('b')}) AS actif FROM gestion_copropriete_batiment b JOIN gestion_copropriete c ON c.id = b.copropriete_id
      WHERE c.cle_immeuble = $1 AND b.batiment_cle = $2${parAdr ? ' AND (b.adresse_cle = $3 OR b.adresse_cle IS NULL) ORDER BY (b.adresse_cle IS NULL)' : ''} FOR UPDATE OF b`,
    [c.coproprieteCle, b.cle, ...(parAdr ? [c.adresseCle] : [])]);
  const r = rows[0];
  if (r === undefined) return { ok: false, motif: `Le bâtiment ${b.libelle} n’est pas enregistré dans la copropriété : rien à retirer.` };
  if (!r.actif) return { ok: false, motif: `Le bâtiment ${b.libelle} est déjà retiré de la copropriété.` };
  // encore un digicode (ou un changement prévu) : il se retire d'abord par le « − » du code
  for (const d of await digicodesDesAdresses(parAdr && c.adresseCle ? [c.adresseCle] : c.adresseCles, instant, q)) {
    const p = d.batiments.find((x) => x.cle === b.cle);
    if (p !== undefined && (p.code !== null && (p.code.valeur.digicode !== null || (p.code.valeur.code ?? '') !== '') || p.aVenir.length > 0)) {
      return { ok: false, motif: `Le bâtiment ${b.libelle} a encore un digicode (ou un changement prévu) : retirez d’abord son code. Rien n’est retiré.` };
    }
  }
  // des biens encore reliés (le lien sûr, ou le texte « Bâtiment » d'un bien de la copropriété)
  const lies = (await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id'))
    ? new Set((await q<{ id: string }>('SELECT id::text FROM gestion_annuaire_lot WHERE copropriete_batiment_id = $1 AND absent_le IS NULL', [r.id])).rows.map((x) => Number(x.id)))
    : new Set<number>();
  const lots = (await chargerAnciens(q)).lotsBruts.filter((l) => lies.has(l.id)
    || ((parAdr && c.adresseCle ? adresseCleDuBien(l) === c.adresseCle : c.adresseCles.includes(adresseCleDuBien(l))) && batimentCleDuBien(l) === b.cle));
  if (lots.length > 0) {
    const noms = lots.map((l) => [l.adresse ?? l.immeuble ?? `bien ${l.id}`, l.numero && !l.numero.startsWith('app-') ? `lot ${l.numero}` : `bien ${l.id}`].join(' — '));
    return { ok: false, motif: `Le bâtiment ${b.libelle} est encore relié à ${lots.length === 1 ? 'un bien' : `${lots.length} biens`} : ${noms.join(' ; ')}. Changez d’abord leur bâtiment. Rien n’est retiré.` };
  }
  await q(`INSERT INTO gestion_copropriete_batiment_etat (batiment_id, etat, le, par, par_libelle) VALUES ($1, 'retire', $2, $3, $4)`,
    [r.id, instant.toISOString(), auteur.id, auteur.libelle]);
  return { ok: true };
}
