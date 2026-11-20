import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import type { GestionnaireSyndic } from './copropriete';
import { journaliserContactsSyndic } from './journalSyndicCopro';
import { chiffresTelephone, cleEmail, cleImmeuble, cleNom, cleTelephone, civiliteLue, contactNomme, emailPlausible, telephoneComplet } from './syndics';
import { normaliserTexte } from './annuaire';

/**
 * ══ 🔴🔴 LES CONTACTS DU SYNDIC RATTACHÉS À UNE COPROPRIÉTÉ (Arno, 20/11/2026) ════════════════════════════════════════════════════════════════════════
 * « Un syndic peut être énorme et avoir beaucoup de personnel, mais en général il n'y a que 2, 3 ou 4 de ses contacts affectés à une copropriété. »
 *
 * L'ANNUAIRE DU SYNDIC (racine) : `gestion_syndic_contact` (+ `gestion_syndic_coordonnee`), géré sur la fiche syndic. LE RATTACHEMENT d'un contact à
 * une copropriété : `gestion_syndic_contact_copropriete` (326) — une ligne par affectation, FERMÉE (`retire_le`, motif) et jamais effacée. Rien de
 * nouveau en base : ces gestes réutilisent ces tables.
 *   · la RECHERCHE : l'annuaire COMPLET du syndic EN COURS de la copropriété (contacts ni retirés ni partis) — nom, prénom, fonction, téléphone, e-mail ;
 *   · RATTACHER : une affectation ouverte par contact (déjà rattaché : rien) ;
 *   · DÉTACHER : l'affectation FERMÉE (« détaché de la copropriété ») — le contact reste dans l'annuaire du syndic, intact.
 * Chaque geste écrit au journal de la copropriété (`journaliserContactsSyndic`), dans sa transaction. AUCUN MAIL. Les coordonnées restent internes.
 */
const ECRAN = 'la fiche copropriété';
const MAX = 40;

export interface ContactDuSyndic extends GestionnaireSyndic { rattache: boolean }
export type IssueContactsSyndic = { etat: 'ok'; gestionnaires: GestionnaireSyndic[] } | { etat: 'refus'; motif: string };

/** La copropriété (par sa clé) et son syndic EN COURS. */
export async function coproEtSyndic(q: RequeteTx | typeof query, immeuble: string, verrou = false):
Promise<{ coproId: number; syndicId: number; syndicNom: string } | null> {
  const { rows } = await (q as typeof query)<{ copro: string; syndic: string; nom: string }>(
    `SELECT c.id::text AS copro, s.id::text AS syndic, s.nom FROM gestion_copropriete c
       JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
       JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
      WHERE c.cle_immeuble = $1 ORDER BY cs.debut DESC LIMIT 1${verrou ? ' FOR UPDATE OF cs' : ''}`, [cleImmeuble(immeuble)]);
  return rows[0] === undefined ? null : { coproId: Number(rows[0].copro), syndicId: Number(rows[0].syndic), syndicNom: rows[0].nom };
}

const SQL_CONTACT = `SELECT ct.id::text, ct.civilite, ct.prenom, ct.nom, ct.titre,
        (SELECT json_agg(json_build_object('sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
           FROM gestion_syndic_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees`;
type Ligne = { id: string; civilite: string | null; prenom: string | null; nom: string | null; titre: string | null;
  coordonnees: GestionnaireSyndic['coordonnees'] | null };
const versContact = (x: Ligne): GestionnaireSyndic => ({ id: Number(x.id), civilite: x.civilite, prenom: x.prenom, nom: x.nom, titre: x.titre, coordonnees: x.coordonnees ?? [] });

/** Les contacts du syndic rattachés à la copropriété (la liste de la section) — la même règle que la fiche (`coproprieteRepo`). */
export async function gestionnairesDe(q: RequeteTx | typeof query, syndicId: number, coproId: number): Promise<GestionnaireSyndic[]> {
  const { rows } = await (q as typeof query)<Ligne>(
    `${SQL_CONTACT} FROM gestion_syndic_contact ct
      WHERE ct.syndic_id = $1 AND ct.retire_le IS NULL AND ct.parti_le IS NULL
        AND (ct.tous_immeubles IS TRUE OR EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a WHERE a.contact_id = ct.id AND a.copropriete_id = $2 AND a.retire_le IS NULL))
      ORDER BY ct.rang, ct.id`, [syndicId, coproId]);
  return rows.map(versContact);
}

