import { query } from '../db/client';
import { estNoReply } from '../permis/complementPieces';
import { FORME_EMAIL } from '../sitadel/reglagesVeille';
import { estParmiDernieres } from './rangDernieres';
import type { OptionDestinataire, ProvenanceAdresse } from './optionsDestinataire';

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
  ajouts: string[];              // LOT 29 : mairie_contact_email (adresses CONFIRMÉES ajoutées à la main) — table additive, presume sans objet
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
  for (const c of s.ajouts) ajouter(c);       // LOT 29 : adresses confirmées ajoutées à la main (règle B) — vide pour une commune sans ajout → liste inchangée
  for (const c of s.prada) ajouter(c);
  for (const c of s.repondants) ajouter(c);
  return out;
}

/**
 * LOT 29 — OPTIONS ORDONNÉES du sélecteur de destinataire (PUR). Même exclusions/dédoublonnage que `composerDestinatairesCommune`
 * (dédup insensible à la casse, non-adresses/no-reply écartés), mais chaque option porte SA PROVENANCE (l'écran ne doit pas laisser
 * croire que toutes ont répondu) et le DÉFAUT (règle A) est remonté EN TÊTE (c'est la présélection). Priorité d'attribution de la
 * provenance quand une adresse est dans plusieurs sources : répondant > adresse d'envoi > ajout manuel > contact confirmé > PRADA.
 */
export function composerOptionsDestinataire(s: SourcesAdressesCommune, defaut: string | null): OptionDestinataire[] {
  const vus = new Map<string, OptionDestinataire>();
  const ajouter = (brut: string | null | undefined, provenance: ProvenanceAdresse): void => {
    const a = (brut ?? '').trim();
    if (a === '' || vus.has(a.toLowerCase()) || !estAdresseServable(a)) return; // 1re (plus haute priorité) gagne
    vus.set(a.toLowerCase(), { adresse: a, provenance });
  };
  for (const r of s.repondants) ajouter(r, 'repondant');   // priorité haute : ceux qui nous ont réellement écrit
  ajouter(s.destEmail, 'ecrit');
  for (const c of s.ajouts) ajouter(c, 'ajout');
  for (const c of s.contactsConfirmes) ajouter(c, 'confirme');
  for (const c of s.prada) ajouter(c, 'prada');
  const options = [...vus.values()];
  // DÉFAUT (règle A) EN TÊTE : c'est la présélection. Présent dans les sources → on le remonte ; sinon (défensif) on l'ajoute.
  if (estAdresseServable(defaut)) {
    const k = (defaut as string).toLowerCase();
    const idx = options.findIndex((o) => o.adresse.toLowerCase() === k);
    if (idx > 0) options.unshift(options.splice(idx, 1)[0]);
    else if (idx === -1) options.unshift({ adresse: (defaut as string).trim(), provenance: 'repondant' });
  }
  return options;
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
  const [dest, contactsConfirmes, prada, repondants, ajouts] = await Promise.all([
    un(`SELECT dest_email AS a FROM demande WHERE id = $1`, [demandeId]),
    un(`SELECT email AS a FROM mairie_contact WHERE code_insee = $1 AND canal = 'email' AND statut = 'confirme' AND coalesce(btrim(email), '') <> ''`, [codeInsee]),
    un(`SELECT courriel AS a FROM mairie_prada WHERE code_insee = $1 AND coalesce(btrim(courriel), '') <> ''`, [codeInsee]),
    // Répondants réels connus de la COMMUNE (toutes ses demandes), pas seulement de la demande courante — « toutes les adresses connues de la commune ».
    un(`SELECT DISTINCT r.de_adresse AS a FROM demande_reponse r JOIN demande d ON d.id = r.demande_id
         WHERE d.code_insee = $1 AND r.nature <> 'rebond' AND coalesce(btrim(r.de_adresse), '') <> ''`, [codeInsee]),
    // LOT 29 : adresses CONFIRMÉES ajoutées à la main (mairie_contact_email). Résilient : table absente (186 non appliquée) → [] → règle B inchangée.
    un(`SELECT email AS a FROM mairie_contact_email WHERE code_insee = $1 AND statut = 'confirme' AND coalesce(btrim(email), '') <> ''`, [codeInsee]),
  ]);
  return { destEmail: dest[0] ?? null, contactsConfirmes, prada, repondants, ajouts };
}

/**
 * LOT 32 — NORMALISE une liste de destinataires CHOISIS À LA MAIN pour un envoi manuel MULTIPLE. PUR. Dédoublonne insensible à la
 * casse (ordre préservé, 1re occurrence gardée), écarte les vides, et REFUSE (jamais un envoi silencieux) si une adresse n'est pas
 * servable ou si, au final, la liste est vide (« au moins un destinataire »). Réutilise `estAdresseServable` (source d'exclusion unique).
 */
export function normaliserDestinatairesManuels(choisis: readonly string[]): { to: string[]; refus: string | null } {
  const vus = new Set<string>();
  const to: string[] = [];
  for (const brut of choisis) {
    const a = (brut ?? '').trim();
    if (a === '') continue;
    if (!estAdresseServable(a)) return { to: [], refus: 'adresse de destinataire invalide' };
    if (vus.has(a.toLowerCase())) continue;                 // dédoublonnage insensible à la casse
    vus.add(a.toLowerCase()); to.push(a);
  }
  if (to.length === 0) return { to: [], refus: 'au moins un destinataire est requis' };
  return { to, refus: null };
}

/**
 * LOT 29 — OPTIONS + DÉFAUT du sélecteur de destinataire pour UNE demande (LECTURE SEULE). Options = jeu règle B ORDONNÉ avec
 * provenance ; défaut = règle A (dernier répondant, repli chaîne). Réutilise `lireDestinataireParDefaut` — aucune règle réécrite.
 */
export async function lireOptionsDestinataire(demandeId: number, codeInsee: string): Promise<{ options: OptionDestinataire[]; defaut: string | null }> {
  const [sources, defaut] = await Promise.all([
    lireSourcesAdressesCommune(demandeId, codeInsee),
    lireDestinataireParDefaut(demandeId, codeInsee),
  ]);
  return { options: composerOptionsDestinataire(sources, defaut), defaut };
}

/**
 * LOT 29 — ENREGISTRE une adresse ajoutée à la main dans le carnet de la commune (mairie_contact_email, statut 'confirme'), SI elle
 * n'est pas DÉJÀ connue (répondant, dest_email, contact confirmé, prada, ajout). Insensible à la casse, dédoublonné en base par
 * l'index UNIQUE (ON CONFLICT DO NOTHING). Résilient : table absente / adresse non servable → NO-OP propre. LECTURE PUIS écriture.
 */
export async function enregistrerAdresseAjoutee(demandeId: number, codeInsee: string, email: string, ajoutePar: string | null): Promise<void> {
  const a = (email ?? '').trim();
  if (!estAdresseServable(a)) return;                                   // format validé aussi côté client ; défense serveur
  const connues = await composerDestinatairesDemande(demandeId, codeInsee);
  if (connues.some((x) => x.toLowerCase() === a.toLowerCase())) return; // déjà dans le jeu connu → rien à ajouter (pas de doublon)
  try {
    await query(
      `INSERT INTO mairie_contact_email (code_insee, email, source, statut, ajoute_par) VALUES ($1, $2, 'saisie_manuelle', 'confirme', $3)
         ON CONFLICT (code_insee, lower(email)) DO NOTHING`, [codeInsee, a, ajoutePar]);
  } catch { /* table absente (186 non appliquée) ou erreur d'écriture : l'adresse sert quand même à cet envoi (non bloquant) */ }
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

