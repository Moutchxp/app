import { query } from '../db/client';
import { estNoReply } from '../permis/complementPieces';
import { FORME_EMAIL } from '../sitadel/reglagesVeille';
import { estParmiDernieres } from './rangDernieres';

// LOT 27 — RÉEXPORT : `estParmiDernieres` vit dans un module PUR sans import (client-safe, cf. rangDernieres.ts) ; on le réexporte
//   ici pour ne rien casser des importeurs serveur historiques (cascadePartielleRepo, LOT 20).
export { estParmiDernieres };

/**
 * LOT 20 — « TOUTES LES ADRESSES CONNUES D'UNE COMMUNE » pour adresser les 2 dernières relances d'un parcours à l'ensemble des
 * adresses (règle validée par Arno). Deux parties :
 *   • `composerDestinatairesCommune` — cœur PUR (aucune I/O) : dédup insensible à la casse, exclusions (no-reply, mailer-daemon/
 *     postmaster, non-adresse), dest_email TOUJOURS en tête. TESTABLE SANS RÉSEAU.
 *   • `lireSourcesAdressesCommune` / `composerDestinatairesDemande` — lecture SEULE des sources RETENUES :
 *       dest_email (demande) ∪ mairie_contact(canal='email' ET statut='confirme') ∪ mairie_prada(courriel) ∪ répondants réels
 *       (demande_reponse hors rebond de CETTE demande). Les `presume` de mairie_contact sont EXCLUS (adresses devinées → jamais
 *       d'envoi auto vers du non vérifié, arbitrage Arno). AUCUN envoi ici.
 */
export interface SourcesAdressesCommune {
  destEmail: string | null;      // dest_email FIGÉ de la demande — toujours en tête de liste
  contactsConfirmes: string[];   // mairie_contact : canal='email' ET statut='confirme' (les 'presume' EXCLUS)
  prada: string[];               // mairie_prada.courriel (non vide)
  repondants: string[];          // demande_reponse.de_adresse (nature<>'rebond') sur TOUTE la commune — interlocuteurs réels connus
}

/** Une adresse est-elle SERVABLE (vraie adresse, ni no-reply, ni expéditeur système de rebond) ? PUR — source d'exclusion UNIQUE (composer + Règle A). */
export function estAdresseServable(brut: string | null | undefined): boolean {
  const a = (brut ?? '').trim();
  if (a === '') return false;
  if (!FORME_EMAIL.test(a)) return false;                                 // pas une adresse e-mail (URL de formulaire, etc.)
  if (estNoReply(a)) return false;                                        // no-reply / donotreply / ne-pas-repondre
  if (['mailer-daemon', 'postmaster'].includes(a.toLowerCase().split('@')[0])) return false; // expéditeur système d'un rebond
  return true;
}

/** Compose la liste finale (dédup insensible à la casse, dest_email en tête) en écartant no-reply, mailer-daemon/postmaster, non-adresses. PUR. */
export function composerDestinatairesCommune(s: SourcesAdressesCommune): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  const ajouter = (brut: string | null | undefined): void => {
    const a = (brut ?? '').trim();
    if (a === '' || vus.has(a.toLowerCase())) return;
    if (!estAdresseServable(a)) return;
    vus.add(a.toLowerCase()); out.push(a);
  };
  ajouter(s.destEmail);                       // TOUJOURS le destinataire figé, en premier
  for (const c of s.contactsConfirmes) ajouter(c);
  for (const c of s.prada) ajouter(c);
  for (const c of s.repondants) ajouter(c);
  return out;
}

/**
 * LOT 27 — RÈGLE A (défaut général) : sources pour choisir le destinataire UNIQUE par défaut d'une relance = le DERNIER répondant
 * de LA DEMANDE (`demande_reponse.de_adresse` le plus récent), puis, à défaut, la chaîne de repli (dest_email figé → mairie_contact
 * confirmé → prada). Les `presume` restent EXCLUS (jamais dans `contactsConfirmes`). Vaut pour la cascade ORDINAIRE ET la partielle.
 */
export interface SourcesDestinataireDefaut {
  dernierRepondant: string | null; // demande_reponse.de_adresse le plus récent de CETTE demande (nature<>'rebond')
  destEmail: string | null;        // repli 1 : destinataire figé de la demande
  contactsConfirmes: string[];     // repli 2 : mairie_contact confirmé (presume EXCLUS)
  prada: string[];                 // repli 3 : mairie_prada
}

