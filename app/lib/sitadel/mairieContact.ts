/**
 * Registre des e-mails de mairies (chantier S5) — logique PURE (validation, choix d'adresse, règle de non-écrasement,
 * extraction annuaire) et écriture journalisée. AUCUN envoi d'e-mail : ce module constitue le registre. La source des
 * adresses est l'annuaire de l'administration (DILA / service-public.fr), Licence Ouverte. Le CLI
 * `mairie-contact-import.ts` fait le réseau ; ici, pas d'I/O réseau.
 */

export type SourceContact = 'annuaire' | 'saisie_manuelle' | 'reponse_mairie';
export type StatutContact = 'presume' | 'confirme' | 'invalide';
export type CanalContact = 'email' | 'formulaire' | 'courrier' | 'inconnu';

export interface ContactExistant {
  email: string | null;
  source: SourceContact;
  statut: StatutContact;
  canal: CanalContact;
  urlFormulaire: string | null;
  adressePostale: string | null;
}

// ── Validation & choix d'adresse (pur) ───────────────────────────────────────
/** Validation d'e-mail volontairement stricte-mais-simple (une seule adresse, pas de liste). */
export function emailValide(email: string): boolean {
  const e = email.trim();
  if (e === '' || e.length > 254 || /\s/.test(e)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(e);
}

/** Préfixes d'adresses de SERVICE (génériques) préférés aux adresses nominatives d'agent (moins de données perso, survit aux départs). */
const PREFIXES_SERVICE = ['urbanisme', 'contact', 'mairie', 'accueil', 'secretariat', 'courrier'];

/**
 * Choisit UNE adresse dans le champ annuaire (`adresse_courriel` peut être une liste `;`/`,`). Préfère une adresse de
 * service générique (urbanisme@, contact@, mairie@…), sinon la première valide. `null` si rien d'exploitable.
 */
export function choisirEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidats = raw.split(/[;,]/).map((s) => s.trim()).filter((s) => s !== '' && emailValide(s));
  if (candidats.length === 0) return null;
  const generique = candidats.find((e) => PREFIXES_SERVICE.some((p) => e.toLowerCase().startsWith(`${p}@`)));
  return generique ?? candidats[0];
}

/** Type de service de l'annuaire (`pivot` = tableau JSON ou chaîne JSON). */
interface EnregistrementAnnuaire { pivot?: unknown; adresse_courriel?: string | null }

function typesPivot(pivot: unknown): string[] {
  let p = pivot;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return []; } }
  if (!Array.isArray(p)) return [];
  return p.map((x) => (x && typeof x === 'object' ? String((x as { type_service_local?: unknown }).type_service_local ?? '') : '')).filter(Boolean);
}

/** Extrait l'e-mail de la MAIRIE parmi les enregistrements annuaire d'une commune (le seul contact municipal disponible). */
export function extraireEmailMairie(enregistrements: EnregistrementAnnuaire[]): string | null {
  const mairies = enregistrements.filter((r) => typesPivot(r.pivot).includes('mairie'));
  for (const m of mairies) {
    const e = choisirEmail(m.adresse_courriel);
    if (e) return e;
  }
  return null;
}

// ── Règle de non-écrasement à l'import (pur) ─────────────────────────────────
/**
 * L'import depuis l'annuaire ne remplace JAMAIS une adresse confirmée ou saisie/répondue manuellement. Il ne renseigne
 * que les communes SANS contact (null) ou celles ENCORE en source='annuaire'.
 */
export function doitRemplacerDepuisAnnuaire(existant: ContactExistant | null): boolean {
  if (existant === null) return true;
  return existant.source === 'annuaire' && existant.statut !== 'confirme';
}

// ── Cohérence canal ↔ champ obligatoire (miroir applicatif du CHECK SQL) ─────
/**
 * Valide qu'un canal porte son champ obligatoire : 'email' → e-mail valide ; 'formulaire' → URL http(s) ;
 * 'courrier' → adresse postale non vide ; 'inconnu' → aucun champ requis. Renvoie `null` si valide, sinon le motif.
 */
export function validerCanal(
  canal: CanalContact,
  champs: { email?: string | null; urlFormulaire?: string | null; adressePostale?: string | null },
): string | null {
  const nv = (s: string | null | undefined): string => (s ?? '').trim();
  if (canal === 'email') return emailValide(nv(champs.email)) ? null : 'e-mail invalide';
  if (canal === 'formulaire') return /^https?:\/\/\S+$/.test(nv(champs.urlFormulaire)) ? null : 'URL de formulaire invalide';
  if (canal === 'courrier') return nv(champs.adressePostale) !== '' ? null : 'adresse postale requise';
  return null; // 'inconnu' : aucun champ requis
}

// ── Écriture journalisée (q-injecté) ─────────────────────────────────────────
export type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;

/** Lit le contact courant d'une commune (pour la règle d'import et l'email_avant du journal). `null` si aucun. */
export async function lireContact(q: Requete, codeInsee: string): Promise<ContactExistant | null> {
  const r = await q<{ email: string | null; source: SourceContact; statut: StatutContact; canal: CanalContact; url_formulaire: string | null; adresse_postale: string | null }>(
    `SELECT email, source, statut, canal, url_formulaire, adresse_postale FROM mairie_contact WHERE code_insee = $1`, [codeInsee],
  );
  const x = r.rows[0];
  return x ? { email: x.email, source: x.source, statut: x.statut, canal: x.canal, urlFormulaire: x.url_formulaire, adressePostale: x.adresse_postale } : null;
}

export interface EcritureContact {
  codeInsee: string;
  email: string | null;
  source: SourceContact;
  statut: StatutContact;
  canal: CanalContact;
  urlFormulaire?: string | null;
  adressePostale?: string | null;
  motif: string;
  auteur: string | null;
  note?: string | null;
}

/**
 * Applique un contact EN JOURNALISANT. Écrit UNIQUEMENT s'il y a un vrai changement (email, source ou statut différents,
 * ou 1re création) → idempotent (rejouer à l'identique ne fait RIEN). Quand il écrit : une ligne de journal
 * (email_avant→email_apres) PUIS l'upsert du registre — jamais l'un sans l'autre. À exécuter dans une TRANSACTION
 * (l'appelant fournit un `q` transactionnel). Retourne `{ change }`.
 */
export async function ecrireContact(q: Requete, e: EcritureContact): Promise<{ change: boolean }> {
  const url = e.urlFormulaire ?? null;
  const adr = e.adressePostale ?? null;
  const avant = await lireContact(q, e.codeInsee);
  const inchange = avant !== null && avant.email === e.email && avant.source === e.source && avant.statut === e.statut
    && avant.canal === e.canal && avant.urlFormulaire === url && avant.adressePostale === adr;
  if (inchange) return { change: false };

  await q(
    `INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.codeInsee, avant?.email ?? null, e.email, e.source, e.motif, e.auteur],
  );
  await q(
    `INSERT INTO mairie_contact (code_insee, email, source, statut, canal, url_formulaire, adresse_postale, maj_le, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
     ON CONFLICT (code_insee) DO UPDATE SET
       email = EXCLUDED.email, source = EXCLUDED.source, statut = EXCLUDED.statut, canal = EXCLUDED.canal,
       url_formulaire = EXCLUDED.url_formulaire, adresse_postale = EXCLUDED.adresse_postale, maj_le = now(), note = EXCLUDED.note`,
    [e.codeInsee, e.email, e.source, e.statut, e.canal, url, adr, e.note ?? null],
  );
  return { change: true };
}