/** Le texte de recherche d'un contact (nom, prénom, fonction, téléphones en chiffres, e-mails). PUR. */
export function texteRechercheContact(c: GestionnaireSyndic): string {
  const k = c.coordonnees.map((x) => (x.sorte === 'telephone' ? x.valeur.replace(/\D/g, '').replace(/^33/, '0') : x.valeur)).join(' ');
  return normaliserTexte(`${c.civilite ?? ''} ${c.prenom ?? ''} ${c.nom ?? ''} ${c.titre ?? ''} ${k}`);
}

/** Le contact répond-il à la recherche (tous les mots ; les chiffres d'un numéro tapé avec espaces) ? PUR. */
export function contactRepond(c: GestionnaireSyndic, terme: string): boolean {
  const t = normaliserTexte(terme);
  if (t === '') return true;
  const texte = texteRechercheContact(c);
  const chiffres = terme.replace(/\D/g, '').replace(/^33/, '0');
  if (chiffres.length >= 4 && texte.replace(/ /g, '').includes(chiffres)) return true;
  return t.split(' ').filter((m) => m !== '').every((m) => texte.includes(m));
}

/** LA RECHERCHE dans l'annuaire complet du syndic en cours de la copropriété. LECTURE SEULE. */
export async function rechercherContactsDuSyndic(immeuble: string, terme: string):
Promise<{ etat: 'ok'; syndic: { id: number; nom: string }; contacts: ContactDuSyndic[]; total: number } | { etat: 'sans_syndic' }> {
  const cs = await coproEtSyndic(query, immeuble);
  if (cs === null) return { etat: 'sans_syndic' };
  const { rows } = await query<Ligne & { rattache: boolean }>(
    `${SQL_CONTACT}, (ct.tous_immeubles IS TRUE OR EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a WHERE a.contact_id = ct.id AND a.copropriete_id = $2 AND a.retire_le IS NULL)) AS rattache
       FROM gestion_syndic_contact ct WHERE ct.syndic_id = $1 AND ct.retire_le IS NULL AND ct.parti_le IS NULL ORDER BY ct.nom NULLS LAST, ct.prenom, ct.id`,
    [cs.syndicId, cs.coproId]);
  const tous = rows.map((x) => ({ ...versContact(x), rattache: x.rattache === true }));
  const trouves = tous.filter((c) => contactRepond(c, terme));
  return { etat: 'ok', syndic: { id: cs.syndicId, nom: cs.syndicNom }, contacts: trouves.slice(0, MAX), total: trouves.length };
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isSafeInteger(x) && x > 0))].slice(0, 20) : []);

/** RATTACHER un ou plusieurs contacts du syndic en cours à la copropriété — tout ou rien, journalisé. */
export async function rattacherContactsSyndic(immeuble: string, brut: unknown, auteur: Auteur): Promise<IssueContactsSyndic> {
  const voulus = ids(brut);
  if (voulus.length === 0) return { etat: 'refus', motif: 'Choisissez au moins un contact du syndic.' };
  return withTransaction(async (q) => {
    const cs = await coproEtSyndic(q, immeuble, true);
    if (cs === null) return { etat: 'refus' as const, motif: 'Cette copropriété n’a pas de syndic : rattachez d’abord un syndic.' };
    const { rows: siens } = await q<{ id: string }>(
      'SELECT id::text FROM gestion_syndic_contact WHERE id = ANY($1::bigint[]) AND syndic_id = $2 AND retire_le IS NULL AND parti_le IS NULL FOR UPDATE',
      [voulus, cs.syndicId]);
    if (siens.length !== voulus.length) return { etat: 'refus' as const, motif: 'Un contact choisi n’est plus dans l’annuaire de ce syndic : relancez la recherche. Rien n’a été rattaché.' };
    const { rows: deja } = await q<{ contact_id: string }>(
      'SELECT contact_id::text FROM gestion_syndic_contact_copropriete WHERE contact_id = ANY($1::bigint[]) AND copropriete_id = $2 AND retire_le IS NULL',
      [voulus, cs.coproId]);
    const nouveaux = voulus.filter((id) => !deja.some((d) => Number(d.contact_id) === id));
    for (const id of nouveaux) {
      await q(`INSERT INTO gestion_syndic_contact_copropriete (contact_id, copropriete_id, affecte_par, affecte_par_libelle) VALUES ($1, $2, $3, $4)`,
        [id, cs.coproId, auteur.id, auteur.libelle]);
    }
    await journaliserContactsSyndic(q, { coproId: cs.coproId, syndicId: cs.syndicId, nature: 'rattache', contactIds: nouveaux, ecran: ECRAN }, auteur);
    return { etat: 'ok' as const, gestionnaires: await gestionnairesDe(q, cs.syndicId, cs.coproId) };
  });
}

