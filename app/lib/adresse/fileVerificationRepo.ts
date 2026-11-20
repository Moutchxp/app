import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { immeubleDuBien } from '../gestion/copropriete';
import { adresseImmeuble, cleImmeuble } from '../gestion/syndics';
import { adresseBanParId, adressesDeLaPlage, enregistrerRapprochement, parcelleDuPoint, rapprocherAdresse, rapprocherBien, type RapprochementComplet } from './banRepo';
import { analyserAdresse, libelleOfficiel, type CandidatBan } from './rapprochementBan';
import { communeAffichee, voieAffichee } from './libelleAffiche';
import { annulerUnification, RefusUnification } from './unificationApplicationRepo';

/**
 * ══ 🔴🔴 LA FILE « ADRESSES À VÉRIFIER » (Arno, 20/11/2026, « Adresse officielle BAN », lot 6). IMPUR (base). ═════════════════════════════════════════
 *
 * Les biens dont le rapprochement en cours (`gestion_lot_adresse_ban`) est « à vérifier » ou « introuvable », rangés par ÉCRITURE WIPPIMMO (une écriture,
 * sa commune, ses biens), avec le motif et les propositions officielles (le module unique, relu à l'instant). Quatre gestes, sur un clic confirmé :
 *   a) « Valider la proposition »   b) « Choisir une autre adresse » (l'auto-complétion unique ; l'adresse choisie est rapprochée par le module)
 *   c) « Plusieurs adresses » (une plage : chaque adresse officielle choisie devient une adresse du même immeuble)
 *   d) « Hors périmètre / sans adresse » (raison obligatoire)
 * Chaque geste : les biens de l'écriture reçoivent un rapprochement « validé » (ou « refusé » pour d), le précédent FERMÉ ; la copropriété de l'adresse
 * officielle reçoit l'écriture d'origine (ou la copropriété est créée pour une plage) ; une ligne d'Historique par bien ; TOUT est tracé comme une passe
 * (`gestion_adresse_operation`, source « file de vérification ») et RÉVERSIBLE (« Annuler ce choix » : `annulerUnification`). Les adresses WIPPIMMO ne
 * sont jamais touchées ; une réunion de deux copropriétés enregistrées n'est pas faite (refus clair).
 */

export const SOURCE_FILE = 'file_verification';
export interface PropositionFile { banId: string; libelle: string; court: string; score: number | null }
export interface EcritureAVerifier {
  /** la clé de l'écriture (texte, code postal, commune) : ce que les gestes désignent */
  cle: string; ecriture: string; codePostal: string | null; commune: string | null;
  lots: number[]; statut: 'a_verifier' | 'introuvable'; motif: string; propositions: PropositionFile[];
  /** une plage de numéros : ses adresses officielles possibles (le geste « Plusieurs adresses ») */
  plage: { texte: string; adresses: PropositionFile[] } | null;
  /** une fiche d'essai (« TEST », « _TEST », « FICTIF », « ESSAI », code postal 00000) : rangée à part, hors du compteur (Arno, 20/11/2026) */
  essai: boolean;
}
export interface ChoixRecent { operationId: number; le: string; par: string; geste: string; ecriture: string; adresses: string[]; raison: string | null }

interface LotFile { id: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null; statut: string; motif: string | null }
const cleDe = (l: Pick<LotFile, 'immeuble' | 'adresse' | 'code_postal' | 'commune'>): string => JSON.stringify([immeubleDuBien(l), (l.code_postal ?? '').trim(), (l.commune ?? '').trim()]);
const libelleDe = (c: CandidatBan, cp: string | null): string => adresseImmeuble(voieAffichee(libelleOfficiel(c)), cp, communeAffichee(c.commune));
const propositionDe = (c: CandidatBan, cp: string | null, score: number | null): PropositionFile => ({ banId: c.id, libelle: libelleDe(c, cp), court: voieAffichee(libelleOfficiel(c)), score });

