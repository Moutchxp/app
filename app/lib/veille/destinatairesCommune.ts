import { query } from '../db/client';
import { estNoReply } from '../permis/complementPieces';
import { FORME_EMAIL } from '../sitadel/reglagesVeille';

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

/** Compose la liste finale (dédup insensible à la casse, dest_email en tête) en écartant no-reply, mailer-daemon/postmaster, non-adresses. PUR. */
export function composerDestinatairesCommune(s: SourcesAdressesCommune): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  const ajouter = (brut: string | null | undefined): void => {
    const a = (brut ?? '').trim();
    if (a === '') return;
    const cle = a.toLowerCase();
    if (vus.has(cle)) return;
    if (!FORME_EMAIL.test(a)) return;                                   // pas une adresse e-mail (URL de formulaire, etc.)
    if (estNoReply(a)) return;                                          // no-reply / donotreply / ne-pas-repondre
    if (['mailer-daemon', 'postmaster'].includes(cle.split('@')[0])) return; // expéditeur système d'un rebond
    vus.add(cle); out.push(a);
  };
  ajouter(s.destEmail);                       // TOUJOURS le destinataire figé, en premier
  for (const c of s.contactsConfirmes) ajouter(c);
  for (const c of s.prada) ajouter(c);
  for (const c of s.repondants) ajouter(c);
  return out;
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
 * LOT 20 — une relance de rang `rang` (1 = la plus ancienne) dans un parcours de `total` relances-mails fait-elle partie des
 * `nbDernieres` DERNIÈRES (celles qui reçoivent le multi-adresse) ? PUR. Ordinaire : rangs rappel=1/avis=2/saisine=3, total=3.
 * Partiel : relances 1..N puis annonce (rang N+1), total=N+1. `nbDernieres=0` → aucune ; `nbDernieres≥total` → toutes.
 */
export function estParmiDernieres(rang: number, total: number, nbDernieres: number): boolean {
  return nbDernieres > 0 && rang > total - nbDernieres;
}