/** DÉTACHER un contact de la copropriété : l'affectation FERMÉE, le contact jamais touché (il reste dans l'annuaire du syndic). Journalisé. */
export async function detacherContactSyndic(immeuble: string, contactId: unknown, auteur: Auteur): Promise<IssueContactsSyndic> {
  const id = typeof contactId === 'number' && Number.isSafeInteger(contactId) && contactId > 0 ? contactId : null;
  if (id === null) return { etat: 'refus', motif: 'Contact inconnu.' };
  return withTransaction(async (q) => {
    const cs = await coproEtSyndic(q, immeuble, true);
    if (cs === null) return { etat: 'refus' as const, motif: 'Cette copropriété n’a pas de syndic.' };
    const { rowCount } = await q(
      `UPDATE gestion_syndic_contact_copropriete a SET retire_le = now(), retire_par_libelle = $3, retire_motif = 'détaché de la copropriété'
         FROM gestion_syndic_contact c WHERE a.contact_id = c.id AND c.id = $1 AND c.syndic_id = $4 AND a.copropriete_id = $2 AND a.retire_le IS NULL`,
      [id, cs.coproId, auteur.libelle, cs.syndicId]);
    if ((rowCount ?? 0) === 0) return { etat: 'refus' as const, motif: 'Ce contact n’est plus rattaché à cette copropriété : rechargez la fiche.' };
    await journaliserContactsSyndic(q, { coproId: cs.coproId, syndicId: cs.syndicId, nature: 'detache', contactIds: [id], ecran: ECRAN }, auteur);
    return { etat: 'ok' as const, gestionnaires: await gestionnairesDe(q, cs.syndicId, cs.coproId) };
  });
}

// ══ 🔴 (Arno, 20/11/2026, point 2) CRÉER UN CONTACT DANS L'ANNUAIRE DU SYNDIC, DEPUIS LA FICHE COPROPRIÉTÉ ═══════════════════════════════════════════
// « Les contacts ajoutés via la modale de copropriété viennent enrichir l'annuaire à la racine du syndic (annuaire complet du syndic). » Le contact
// est créé dans `gestion_syndic_contact` (+ coordonnées) ET rattaché à la copropriété, dans UNE transaction (tout ou rien) ; il apparaît ensuite sur
// la fiche du syndic comme n'importe quel autre contact. Garde anti-doublon : le nom, le téléphone ou l'e-mail d'un contact déjà dans l'annuaire de
// ce syndic (on le rattache plutôt) ; un e-mail déjà porté par le contact d'un autre syndic (une adresse n'appartient qu'à un contact, 327).

export interface NouveauContactSyndic { civilite: 'M.' | 'Mme' | null; prenom: string; nom: string; titre: string; telephone: string; email: string }

const texte = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** La saisie reçue → le contact, ou le motif du refus. PUR. */
export function lireNouveauContact(brut: unknown): { ok: true; c: NouveauContactSyndic } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const civilite = civiliteLue(b.civilite);
  if (civilite === undefined) return { ok: false, motif: 'Civilité inconnue (M. ou Mme).' };
  const c: NouveauContactSyndic = { civilite: civilite ?? null, prenom: texte(b.prenom), nom: texte(b.nom), titre: texte(b.titre), telephone: texte(b.telephone, 40), email: texte(b.email) };
  if (!contactNomme(c)) return { ok: false, motif: 'Le contact doit avoir au moins un nom ou une fonction.' };
  if (c.email !== '' && !emailPlausible(c.email)) return { ok: false, motif: `E-mail illisible : « ${c.email} ».` };
  if (c.telephone !== '' && !telephoneComplet(c.telephone)) return { ok: false, motif: `Téléphone incomplet : « ${c.telephone} ».` };
  return { ok: true, c };
}

export interface ContactExistant { prenom: string | null; nom: string | null; titre: string | null; telephones: string[]; emails: string[] }