/** 🔴 UNE FICHE D'ESSAI (Arno, 20/11/2026) : « TEST », « _TEST », « FICTIF » ou « ESSAI » en mot entier dans l'écriture ou la commune, ou le code postal 00000. PUR. */
const MOT_ESSAI = /(^|[^\p{L}\d])_?(test|fictif|essai)(?=$|[^\p{L}])/iu;
export function estFicheEssai(e: { ecriture: string | null; codePostal: string | null; commune: string | null }): boolean {
  return (e.codePostal ?? '').trim() === '00000' || MOT_ESSAI.test(e.ecriture ?? '') || MOT_ESSAI.test(e.commune ?? '');
}
const essaiDuLot = (l: LotFile) => estFicheEssai({ ecriture: immeubleDuBien(l), codePostal: l.code_postal, commune: l.commune });

async function lotsDeLaFile(q: RequeteTx | typeof query = query): Promise<LotFile[]> {
  const { rows } = await q<LotFile>(
    `SELECT lo.id::text, lo.immeuble, lo.adresse, lo.code_postal, lo.commune, r.statut, r.motif
       FROM gestion_lot_adresse_ban r JOIN gestion_annuaire_lot lo ON lo.id = r.lot_id
      WHERE r.fin IS NULL AND r.statut IN ('a_verifier', 'introuvable') AND lo.absent_le IS NULL ORDER BY lo.id`);
  return rows;
}

/** Le nombre d'ÉCRITURES à vérifier (le compteur de l'onglet), SANS les fiches d'essai. LECTURE SEULE. */
export async function compteAVerifier(): Promise<number> {
  return new Set((await lotsDeLaFile()).filter((l) => !essaiDuLot(l)).map(cleDe)).size;
}

/** LA FILE, triée par nombre de biens concernés. LECTURE SEULE. */
export async function fileAVerifier(): Promise<EcritureAVerifier[]> {
  const parCle = new Map<string, LotFile[]>();
  for (const l of await lotsDeLaFile()) parCle.set(cleDe(l), [...(parCle.get(cleDe(l)) ?? []), l]);
  const out: EcritureAVerifier[] = [];
  for (const [cle, ls] of parCle) {
    const l = ls[0];
    const r = await rapprocherBien({ immeuble: l.immeuble, adresse: l.adresse, codePostal: l.code_postal, commune: l.commune });
    let plage: EcritureAVerifier['plage'] = null;
    const a = [l.immeuble, l.adresse].map((t) => analyserAdresse(t, l.commune)).find((x) => x.plage) ?? null;
    // la voie de la plage : l'adresse rapprochée, ou à défaut la meilleure proposition (une plage n'est jamais « certaine »)
    const voie = r.ban ?? r.propositions[0] ?? null;
    if (a !== null) {
      const m = /^(\d+)\D+(\d+)/.exec(a.plageTexte ?? '');
      if (m !== null && voie === null) plage = { texte: a.plageTexte ?? '', adresses: [] };
      else if (m !== null && voie !== null) {
        const [de, fin] = [Number(m[1]), Number(m[2])];
        // deux bornes de même parité (« 12-28 ») : un seul côté de la rue — les numéros de l'autre côté ne sont pas proposés
        const memeCote = de % 2 === fin % 2;
        plage = { texte: a.plageTexte ?? '', adresses: (await adressesDeLaPlage(voie.insee, voie.nomVoie, de, fin)).filter((c) => !memeCote || c.numero % 2 === de % 2)
          .map((c) => propositionDe(c, r.codePostal, null)) };
      }
    }
    out.push({ cle, ecriture: immeubleDuBien(l), codePostal: l.code_postal, commune: l.commune, lots: ls.map((x) => Number(x.id)), statut: l.statut === 'introuvable' ? 'introuvable' : 'a_verifier',
      motif: r.motif, propositions: r.propositions.map((p) => propositionDe(p, r.codePostal, p.score)), plage, essai: essaiDuLot(l) });
  }
  return out.sort((x, y) => y.lots.length - x.lots.length || x.ecriture.localeCompare(y.ecriture, 'fr', { numeric: true }));
}

