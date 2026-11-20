import { query, type RequeteTx } from '../db/client';
import { rapprocherAdresse } from './banRepo';
import { adresseAffichee, communeAffichee, voieAffichee } from './libelleAffiche';

/**
 * ══ 🔴🔴 L'ADRESSE OFFICIELLE D'UNE PERSONNE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7c, migration 509). IMPUR (base). ═══════════════
 *
 * Le FORMAT UNIQUE (identifiant BAN, libellé officiel, numéro et indice, code postal, INSEE, commune) d'un propriétaire, d'un locataire, d'une carte
 * de contact ou de garant, d'un apporteur — À CÔTÉ de son adresse texte, jamais à sa place.
 *   • seule une NOUVELLE saisie le remplit : l'appelant n'appelle `enregistrerAdressePersonne` que quand le contrôle d'adresse dit « écrire » (adresse
 *     touchée) ; une adresse déjà enregistrée n'est JAMAIS réécrite ni « rapprochée après coup » ;
 *   • « liste » retrouvée avec CERTITUDE par le module unique → une ligne en cours (la précédente fermée) ; hors liste, à l'étranger, ou pas certaine →
 *     la ligne en cours est fermée (l'adresse a changé, l'ancienne n'est plus la sienne) et rien n'est posé : l'écran et les mails lisent alors le texte ;
 *   • sans la migration 509 : rien (l'application d'avant).
 */
/** 🔴 (lot 7d, migration 510) la vente (adresse du bien), un vendeur / acquéreur / représentant, le cabinet d'un syndic */
export type SujetPersonne = 'proprietaire' | 'locataire' | 'carte' | 'apporteur' | 'transaction_vente' | 'transaction_personne' | 'syndic';
export interface AuteurAdresse { id: number | null; libelle: string }
export interface AdresseOfficiellePersonne { banId: string; libelle: string; court: string; codePostal: string | null; commune: string | null }

let disponible = false;
export async function adressePersonneDisponible(): Promise<boolean> {
  if (disponible) return true;
  try {
    const { rows } = await query<{ ok: boolean }>(`SELECT to_regclass('public.gestion_personne_adresse_ban') IS NOT NULL AS ok`);
    disponible = rows?.[0]?.ok === true;
  } catch { disponible = false; }
  return disponible;
}

/** Une adresse de personne SAISIE (touchée) : son format unique posé, ou la ligne en cours fermée. Dans la transaction de l'appelant. */
export async function enregistrerAdressePersonne(q: RequeteTx, sujet: SujetPersonne, id: number,
  a: { adresse: string | null; codePostal: string | null; commune: string | null; nature: string | null }, auteur: AuteurAdresse): Promise<'pose' | 'ferme' | 'rien'> {
  if (!(await adressePersonneDisponible())) return 'rien';
  const texte = (a.adresse ?? '').trim();
  const r = texte !== '' && (a.nature ?? 'liste') === 'liste' ? await rapprocherAdresse({ texte, codePostal: a.codePostal, commune: a.commune }) : null;
  const ban = r?.statut === 'certain' ? r.ban : null;
  const { rows: [enCours] } = await q<{ id: string; ban_id: string }>(
    'SELECT id::text, ban_id FROM gestion_personne_adresse_ban WHERE sujet = $1 AND sujet_id = $2 AND fin IS NULL FOR UPDATE', [sujet, id]);
  if (ban !== null && ban !== undefined && enCours?.ban_id === ban.id) return 'rien';
  if (enCours !== undefined) {
    await q('UPDATE gestion_personne_adresse_ban SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = $4 WHERE id = $1',
      [enCours.id, auteur.id, auteur.libelle, ban ? 'nouvelle adresse choisie dans la liste' : 'adresse changée (hors liste, à l’étranger ou non retrouvée)']);
  }
  if (!ban) return enCours === undefined ? 'rien' : 'ferme';
  await q(`INSERT INTO gestion_personne_adresse_ban (sujet, sujet_id, ban_id, libelle_officiel, numero, suffixe, code_postal, insee, commune, texte_source, cree_par, cree_par_libelle)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [sujet, id, ban.id, r?.ban?.libelle ?? null, ban.numero, ban.suffixe, r?.codePostal ?? a.codePostal, ban.insee, ban.commune, texte, auteur.id, auteur.libelle]);
  return 'pose';
}

/** Les adresses officielles EN COURS de plusieurs personnes d'un même genre (id → adresse mise en forme). LECTURE SEULE ; vide sans la 509. */
export async function adressesOfficiellesDesPersonnes(sujet: SujetPersonne, ids: readonly number[]): Promise<Map<number, AdresseOfficiellePersonne>> {
  const out = new Map<number, AdresseOfficiellePersonne>();
  if (ids.length === 0 || !(await adressePersonneDisponible())) return out;
  const { rows } = await query<{ sujet_id: string; ban_id: string; libelle_officiel: string; code_postal: string | null; commune: string | null }>(
    `SELECT sujet_id::text, ban_id, libelle_officiel, code_postal, commune FROM gestion_personne_adresse_ban WHERE sujet = $1 AND sujet_id = ANY($2::bigint[]) AND fin IS NULL`,
    [sujet, [...ids]]);
  for (const r of rows ?? []) {
    out.set(Number(r.sujet_id), { banId: r.ban_id, court: voieAffichee(r.libelle_officiel), codePostal: r.code_postal, commune: r.commune === null ? null : communeAffichee(r.commune),
      libelle: adresseAffichee(`${r.libelle_officiel}, ${[r.code_postal, r.commune].filter((x) => (x ?? '').trim() !== '').join(' ')}`) });
  }
  return out;
}

/** 🔴 (lot 7d) Une adresse gardée en UNE chaîne (« 3 Rue des Lilas, 75019 Paris ») : découpée en voie, code postal, commune. PUR. */
export function decouperAdresseTexte(texte: string | null): { adresse: string | null; codePostal: string | null; commune: string | null } {
  const t = (texte ?? '').trim();
  const m = /^(.*\S)\s*,\s*(\d{5})\s+(\S.*)$/.exec(t);
  return m === null ? { adresse: t === '' ? null : t, codePostal: null, commune: null } : { adresse: m[1], codePostal: m[2], commune: m[3] };
}

/**
 * 🔴 (lot 7d) UNE ADRESSE EN UNE CHAÎNE, TOUCHÉE (l'appelant compare l'ancienne et la nouvelle) : choisie dans la liste (« liste ») → le format unique ;
 * saisie libre ou tapée sans choisir → la ligne en cours fermée. Jamais appelée pour une chaîne inchangée : l'existant n'est jamais réécrit.
 */
export async function enregistrerAdresseTexte(q: RequeteTx, sujet: SujetPersonne, id: number, texte: string | null, nature: 'liste' | 'libre' | null | undefined,
  auteur: AuteurAdresse): Promise<'pose' | 'ferme' | 'rien'> {
  return enregistrerAdressePersonne(q, sujet, id, { ...decouperAdresseTexte(texte), nature: nature === 'liste' ? 'liste' : 'hors_liste' }, auteur);
}
