/**
 * Registre des e-mails de mairies (chantier S5) — logique PURE (validation, choix d'adresse, règle de non-écrasement,
 * extraction annuaire) et écriture journalisée. AUCUN envoi d'e-mail : ce module constitue le registre. La source des
 * adresses est l'annuaire de l'administration (DILA / service-public.fr), Licence Ouverte. Le CLI
 * `mairie-contact-import.ts` fait le réseau ; ici, pas d'I/O réseau.
 */

/**
 * Provenance du DESTINATAIRE d'une commune. ⚠️ 'annuaire_dila' est une VALEUR DE GARDE (RÉSERVÉE), PAS vestigiale : ne la
 * retirez pas au « nettoyage ». La projection de contexte DILA (S29) ne l'emploie PAS — elle ne pose qu'un standard
 * téléphonique et laisse `source='annuaire'` (la DILA n'est pas le destinataire, et basculer figerait les lignes hors de
 * `doitRemplacerDepuisAnnuaire`). 'annuaire_dila' est conservée pour le SEUL cas futur où la DILA fournirait le DESTINATAIRE
 * d'une commune qui n'a rien (ni contact ni PRADA) — 0 cas aujourd'hui. La contrainte CHECK de la migration 068 l'autorise.
 */
export type SourceContact = 'annuaire' | 'saisie_manuelle' | 'reponse_mairie' | 'annuaire_dila';
export type StatutContact = 'presume' | 'confirme' | 'invalide';
export type CanalContact = 'email' | 'formulaire' | 'courrier' | 'inconnu';