/** Les choix faits depuis la file, encore annulables (les plus récents d'abord). LECTURE SEULE. */
export async function choixRecents(): Promise<ChoixRecent[]> {
  const { rows } = await query<{ id: string; le: string; par: string; plan: Record<string, unknown> }>(
    // ⚠️ le tri porte sur la colonne NUMÉRIQUE (o.id), pas sur l'alias texte : « 9 » passerait sinon avant « 11 »
    `SELECT o.id::text AS id, to_char(o.cree_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY "à" HH24"h"MI') AS le, o.cree_par_libelle AS par, o.plan
       FROM gestion_adresse_operation o WHERE o.annulee_le IS NULL AND o.plan->>'source' = $1 ORDER BY o.id DESC LIMIT 30`, [SOURCE_FILE]);
  return rows.map((r) => ({ operationId: Number(r.id), le: r.le, par: r.par, geste: String(r.plan.geste ?? ''), ecriture: String(r.plan.ecriture ?? ''),
    adresses: Array.isArray(r.plan.adresses) ? r.plan.adresses.map(String) : [], raison: typeof r.plan.raison === 'string' ? r.plan.raison : null }));
}

export type Geste = 'valider' | 'autre' | 'plusieurs' | 'hors';
export const MOT_GESTE: Readonly<Record<Geste, string>> = { valider: 'proposition validée', autre: 'autre adresse choisie', plusieurs: 'plusieurs adresses', hors: 'hors périmètre / sans adresse' };

/** Un rapprochement « décidé par un humain », à partir de l'adresse officielle choisie (ou d'aucune, pour « hors périmètre »). */
async function rapprochementChoisi(c: CandidatBan | null, cp: string | null, texte: string, motif: string, q: RequeteTx): Promise<RapprochementComplet> {
  const analyse = analyserAdresse(texte);
  const ban = c === null ? null : { ...c, score: 1, libelle: libelleOfficiel(c), typeContradictoire: false };
  return { statut: c === null ? 'introuvable' : 'certain', motif, ban, score: null, propositions: ban === null ? [] : [ban], analyse,
    insee: c?.insee ?? null, codePostal: cp, parcelle: c?.x != null && c.y != null ? await parcelleDuPoint(c.x, c.y, q) : null, texteSource: texte };
}