/** Le doublon dans l'annuaire du syndic (nom, téléphone ou e-mail), en clair ; `null` : aucun. PUR. */
export function doublonDansLAnnuaire(c: NouveauContactSyndic, existants: readonly ContactExistant[], syndic: string): string | null {
  const n = cleNom(c.prenom, c.nom);
  const tel = c.telephone === '' ? '' : cleTelephone(c.telephone);
  const mail = c.email === '' ? '' : cleEmail(c.email);
  for (const x of existants) {
    const qui = [x.prenom, (x.nom ?? '').toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ') || x.titre || 'un contact';
    const pourquoi = n !== '' && cleNom(x.prenom, x.nom) === n ? 'le même nom'
      : tel !== '' && x.telephones.some((t) => cleTelephone(t) === tel) ? 'le même téléphone'
      : mail !== '' && x.emails.some((e) => cleEmail(e) === mail) ? 'le même e-mail' : null;
    if (pourquoi !== null) return `${qui} est déjà dans l’annuaire de ${syndic} (${pourquoi}) : rattachez-le depuis la recherche. Rien n’a été créé.`;
  }
  return null;
}

/** CRÉER le contact dans l'annuaire du syndic en cours ET le rattacher à la copropriété — tout ou rien, journalisé. Aucun mail. */
export async function creerEtRattacherContactSyndic(immeuble: string, brut: unknown, auteur: Auteur): Promise<IssueContactsSyndic> {
  const lu = lireNouveauContact(brut);
  if (!lu.ok) return { etat: 'refus', motif: lu.motif };
  const c = lu.c;
  return withTransaction(async (q) => {
    const cs = await coproEtSyndic(q, immeuble, true);
    if (cs === null) return { etat: 'refus' as const, motif: 'Cette copropriété n’a pas de syndic : rattachez d’abord un syndic.' };
    // l'annuaire du syndic, verrouillé le temps du geste (deux créations simultanées du même contact : la seconde voit la première)
    await q('SELECT id FROM gestion_syndic WHERE id = $1 FOR UPDATE', [cs.syndicId]);
    const { rows: existants } = await q<ContactExistant>(
      `SELECT ct.prenom, ct.nom, ct.titre,
              coalesce(array(SELECT k.valeur FROM gestion_syndic_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL AND k.sorte = 'telephone'), '{}') AS telephones,
              coalesce(array(SELECT k.valeur FROM gestion_syndic_coordonnee k WHERE k.contact_id = ct.id AND k.retire_le IS NULL AND k.sorte = 'email'), '{}') AS emails
         FROM gestion_syndic_contact ct WHERE ct.syndic_id = $1 AND ct.retire_le IS NULL AND ct.parti_le IS NULL`, [cs.syndicId]);
    const doublon = doublonDansLAnnuaire(c, existants, cs.syndicNom);
    if (doublon !== null) return { etat: 'refus' as const, motif: doublon };
    if (c.email !== '') {
      const { rows: ailleurs } = await q<{ syndic: string }>(
        `SELECT s.nom AS syndic FROM gestion_syndic_coordonnee k JOIN gestion_syndic_contact ct ON ct.id = k.contact_id JOIN gestion_syndic s ON s.id = ct.syndic_id
          WHERE k.sorte = 'email' AND k.retire_le IS NULL AND ct.retire_le IS NULL AND ct.parti_le IS NULL AND lower(replace(k.valeur, ' ', '')) = $1 LIMIT 1`, [cleEmail(c.email)]);
      if (ailleurs[0] !== undefined) return { etat: 'refus' as const, motif: `L’e-mail ${c.email} appartient déjà à un contact du syndic ${ailleurs[0].syndic}. Rien n’a été créé.` };
    }
    const { rows: [r] } = await q<{ id: string }>(
      `INSERT INTO gestion_syndic_contact (syndic_id, civilite, prenom, nom, titre, rang, cree_par_libelle, tous_immeubles)
       VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(rang), -1) + 1 FROM gestion_syndic_contact WHERE syndic_id = $1), $6, false) RETURNING id::text`,
      [cs.syndicId, c.civilite, c.prenom || null, c.nom || null, c.titre || null, auteur.libelle]);
    const id = Number(r.id);
    let rang = 0;
    if (c.telephone !== '') { await q(`INSERT INTO gestion_syndic_coordonnee (contact_id, sorte, valeur, rang) VALUES ($1, 'telephone', $2, $3)`, [id, chiffresTelephone(c.telephone), rang]); rang += 1; }
    if (c.email !== '') await q(`INSERT INTO gestion_syndic_coordonnee (contact_id, sorte, valeur, rang) VALUES ($1, 'email', $2, $3)`, [id, c.email, rang]);
    await q(`INSERT INTO gestion_syndic_contact_copropriete (contact_id, copropriete_id, affecte_par, affecte_par_libelle) VALUES ($1, $2, $3, $4)`,
      [id, cs.coproId, auteur.id, auteur.libelle]);
    await journaliserContactsSyndic(q, { coproId: cs.coproId, syndicId: cs.syndicId, nature: 'cree', contactIds: [id], ecran: ECRAN }, auteur);
    return { etat: 'ok' as const, gestionnaires: await gestionnairesDe(q, cs.syndicId, cs.coproId) };
  });
}
