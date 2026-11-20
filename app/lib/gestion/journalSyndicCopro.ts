import { query, type RequeteTx } from '../db/client';
import { creerMemoireSonde } from '../db/sondeSchema';
import { colonneExisteMemo } from '../location/sondeLocation';
import type { Auteur } from './gestes';
import { immeubleDuBien } from './copropriete';
import { adresseImmeuble, cleImmeuble, nomAvecVille } from './syndics';

/**
 * ══ 🔴🔴 LE JOURNAL DES LIENS SYNDIC ↔ COPROPRIÉTÉ (Arno, 20/11/2026, lot « Journal des syndics »). IMPUR (base). ═══════════════════════════════════
 *
 * LE CONSTAT (production, 20/11) : le syndic CABINET PASCAL TOUBON a été rattaché à la copropriété « 80 rue de Normandie » en le créant (29/10), puis
 * détaché depuis la fiche syndic (20/11) — et AUCUN des deux gestes n'avait écrit au journal : seule la table `gestion_copropriete_syndic` le disait.
 *
 * DÉSORMAIS chaque rattachement, remplacement et retrait, QUEL QUE SOIT LE CHEMIN (fiche syndic à la création ou en modification, fiche copropriété,
 * proposition par adresse, création ou fiche d'un bien en Location, retirer de la résidence, fermeture définitive, « Même syndic : regrouper ? »,
 * regroupement / dégroupement 504, rattachement par la parcelle), écrit UNE ligne dans `gestion_journal`, dans la transaction du geste : qui, quand
 * (horodatage de la base), l'écran d'origine, le syndic, la copropriété, la nature (rattaché / remplacé / retiré) et l'ancien syndic quand il y en
 * avait un. Une seule fonction, ici : aucun chemin n'écrit sa propre version.
 *
 * L'ENTITÉ : « copropriete » (identifiant de la copropriété) — migration 506. Sans la 506, le journal ne l'accepte pas encore : la ligne va alors à
 * chaque bien de la copropriété (« annuaire_lot »), comme le fait déjà le dossier de location sans la 418 ; rien n'est perdu, rien ne casse.
 */

export type NatureLien = 'rattache' | 'remplace' | 'retire';
export const ACTION_LIEN: Readonly<Record<NatureLien, string>> = { rattache: 'syndic_rattache', remplace: 'syndic_remplace', retire: 'syndic_retire_copropriete' };