async function tracer(q: RequeteTx, op: number, table: string, ligne: string | number, geste: 'insertion' | 'modification', colonne: string | null = null, avant: string | null = null, apres: string | null = null) {
  await q(`INSERT INTO gestion_adresse_operation_trace (operation_id, table_nom, ligne_id, colonne, avant, apres, geste) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [op, table, String(ligne), colonne, avant, apres, geste]);
}

/** UN GESTE de la file, en une transaction. Refus clairs AVANT toute écriture. Rend le message de confirmation et le numéro du choix (pour l'annuler). */
export async function gesteFile(brut: unknown, auteur: Auteur): Promise<{ ok: true; message: string; operationId: number } | { ok: false; motif: string }> {
  const b = (brut ?? {}) as Record<string, unknown>;
  const geste = b.geste as Geste;
  if (!['valider', 'autre', 'plusieurs', 'hors'].includes(geste)) return { ok: false, motif: 'Geste inconnu.' };
  const cle = typeof b.cle === 'string' ? b.cle : '';
  const lots = (await lotsDeLaFile()).filter((l) => cleDe(l) === cle);
  if (lots.length === 0) return { ok: false, motif: 'Cette écriture n’est plus à vérifier (déjà traitée ?) : rechargez la file. Rien n’est enregistré.' };
  const l0 = lots[0];
  const ecriture = immeubleDuBien(l0);
  // ── l'adresse (ou les adresses) officielle(s) choisie(s) — tous les refus avant d'écrire
  let choisies: CandidatBan[] = [];
  const raison = typeof b.raison === 'string' ? b.raison.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (geste === 'hors') {
    if (raison === '') return { ok: false, motif: 'Indiquez la raison (commune non couverte, fiche d’essai…) : elle est obligatoire. Rien n’est enregistré.' };
  } else if (geste === 'autre') {
    const a = (b.adresse ?? {}) as Record<string, unknown>;
    const voie = typeof a.voie === 'string' ? a.voie.trim() : '';
    if (voie === '') return { ok: false, motif: 'Choisissez l’adresse dans la liste proposée. Rien n’est enregistré.' };
    const r = await rapprocherAdresse({ texte: voie, codePostal: typeof a.codePostal === 'string' ? a.codePostal : null, commune: typeof a.commune === 'string' ? a.commune : null });
    if (r.statut !== 'certain' || r.ban === null) return { ok: false, motif: `L’adresse choisie n’est pas retrouvée avec certitude dans la Base Adresse locale (${r.motif}). Rien n’est enregistré.` };
    choisies = [r.ban];
  } else {
    const ids = (geste === 'valider' ? [b.banId] : Array.isArray(b.banIds) ? b.banIds : []).filter((x): x is string => typeof x === 'string').slice(0, 30);
    // une plage dont la Base Adresse ne connaît qu'un numéro (« 126 - 128 rue de Villiers » : le 126 n'existe pas) : « Plusieurs adresses » avec une seule cochée reste permis
    if (ids.length === 0) return { ok: false, motif: geste === 'plusieurs' ? 'Cochez au moins une adresse officielle. Rien n’est enregistré.' : 'Proposition non désignée.' };
    for (const id of ids) { const c = await adresseBanParId(id); if (c === null) return { ok: false, motif: `L’adresse officielle ${id} est introuvable. Rien n’est enregistré.` }; choisies.push(c); }
  }
  const libelles = choisies.map((c) => libelleDe(c, l0.code_postal));
  const op = await withTransaction(async (q) => {
    const { rows: [o] } = await q<{ id: string }>(
      `INSERT INTO gestion_adresse_operation (nature, base, plan, cree_par, cree_par_libelle) VALUES ('unification_stock', current_database(), $1::jsonb, $2, $3) RETURNING id::text`,
      [JSON.stringify({ source: SOURCE_FILE, geste, ecriture, cle, lots: lots.map((x) => Number(x.id)), banIds: choisies.map((c) => c.id), adresses: libelles, raison: raison || null }), auteur.id, auteur.libelle]);
    const id = Number(o.id);
    // ① les biens de l'écriture : le rapprochement en cours fermé (tracé : l'annulation le rouvre), le nouveau ouvert
    const r = await rapprochementChoisi(choisies[0] ?? null, l0.code_postal, ecriture, geste === 'hors' ? `Hors périmètre / sans adresse : ${raison}` : `Vérifié par ${auteur.libelle} (${MOT_GESTE[geste]})`, q);
    for (const l of lots) {
      const { rows: [enCours] } = await q<{ id: string }>('SELECT id::text FROM gestion_lot_adresse_ban WHERE lot_id = $1 AND fin IS NULL FOR UPDATE', [l.id]);
      await enregistrerRapprochement(q, Number(l.id), r, { statut: geste === 'hors' ? 'refuse' : 'valide', origine: 'file_verification', methode: 'choix_humain', motifFin: `vérifié dans la file (choix n° ${id})`, operationId: id }, auteur);
      if (enCours !== undefined) await tracer(q, id, 'gestion_lot_adresse_ban', enCours.id, 'modification', 'fin', null, 'now');
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'adresse_verifiee', $2, $3, $4, $5, $6)`,
        [l.id, ecriture, libelles.join(' · ') || null, `Adresse vérifiée (choix n° ${id}) : « ${ecriture} » — ${geste === 'hors' ? `hors périmètre / sans adresse (${raison})` : `${MOT_GESTE[geste]} : ${libelles.join(' · ')}`}`, auteur.id, auteur.libelle]);
    }
    if (geste !== 'hors') await rattacherACopropriete(q, id, cleImmeuble(ecriture), ecriture, l0, choisies, geste === 'plusieurs', auteur);
    return id;
  }).catch((e: unknown) => { if (e instanceof RefusUnification) return e; throw e; });
  if (op instanceof RefusUnification) return { ok: false, motif: op.message };
  return { ok: true, operationId: op, message: geste === 'hors'
    ? `« ${ecriture} » (${lots.length} bien${lots.length > 1 ? 's' : ''}) : noté hors périmètre / sans adresse — ${raison}.`
    : `« ${ecriture} » (${lots.length} bien${lots.length > 1 ? 's' : ''}) : ${libelles.join(' · ')}.` };
}

