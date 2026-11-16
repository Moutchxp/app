import { query } from '../db/client';
import { chargerConfigGestion } from './config';
import { estInterne } from './adressesMessage';

/**
 * ══ 🔴🔴 GARDE-FOU : UN HABITANT NE VOIT JAMAIS LES AUTRES DESTINATAIRES (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 2) ═══════════
 *
 * Les habitants de l'immeuble (copropriétaires, conseil syndical, contacts personnalisés du carnet, 333/476) sont proposés comme destinataires
 * internes, comme les gardiens. Règle d'Arno : « jamais plusieurs habitants ou clients visibles entre eux dans un même envoi (un envoi par
 * destinataire, ou copie cachée), et aucune coordonnée d'un habitant n'est jamais communiquée à un autre client ». Un habitant en « À » ou
 * « Cc » est donc REFUSÉ dès qu'une autre personne extérieure à l'agence y figure aussi : il faut le mettre en « Cci », ou lui écrire seul.
 * Les adresses de l'agence (gestion@, collaborateurs, partenaires internes) ne comptent pas. Le serveur décide (route des envois, avant la mise
 * en file comme avant l'envoi direct) ; le gardien, lui, garde son usage d'aujourd'hui.
 */
export const MOTIF_HABITANT_VISIBLE = 'Confidentialité : un habitant de l’immeuble ne doit voir aucun autre destinataire. Mettez-le en copie cachée (Cci), ou écrivez-lui dans un mail à part.';
/** Les catégories du carnet qui désignent un HABITANT (le gardien n'en est pas un). */
export const CATEGORIES_HABITANT = ['coproprietaire', 'conseil_syndical', 'personnalise'] as const;

const net = (a: string): string => a.trim().toLowerCase();

/** Le refus (ou `null`) : un habitant visible avec au moins une autre personne extérieure visible. PUR. */
export function refusHabitantVisible(visibles: readonly string[], habitants: ReadonlySet<string>, interne: (adresse: string) => boolean): string | null {
  const exterieurs = [...new Set(visibles.map(net).filter((a) => a !== '' && !interne(a)))];
  return exterieurs.length >= 2 && exterieurs.some((a) => habitants.has(a)) ? MOTIF_HABITANT_VISIBLE : null;
}

/** Les adresses e-mail des habitants (carnets en cours) parmi celles-ci. */
async function habitantsParmi(adresses: readonly string[]): Promise<Set<string>> {
  if (adresses.length === 0) return new Set();
  const { rows } = await query<{ valeur: string }>(
    `SELECT DISTINCT lower(btrim(k.valeur)) AS valeur FROM gestion_copropriete_contact_coordonnee k
       JOIN gestion_copropriete_contact ct ON ct.id = k.contact_id
      WHERE k.sorte = 'email' AND k.retire_le IS NULL AND ct.retire_le IS NULL AND ct.categorie = ANY($2::text[])
        AND lower(btrim(k.valeur)) = ANY($1::text[])`, [adresses.map(net), [...CATEGORIES_HABITANT]]);
  return new Set(rows.map((r) => r.valeur));
}

/** Le refus d'un envoi (`À` et `Cc` sont visibles ; `Cci` ne l'est pas), ou `null`. */
export async function refusEnvoiHabitants(d: { a: readonly string[]; cc: readonly string[] }): Promise<string | null> {
  const visibles = [...d.a, ...d.cc];
  if (visibles.length < 2) return null;
  const config = await chargerConfigGestion();
  const interne = (a: string): boolean => estInterne(a, config.adresseGestion);
  const exterieurs = visibles.filter((a) => !interne(a));
  if (exterieurs.length < 2) return null;
  return refusHabitantVisible(visibles, await habitantsParmi(exterieurs), interne);
}