/** RÈGLE A — 1re adresse SERVABLE dans l'ordre : dernier répondant → dest_email → contact confirmé → prada. `null` si aucune. PUR. */
export function choisirDestinataireParDefaut(s: SourcesDestinataireDefaut): string | null {
  for (const cand of [s.dernierRepondant, s.destEmail, ...s.contactsConfirmes, ...s.prada]) {
    if (estAdresseServable(cand)) return (cand as string).trim();
  }
  return null;
}

/**
 * LOT 27 — DESTINATAIRES SERVIS d'une relance, à partir des données déjà lues. PUR. Combine :
 *   • RÈGLE A — destinataire par défaut (dernier répondant / repli), toujours au moins `destEmailFige` ;
 *   • RÈGLE B — pour les `nbDernieres` DERNIÈRES étapes (si `multiActive`), TOUTES les adresses de la commune (`listeLarge`).
 * Le défaut Règle A reste TOUJOURS dans la liste B (il fait partie de la conversation — presque toujours déjà présent).
 */
export function resoudreDestinatairesRelance(a: {
  defautRegleA: string | null; destEmailFige: string; listeLarge: string[];
  rang: number; total: number; multiActive: boolean; nbDernieres: number;
}): string[] {
  const defaut = a.defautRegleA ?? a.destEmailFige;
  const enB = a.multiActive && a.nbDernieres > 0 && estParmiDernieres(a.rang, a.total, a.nbDernieres);
  if (enB && a.listeLarge.length > 1) {
    return a.listeLarge.some((x) => x.toLowerCase() === defaut.toLowerCase()) ? a.listeLarge : [defaut, ...a.listeLarge];
  }
  return [defaut];
}

/** Lit les sources d'adresses d'une commune pour UNE demande (LECTURE SEULE). Résilient : source absente → liste vide (jamais d'échec). */
export async function lireSourcesAdressesCommune(demandeId: number, codeInsee: string): Promise<SourcesAdressesCommune> {
  const un = async (sql: string, params: unknown[]): Promise<string[]> => {
    try { const { rows } = await query<{ a: string }>(sql, params); return rows.map((r) => r.a).filter((a) => a && a.trim() !== ''); }
    catch { return []; }
  };
  const [dest, contactsConfirmes, prada, repondants] = await Promise.all([
    un(`SELECT dest_email AS a FROM demande WHERE id = $1`, [demandeId]),
    un(`SELECT email AS a FROM mairie_contact WHERE code_insee = $1 AND canal = 'email' AND statut = 'confirme' AND coalesce(btrim(email), '') <> ''`, [codeInsee]),
    un(`SELECT courriel AS a FROM mairie_prada WHERE code_insee = $1 AND coalesce(btrim(courriel), '') <> ''`, [codeInsee]),
    // Répondants réels connus de la COMMUNE (toutes ses demandes), pas seulement de la demande courante — « toutes les adresses connues de la commune ».
    un(`SELECT DISTINCT r.de_adresse AS a FROM demande_reponse r JOIN demande d ON d.id = r.demande_id
         WHERE d.code_insee = $1 AND r.nature <> 'rebond' AND coalesce(btrim(r.de_adresse), '') <> ''`, [codeInsee]),
  ]);
  return { destEmail: dest[0] ?? null, contactsConfirmes, prada, repondants };
}

/** Liste finale des destinataires (toutes adresses connues) pour une demande. LECTURE SEULE, aucun envoi. */
export async function composerDestinatairesDemande(demandeId: number, codeInsee: string): Promise<string[]> {
  return composerDestinatairesCommune(await lireSourcesAdressesCommune(demandeId, codeInsee));
}

/**
 * LOT 27 — RÈGLE A : destinataire UNIQUE par défaut d'une relance = dernier répondant de LA DEMANDE, repli chaîne. LECTURE SEULE.
 * Résilient (source absente → repli suivant). Le dernier répondant est le `de_adresse` le plus récent (nature<>'rebond') de cette demande.
 */
export async function lireDestinataireParDefaut(demandeId: number, codeInsee: string): Promise<string | null> {
  const [rep, sources] = await Promise.all([
    (async () => {
      try {
        const { rows } = await query<{ a: string }>(
          `SELECT de_adresse AS a FROM demande_reponse
            WHERE demande_id = $1 AND nature <> 'rebond' AND coalesce(btrim(de_adresse), '') <> ''
            ORDER BY recu_le DESC NULLS LAST LIMIT 1`, [demandeId]);
        return rows[0]?.a ?? null;
      } catch { return null; }
    })(),
    lireSourcesAdressesCommune(demandeId, codeInsee),
  ]);
  return choisirDestinataireParDefaut({ dernierRepondant: rep, destEmail: sources.destEmail, contactsConfirmes: sources.contactsConfirmes, prada: sources.prada });
}