/** La copropriété de l'adresse officielle reçoit l'écriture d'origine ; une plage reçoit ses adresses (la copropriété créée s'il n'y en a pas). */
async function rattacherACopropriete(q: RequeteTx, op: number, cle: string, ecriture: string, l: LotFile, choisies: CandidatBan[], plusieurs: boolean, auteur: Auteur): Promise<void> {
  const bans = choisies.map((c) => c.id);
  const { rows: porteurs } = await q<{ id: string; cle: string }>(
    `SELECT DISTINCT c.id::text, c.cle_immeuble AS cle FROM gestion_copropriete c LEFT JOIN gestion_copropriete_adresse a ON a.copropriete_id = c.id AND a.retire_le IS NULL
      WHERE c.ban_id = ANY($1::text[]) OR a.ban_id = ANY($1::text[])`, [bans]);
  const { rows: [propre] } = await q<{ id: string; ban_id: string | null }>('SELECT id::text, ban_id FROM gestion_copropriete WHERE cle_immeuble = $1', [cle]);
  const { rows: [sec] } = await q<{ id: string; copro: string; ban_id: string | null; sorte: string }>(
    'SELECT id::text, copropriete_id::text AS copro, ban_id, sorte FROM gestion_copropriete_adresse WHERE cle_immeuble = $1 AND retire_le IS NULL ORDER BY id LIMIT 1', [cle]);
  const ids = new Set([...porteurs.map((p) => p.id), ...(propre ? [propre.id] : []), ...(sec ? [sec.copro] : [])]);
  if (ids.size > 1) throw new RefusUnification('Cette adresse officielle est déjà celle d’une AUTRE copropriété enregistrée : les réunir (syndic, AG, contacts) n’est pas encore possible d’ici. Rien n’est enregistré.');
  let coproId = [...ids][0] ?? null;
  if (coproId === null && !plusieurs) return; // une seule écriture, aucune copropriété : le rapprochement du bien suffit (l'affichage lit l'adresse officielle)
  if (coproId === null) {
    const { rows: [c] } = await q<{ id: string }>(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, ban_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [cle, ecriture, l.code_postal, l.commune, auteur.id, auteur.libelle, bans[0]]);
    coproId = c.id;
    await tracer(q, op, 'gestion_copropriete', coproId, 'insertion');
  } else if (propre !== undefined && propre.id === coproId && propre.ban_id === null) {
    await q('UPDATE gestion_copropriete SET ban_id = $2 WHERE id = $1', [coproId, bans[0]]);
    await tracer(q, op, 'gestion_copropriete', coproId, 'modification', 'ban_id', null, bans[0]);
  }
  const { rows: [copro] } = await q<{ cle: string; ban_id: string | null }>('SELECT cle_immeuble AS cle, ban_id FROM gestion_copropriete WHERE id = $1', [coproId]);
  // l'écriture d'origine : la sienne, si elle n'est ni la copropriété ni déjà une de ses adresses
  if (copro.cle !== cle) {
    if (sec !== undefined && sec.copro === coproId) {
      if (sec.ban_id !== bans[0]) { await q('UPDATE gestion_copropriete_adresse SET ban_id = $2 WHERE id = $1', [sec.id, bans[0]]); await tracer(q, op, 'gestion_copropriete_adresse', sec.id, 'modification', 'ban_id', sec.ban_id, bans[0]); }
      if (sec.sorte !== 'ecriture') { await q(`UPDATE gestion_copropriete_adresse SET sorte = 'ecriture' WHERE id = $1`, [sec.id]); await tracer(q, op, 'gestion_copropriete_adresse', sec.id, 'modification', 'sorte', sec.sorte, 'ecriture'); }
    } else {
      const { rows: [x] } = await q<{ id: string }>(
        `INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, sorte, ban_id, operation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecriture', $8, $9) RETURNING id::text`, [coproId, cle, ecriture, l.code_postal, l.commune, auteur.id, auteur.libelle, bans[0], op]);
      await tracer(q, op, 'gestion_copropriete_adresse', x.id, 'insertion');
    }
  }
  // une plage : chaque adresse officielle choisie devient une ADRESSE de l'immeuble (sauf celle que la copropriété porte déjà)
  if (plusieurs) {
    for (const c of choisies) {
      if (copro.ban_id === c.id || (copro.ban_id === null && c.id === bans[0] && copro.cle === cle)) continue;
      const { rows: deja } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND ban_id = $2 AND retire_le IS NULL', [coproId, c.id]);
      if (deja.length > 0) continue;
      const voie = libelleOfficiel(c);
      const { rows: [x] } = await q<{ id: string }>(
        `INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, sorte, ban_id, operation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'adresse', $8, $9) RETURNING id::text`, [coproId, cleImmeuble(voie), voie, l.code_postal, c.commune, auteur.id, auteur.libelle, c.id, op]);
      await tracer(q, op, 'gestion_copropriete_adresse', x.id, 'insertion');
    }
  }
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_verifiee', $2, $3, $4)`,
    [coproId, `Adresse vérifiée (choix n° ${op}) : l’écriture « ${ecriture} » rattachée à ${choisies.map((c) => libelleDe(c, l.code_postal)).join(' · ')}`, auteur.id, auteur.libelle]);
}

