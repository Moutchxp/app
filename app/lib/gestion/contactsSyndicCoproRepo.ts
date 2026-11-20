import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import type { GestionnaireSyndic } from './copropriete';
import { journaliserContactsSyndic } from './journalSyndicCopro';
import { cleImmeuble } from './syndics';
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