const memoire = creerMemoireSonde();
/** Le journal accepte-t-il l'entité « copropriete » (migration 506) ? Sondé hors transaction, mémorisé (le « oui » pour toujours). */
export function journalCoproprieteDisponible(): Promise<boolean> {
  return memoire.memoiser('journal.entite_copropriete', async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = to_regclass('public.gestion_journal') AND conname = 'gestion_journal_entite_chk'
            AND pg_get_constraintdef(oid) LIKE '%''copropriete''%'`);
      return (rows[0]?.n ?? 0) > 0;
    } catch { return false; }
  });
}

export interface GesteLien {
  coproId: string | number;
  nature: NatureLien;
  /** le syndic rattaché (rattaché, remplacé : le nouveau) ou retiré */
  syndicId: number;
  /** remplacé : l'ancien syndic */
  ancienSyndicId?: number | null;
  /** l'écran d'origine, en clair (« fiche syndic », « fiche copropriété », « création du bien (Location) »…) */
  ecran: string;
  /** le motif d'un retrait (« retrait », « fermeture définitive », « regroupement »…), ou une précision */
  motif?: string | null;
}

async function nomSyndic(q: RequeteTx, id: number | null | undefined): Promise<string | null> {
  if (id === null || id === undefined) return null;
  const { rows } = await q<{ nom: string; ville: string | null }>('SELECT nom, ville FROM gestion_syndic WHERE id = $1', [id]);
  return rows[0] === undefined ? `syndic n° ${id}` : nomAvecVille(rows[0].nom, rows[0].ville);
}

/** La phrase du journal. PUR. */
export function phraseLien(nature: NatureLien, syndic: string, copro: string, ancien: string | null, ecran: string, motif: string | null): string {
  const depuis = ` (depuis ${ecran}${motif ? ` — ${motif}` : ''})`;
  if (nature === 'remplace') return `Syndic ${syndic} rattaché à la copropriété ${copro}, à la place de ${ancien ?? 'l’ancien syndic'}${depuis}`;
  if (nature === 'retire') return `Syndic ${syndic} retiré de la copropriété ${copro}${depuis}`;
  return `Syndic ${syndic} rattaché à la copropriété ${copro}${depuis}`;
}

/** ÉCRIT la ligne du geste, dans la transaction de l'appelant. */
export async function journaliserLienSyndic(q: RequeteTx, g: GesteLien, auteur: Auteur): Promise<void> {
  const { rows: [c] } = await q<{ id: string; cle: string; libelle: string; cp: string | null; commune: string | null }>(
    'SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete WHERE id = $1', [g.coproId]);
  if (c === undefined) return;
  const syndic = (await nomSyndic(q, g.syndicId)) ?? '';
  const ancien = g.nature === 'remplace' ? await nomSyndic(q, g.ancienSyndicId) : null;
  const copro = adresseImmeuble(c.libelle, c.cp, c.commune);
  const phrase = phraseLien(g.nature, syndic, copro, ancien, g.ecran, g.motif ?? null);
  const action = ACTION_LIEN[g.nature];
  const avant = g.nature === 'rattache' ? null : g.nature === 'retire' ? syndic : ancien;
  const apres = g.nature === 'retire' ? null : syndic;
  await ecrireLigneCopropriete(q, c, { action, avant, apres, phrase, champ: 'syndic', ecran: g.ecran }, auteur);
}

/**
 * UNE ligne de journal d'une copropriété, dans la transaction de l'appelant : sur l'entité « copropriete » (506), sinon à chaque bien de la
 * copropriété (adresse principale et adresses secondaires en cours). La même écriture pour les liens syndic et les contacts du syndic.
 */
async function ecrireLigneCopropriete(q: RequeteTx, c: { id: string; cle: string },
  l: { action: string; avant: string | null; apres: string | null; phrase: string; champ: string; ecran: string }, auteur: Auteur): Promise<void> {
  const { action, avant, apres, phrase } = l;
  // l'écran d'origine va aussi dans sa colonne quand elle existe (417)
  const avec417 = await colonneExisteMemo('gestion_journal', 'ecran');
  const colonnes = ['entite', 'entite_id', 'action', 'valeur_avant', 'valeur_apres', 'commentaire', 'auteur_id', 'auteur_libelle', ...(avec417 ? ['sujet', 'champ', 'ecran'] : [])];
  const insere = (entite: string, id: string, commentaire: string) => q(
    `INSERT INTO gestion_journal (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(', ')})`,
    [entite, id, action, avant, apres, commentaire, auteur.id, auteur.libelle, ...(avec417 ? ['copropriete', l.champ, l.ecran] : [])]);
  if (await journalCoproprieteDisponible()) { await insere('copropriete', c.id, phrase); return; }
  // sans la 506 : une ligne à chaque bien de la copropriété (adresse principale et adresses secondaires en cours)
  const { rows: sec } = await q<{ cle: string }>('SELECT cle_immeuble AS cle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL', [c.id]);
  const cles = new Set([c.cle, ...sec.map((s) => s.cle)]);
  const { rows: lots } = await q<{ id: string; immeuble: string | null; adresse: string | null }>(
    'SELECT id::text, immeuble, adresse FROM gestion_annuaire_lot WHERE absent_le IS NULL ORDER BY id');
  for (const l of lots.filter((x) => cles.has(cleImmeuble(immeubleDuBien(x))))) await insere('annuaire_lot', l.id, phrase);
}

// ══ 🔴 (Arno, 20/11/2026) LES CONTACTS DU SYNDIC RATTACHÉS À UNE COPROPRIÉTÉ — chaque rattachement, création, détachement : UNE ligne ═══════════════

export type NatureContact = 'rattache' | 'cree' | 'detache';
export const ACTION_CONTACT: Readonly<Record<NatureContact, string>> = {
  rattache: 'syndic_contact_rattache', cree: 'syndic_contact_cree_rattache', detache: 'syndic_contact_detache',
};

/** La phrase du journal d'un contact du syndic. PUR. */
export function phraseContact(nature: NatureContact, contact: string, syndic: string, copro: string, ecran: string, motif: string | null): string {
  const depuis = ` (depuis ${ecran}${motif ? ` — ${motif}` : ''})`;
  if (nature === 'detache') return `Contact ${contact} (syndic ${syndic}) détaché de la copropriété ${copro} — il reste dans l’annuaire du syndic${depuis}`;
  if (nature === 'cree') return `Contact ${contact} créé dans l’annuaire du syndic ${syndic} et rattaché à la copropriété ${copro}${depuis}`;
  return `Contact ${contact} (syndic ${syndic}) rattaché à la copropriété ${copro}${depuis}`;
}

/** ÉCRIT une ligne par contact, dans la transaction de l'appelant. */
export async function journaliserContactsSyndic(q: RequeteTx, g: { coproId: string | number; syndicId: number; nature: NatureContact;
  contactIds: readonly number[]; ecran: string; motif?: string | null }, auteur: Auteur): Promise<void> {
  if (g.contactIds.length === 0) return;
  const { rows: [c] } = await q<{ id: string; cle: string; libelle: string; cp: string | null; commune: string | null }>(
    'SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete WHERE id = $1', [g.coproId]);
  if (c === undefined) return;
  const syndic = (await nomSyndic(q, g.syndicId)) ?? '';
  const copro = adresseImmeuble(c.libelle, c.cp, c.commune);
  const { rows: ct } = await q<{ id: string; nom: string }>(
    `SELECT id::text, btrim(concat_ws(' ', civilite, prenom, upper(nom), CASE WHEN nullif(btrim(titre), '') IS NULL THEN NULL ELSE '(' || btrim(titre) || ')' END)) AS nom
       FROM gestion_syndic_contact WHERE id = ANY($1::bigint[]) ORDER BY id`, [[...g.contactIds]]);
  for (const x of ct) {
    const nom = x.nom || `n° ${x.id}`;
    await ecrireLigneCopropriete(q, c, { action: ACTION_CONTACT[g.nature], avant: g.nature === 'detache' ? nom : null, apres: g.nature === 'detache' ? null : nom,
      phrase: phraseContact(g.nature, nom, syndic, copro, g.ecran, g.motif ?? null), champ: 'contact syndic', ecran: g.ecran }, auteur);
  }
}

// ══ L'HISTORIQUE DU SYNDIC SUR LA FICHE COPROPRIÉTÉ — le journal, et le registre des liens pour ce qui est d'avant (lecture seule) ══════════════════

export interface EvenementSyndic { quand: string; le: string; texte: string; par: string; source: 'journal' | 'registre' }

/**
 * L'historique du syndic d'une copropriété, du plus récent au plus ancien : les lignes du journal (depuis ce lot), et, pour ce qui précède, les liens
 * du registre `gestion_copropriete_syndic` (début, fin) — un lien dont le geste a déjà sa ligne au journal (même instant) n'est pas répété. LECTURE SEULE.
 */
export async function historiqueSyndic(coproId: number): Promise<EvenementSyndic[]> {
  const avec506 = await journalCoproprieteDisponible();
  const { rows: journal } = avec506 ? await query<{ quand: string; le: string; texte: string; par: string }>(
    `SELECT j.survenu_le::text AS quand, to_char(j.survenu_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY "à" HH24"h"MI') AS le, j.commentaire AS texte, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), j.auteur_libelle) AS par
       FROM gestion_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id
      WHERE j.entite = 'copropriete' AND j.entite_id = $1 AND j.action = ANY($2::text[]) ORDER BY j.survenu_le DESC, j.id DESC`,
    [coproId, Object.values(ACTION_LIEN)]) : { rows: [] };
  const deja = new Set(journal.map((j) => j.quand));
  const { rows: liens } = await query<{ debut: string; fin: string | null; le_debut: string; le_fin: string | null; pose: string; fin_par: string | null; motif: string | null; nom: string; ville: string | null }>(
    `SELECT cs.debut::text AS debut, cs.fin::text AS fin, to_char(cs.debut AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY "à" HH24"h"MI') AS le_debut, to_char(cs.fin AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY "à" HH24"h"MI') AS le_fin, cs.pose_par_libelle AS pose, cs.fin_par_libelle AS fin_par, cs.fin_motif AS motif, s.nom, s.ville
       FROM gestion_copropriete_syndic cs JOIN gestion_syndic s ON s.id = cs.syndic_id WHERE cs.copropriete_id = $1`, [coproId]);
  const registre: EvenementSyndic[] = [];
  for (const l of liens) {
    const nom = nomAvecVille(l.nom, l.ville);
    if (!deja.has(l.debut)) registre.push({ quand: l.debut, le: l.le_debut, texte: `Syndic ${nom} rattaché`, par: l.pose, source: 'registre' });
    if (l.fin !== null && !deja.has(l.fin)) registre.push({ quand: l.fin, le: l.le_fin ?? '', texte: `Syndic ${nom} retiré${l.motif ? ` (${l.motif})` : ''}`, par: l.fin_par ?? '—', source: 'registre' });
  }
  return [...journal.map((j) => ({ ...j, source: 'journal' as const })), ...registre].sort((a, b) => b.quand.localeCompare(a.quand));
}