export interface ContactExistant {
  email: string | null;
  source: SourceContact;
  statut: StatutContact;
  canal: CanalContact;
  urlFormulaire: string | null;
  adressePostale: string | null;
  telephone?: string | null;       // S18 : protocole
  responsableNom?: string | null;  // S18
  telephoneStandard?: string | null; // S19 : standard de la mairie
  emailType?: string | null;         // S19 : nature de l'adresse (urbanisme|accueil|prada|inconnu)
  note?: string | null;              // S24 : lue pour préserver la note lorsqu'un appelant l'omet
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

/**
 * S23 — Coordonnées de contact réellement PERSISTÉES à partir des saisies de la modale. INVARIANT : le canal décide ce
 * qu'on UTILISE pour adresser une demande (cf. `resoudreDestination`), JAMAIS ce qu'on EFFACE. Les trois coordonnées sont
 * conservées telles quelles, INDÉPENDAMMENT du canal ; une coordonnée ne devient `null` que si elle est vide — c'est-à-dire
 * si l'humain l'a laissée ou vidée explicitement. (Auparavant la route mettait à `null` toute coordonnée hors canal → elle
 * détruisait des données, ex. l'adresse BASU de Paris à chaque passage en canal ≠ 'courrier'.)
 */
export function champsCoordonnees(c: { email: string; urlFormulaire: string; adressePostale: string }): { email: string | null; urlFormulaire: string | null; adressePostale: string | null } {
  const nn = (s: string): string | null => (s.trim() !== '' ? s.trim() : null);
  return { email: nn(c.email), urlFormulaire: nn(c.urlFormulaire), adressePostale: nn(c.adressePostale) };
}

// ── Écriture journalisée (q-injecté) ─────────────────────────────────────────
export type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;

/** Lit le contact courant d'une commune (pour la règle d'import et l'email_avant du journal). `null` si aucun. */
export async function lireContact(q: Requete, codeInsee: string): Promise<ContactExistant | null> {
  const r = await q<{ email: string | null; source: SourceContact; statut: StatutContact; canal: CanalContact; url_formulaire: string | null; adresse_postale: string | null; telephone?: string | null; responsable_nom?: string | null; telephone_standard?: string | null; email_type?: string | null; note?: string | null }>(
    `SELECT email, source, statut, canal, url_formulaire, adresse_postale, telephone, responsable_nom, telephone_standard, email_type, note FROM mairie_contact WHERE code_insee = $1`, [codeInsee],
  );
  const x = r.rows[0];
  return x ? { email: x.email, source: x.source, statut: x.statut, canal: x.canal, urlFormulaire: x.url_formulaire, adressePostale: x.adresse_postale, telephone: x.telephone ?? null, responsableNom: x.responsable_nom ?? null, telephoneStandard: x.telephone_standard ?? null, emailType: x.email_type ?? null, note: x.note ?? null } : null;
}

export interface EcritureContact {
  codeInsee: string;
  email: string | null;
  source: SourceContact;
  statut: StatutContact;
  canal: CanalContact;
  urlFormulaire?: string | null;
  adressePostale?: string | null;
  telephone?: string | null;       // S18 : protocole
  responsableNom?: string | null;  // S18
  telephoneStandard?: string | null; // S19
  emailType?: string | null;         // S19 : urbanisme|accueil|prada|inconnu|null
  motif: string;
  auteur: string | null;
  note?: string | null;
  /**
   * S29 — Faut-il (re)dater `protocole_verifie_le = CURRENT_DATE` à cette écriture ? DÉFAUT `true` (édition manuelle : écrire
   * un contact vaut vérification). Mettre `false` pour une écriture de CONTEXTE qui NE vérifie PAS le protocole du service
   * urbanisme — ex. poser un standard téléphonique DILA. Même règle que le groupe C de S20 : on ne date pas une vérification
   * sans source consultable. Quand `false` : ligne existante → date CONSERVÉE ; création → date NULL.
   */
  toucheProtocole?: boolean;
}

/**
 * Applique un contact EN JOURNALISANT. Écrit UNIQUEMENT s'il y a un vrai changement (email, source ou statut différents,
 * ou 1re création) → idempotent (rejouer à l'identique ne fait RIEN). Quand il écrit : une ligne de journal
 * (email_avant→email_apres) PUIS l'upsert du registre — jamais l'un sans l'autre. À exécuter dans une TRANSACTION
 * (l'appelant fournit un `q` transactionnel). Retourne `{ change }`.
 *
 * S24 — INVARIANT ANTI-EFFACEMENT PAR OMISSION : l'UPSERT écrase chaque colonne par `EXCLUDED.*`. Pour qu'aucun appelant
 * (présent ou futur) ne puisse détruire une colonne en ne la mentionnant PAS, chaque champ optionnel ABSENT (`undefined`)
 * CONSERVE la valeur existante ; seule une valeur EXPLICITEMENT `null` l'efface. « Absent » ≠ « vidé » : l'effacement reste
 * possible, mais devient un acte délibéré. (email/source/statut/canal restent obligatoires → toujours fournis.)
 */
export async function ecrireContact(q: Requete, e: EcritureContact): Promise<{ change: boolean }> {
  const avant = await lireContact(q, e.codeInsee);
  // Résout un champ optionnel : `undefined` (absent) → garde l'existant ; sinon (string ou null) → valeur fournie.
  const garder = <T>(fourni: T | null | undefined, existant: T | null | undefined): T | null =>
    (fourni === undefined ? (existant ?? null) : fourni);
  const url = garder(e.urlFormulaire, avant?.urlFormulaire);
  const adr = garder(e.adressePostale, avant?.adressePostale);
  const tel = garder(e.telephone, avant?.telephone);
  const resp = garder(e.responsableNom, avant?.responsableNom);
  const telStd = garder(e.telephoneStandard, avant?.telephoneStandard);
  const emailType = garder(e.emailType, avant?.emailType);
  const note = garder(e.note, avant?.note);
  const inchange = avant !== null && avant.email === e.email && avant.source === e.source && avant.statut === e.statut
    && avant.canal === e.canal && avant.urlFormulaire === url && avant.adressePostale === adr
    && (avant.telephone ?? null) === tel && (avant.responsableNom ?? null) === resp        // S18
    && (avant.telephoneStandard ?? null) === telStd && (avant.emailType ?? null) === emailType // S19
    && (avant.note ?? null) === note; // S24 : un changement de note seule doit aussi écrire
  if (inchange) return { change: false };

  await q(
    `INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.codeInsee, avant?.email ?? null, e.email, e.source, e.motif, e.auteur],
  );
  // S18/S29 : protocole_verifie_le = CURRENT_DATE quand l'écriture VAUT vérification (édition manuelle, défaut). Une écriture
  // de contexte (`toucheProtocole:false`, ex. standard DILA) NE date PAS : ligne existante → date conservée
  // (`mairie_contact.protocole_verifie_le`), création → NULL. `protocole_source` n'est jamais touchée ici (elle vient du seed).
  const touche = e.toucheProtocole !== false;
  await q(
    `INSERT INTO mairie_contact (code_insee, email, source, statut, canal, url_formulaire, adresse_postale, maj_le, note, telephone, responsable_nom, protocole_verifie_le, telephone_standard, email_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10, CASE WHEN $13 THEN CURRENT_DATE ELSE NULL END, $11, $12)
     ON CONFLICT (code_insee) DO UPDATE SET
       email = EXCLUDED.email, source = EXCLUDED.source, statut = EXCLUDED.statut, canal = EXCLUDED.canal,
       url_formulaire = EXCLUDED.url_formulaire, adresse_postale = EXCLUDED.adresse_postale, maj_le = now(), note = EXCLUDED.note,
       telephone = EXCLUDED.telephone, responsable_nom = EXCLUDED.responsable_nom,
       protocole_verifie_le = CASE WHEN $13 THEN CURRENT_DATE ELSE mairie_contact.protocole_verifie_le END,
       telephone_standard = EXCLUDED.telephone_standard, email_type = EXCLUDED.email_type`,
    [e.codeInsee, e.email, e.source, e.statut, e.canal, url, adr, note, tel, resp, telStd, emailType, touche],
  );
  return { change: true };
}