/** « ANNULER CE CHOIX » : la passe du geste annulée (rapprochement précédent rouvert, ajouts retirés). */
export async function annulerChoix(operationId: number, auteur: Auteur): Promise<{ ok: true; message: string } | { ok: false; motif: string }> {
  const { rows: [o] } = await query<{ source: string | null; ecriture: string | null; lots: number[] | null }>(
    `SELECT plan->>'source' AS source, plan->>'ecriture' AS ecriture, ARRAY(SELECT jsonb_array_elements_text(plan->'lots'))::int[] AS lots FROM gestion_adresse_operation WHERE id = $1`, [operationId]);
  if (o === undefined || o.source !== SOURCE_FILE) return { ok: false, motif: 'Ce choix n’existe pas (ou n’est pas un choix de la file).' };
  try {
    await withTransaction(async (q) => {
      await annulerUnification(q, operationId, auteur);
      for (const lot of o.lots ?? []) {
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'adresse_verification_annulee', $2, $3, $4)`,
          [lot, `Choix n° ${operationId} annulé : « ${o.ecriture ?? ''} » revient dans la file des adresses à vérifier`, auteur.id, auteur.libelle]);
      }
    });
  } catch (e) { if (e instanceof RefusUnification) return { ok: false, motif: e.message }; throw e; }
  return { ok: true, message: `Choix annulé : « ${o.ecriture ?? ''} » revient dans la file.` };
}
