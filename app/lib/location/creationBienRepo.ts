import { query, withTransaction, type RequeteTx } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { normaliserTexte } from '../gestion/annuaire';
import { verifierCoordonnees, type CoordonneeSaisie } from '../gestion/annuaireEdition';
import { creerPersonne, type ChampsPersonne } from '../gestion/annuaireEditionRepo';
import type { Auteur } from '../gestion/gestes';
import { verifierBienComplet, verifierComplements, type ComplementsBien, type ComplementsFiche, type SaisieBien } from './bienComplet';
export type { ComplementsFiche } from './bienComplet';
import type { ChampsBien, Categorie } from './locationBien';
import { analyserTermePortefeuille, type ResultatPortefeuille } from './recherchePortefeuille';
import { sqlBienDuPortefeuille, sqlDansPortefeuille } from './portefeuilleRepo';
import type { Issue } from './locationRepo';
import { manquesClientLocation } from './cartesLocation';
import { MOTIF_PREMIERE_CARTE } from '../gestion/carteComplete';
import { familleAUneCarteComplete } from '../gestion/familleCarteRepo';
import { creerContactsDuBien, refusContacts, type ContactSaisi } from './contactsLocationRepo';
import { rattacherSyndicAuBien, refusNouveauxContacts, type SyndicDuBien } from './syndicLocationRepo';
import { rattacherContactsExistants, refusContactsExistants } from './rattachementProprietairesRepo';
import { agDisponible, enregistrerAg, immeubleAgDuLot, lireAg } from './immeubleAgRepo';
import { immeubleDeLAg, verifierDateAg } from './immeubleAg';
import { verifierEntretiens } from './entretien';
import { enregistrerEntretiens, entretienDisponible, lireEntretiens } from './entretienAnnexeRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — CRÉER UN PROPRIÉTAIRE (CARTES) PUIS SON BIEN (FORMULAIRE COMPLET). IMPUR (base). ══════════════
 *
 * Demande d'Arno (17/10/2026) :
 *   · « Créer un nouveau propriétaire » : les cartes de contact habituelles (création commune de l'annuaire, la même que la
 *     Gestion), autant qu'on veut — tous propriétaires du même futur bien — et le N° de mandat de gestion ;
 *   · « Ajouter un nouveau bien » : rattaché à un ou plusieurs propriétaires, formulaire complet (migration 374).
 * Les co-propriétaires vont où la Gestion les met : le premier dans `gestion_annuaire_lot.proprietaire_id`, les suivants
 * dans `gestion_annuaire_lot_proprietaire` (migration 278) — la Gestion les affiche donc sur la fiche du bien.
 * 🔴 Aucun DELETE ; jamais de fusion automatique ; chaque création est journalisée.
 */

export function bienCompletDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'type_logement');
}

/** La migration 378 (nom d'une annexe « Autre », assurance PNO et sa date anniversaire) est-elle là ? */
export function annexeNomPnoDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'pno_date_anniversaire');
}

/** La migration 376 (famille de bien, parking, accès, annexe à autre adresse) est-elle là ? */
export function familleDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'adresse_autre');
}

class Refus extends Error {}

async function journaliser(q: RequeteTx, entite: 'annuaire' | 'annuaire_lot', id: number, action: string, commentaire: string, auteur: Auteur): Promise<void> {
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
    [entite, id, action, commentaire, auteur.id, auteur.libelle]);
}

// ── ① LES PROPRIÉTAIRES (CARTES DE CONTACT) ─────────────────────────────────────────────────────────────────────────

export interface CartesProprietaires {
  /** Une carte = une fiche à créer (les champs du formulaire de carte de la Gestion). */
  cartes: (ChampsPersonne & { nom?: string | null })[];
  /** Des fiches EXISTANTES retenues par « Utiliser cette fiche » (jamais fusionnées, seulement rattachées au futur bien). */
  existants?: number[];
  numeroMandat?: string | null;
  /** « Propriétaire(s) en gestion ? » (Arno, 17/10/2026) : obligatoire ; Oui exige le N° de mandat, Non n'en garde aucun. */
  enGestion?: boolean | null;
  /** Arno, 18/10/2026 — Non ⇒ le N° de mandat de TRANSACTION LOCATIVE, exigé (même règle que le mandat de gestion). */
  numeroMandatTransaction?: string | null;
}

export function enGestionDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_proprietaire', 'en_gestion');
}

/**
 * Crée les fiches des cartes, par la création commune de l'annuaire (`creerPersonne`), et pose le N° de mandat de gestion
 * sur chacune. Tout est VÉRIFIÉ AVANT la première création (nom, coordonnées) : un refus ne laisse aucune fiche à moitié.
 */
export async function creerProprietaires(o: CartesProprietaires, auteur: Auteur): Promise<Issue<{ ids: number[] }>> {
  const cartes = Array.isArray(o.cartes) ? o.cartes : [];
  const existants = [...new Set((o.existants ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (cartes.length + existants.length === 0) return { etat: 'refus', motif: 'Ajoutez au moins un propriétaire.' };
  for (const [i, c] of cartes.entries()) {
    // Obligatoires ALLÉGÉS dans la Location : le nom ; la famille doit avoir une carte COMPLÈTE (vérifié juste après).
    const manque = Object.values(manquesClientLocation({ nom: c.nom, coordonnees: c.coordonnees }));
    if (manque.length > 0) return { etat: 'refus', motif: `Carte ${i + 1} : ${manque.join(' ')}` };
    const v = verifierCoordonnees((c.coordonnees ?? []).filter((x) => x.valeur.trim() !== '') as CoordonneeSaisie[]);
    if (!v.ok) return { etat: 'refus', motif: `Carte ${i + 1} : ${v.motif}` };
  }
  if (existants.length > 0) {
    const vivante = await sqlPersonneVivante('p');
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[]) AND ${vivante}${await sqlDansPortefeuille('p')}`, [existants]);
    if ((rows[0]?.n ?? 0) !== existants.length) return { etat: 'refus', motif: 'Une fiche retenue n’existe plus, est archivée ou est sortie du portefeuille.' };
  }
  // 🔴 Arno (18/10/2026) : la famille garde au moins UNE carte client complète — une carte saisie, ou une fiche retenue.
  if (!(await familleAUneCarteComplete('proprietaire', cartes, existants))) return { etat: 'refus', motif: MOTIF_PREMIERE_CARTE };
  if (typeof o.enGestion !== 'boolean') return { etat: 'refus', motif: 'Répondez à « Propriétaire(s) en gestion ? » (Oui ou Non).' };
  if (!(await enGestionDisponible())) return { etat: 'sans_schema' };
  // « Non » : aucun N° de mandat n'est gardé, même s'il avait été saisi avant de changer d'avis.
  const mandat = o.enGestion && typeof o.numeroMandat === 'string' && o.numeroMandat.trim() !== '' ? o.numeroMandat.trim().slice(0, 80) : null;
  if (o.enGestion && mandat === null) return { etat: 'refus', motif: 'Propriétaire en gestion : le N° de mandat de gestion est à renseigner.' };
  // Non ⇒ le mandat de transaction locative (migration 379), exigé ; Oui n'en garde aucun (changer d'avis vide l'autre).
  const avecTransaction = await colonneExisteMemo('gestion_annuaire_proprietaire', 'numero_mandat_transaction');
  const transaction = !o.enGestion && typeof o.numeroMandatTransaction === 'string' && o.numeroMandatTransaction.trim() !== ''
    ? o.numeroMandatTransaction.trim().slice(0, 80) : null;
  if (avecTransaction && !o.enGestion && transaction === null) {
    return { etat: 'refus', motif: 'Propriétaire non en gestion : le N° de mandat de transaction locative est à renseigner.' };
  }
  const ids: number[] = [];
  for (const [i, c] of cartes.entries()) {
    const cree = await creerPersonne('proprietaire', { ...c, nom: (c.nom ?? '').trim() }, auteur);
    if (cree.etat !== 'ok') {
      const motif = cree.etat === 'refus' ? cree.motif : 'l’annuaire n’est pas modifiable';
      return { etat: 'refus', motif: ids.length === 0 ? `Carte ${i + 1} : ${motif}` : `${ids.length} fiche(s) créée(s), mais la carte ${i + 1} a échoué : ${motif}` };
    }
    ids.push(cree.data.id);
  }
  if (ids.length > 0) {
    const enGestion = o.enGestion;
    await withTransaction(async (q) => {
      await q('UPDATE gestion_annuaire_proprietaire SET en_gestion = $2, numero_mandat_gestion = coalesce($3, numero_mandat_gestion) WHERE id = ANY($1::bigint[])',
        [ids, enGestion, mandat]);
      if (avecTransaction && transaction !== null) {
        await q('UPDATE gestion_annuaire_proprietaire SET numero_mandat_transaction = $2 WHERE id = ANY($1::bigint[])', [ids, transaction]);
      }
      for (const id of ids) {
        await journaliser(q, 'annuaire', id, 'location_en_gestion',
          `en gestion : ${enGestion ? 'oui' : 'non'}${mandat === null ? '' : `, N° de mandat de gestion « ${mandat} »`}`
          + `${transaction === null ? '' : `, N° de mandat de transaction locative « ${transaction} »`} — saisi à la création (tuile Location)`, auteur);
      }
    });
  }
  return { etat: 'ok', data: { ids: [...ids, ...existants] } };
}

// ── ② LE BIEN COMPLET ─────────────────────────────────────────────────────────────────────────────────────────────

async function insererLot(q: RequeteTx, proprietaires: { id: number; nom: string }[], c: ChampsBien, categorie: Categorie,
  complet: Record<string, unknown> | null, auteur: Auteur): Promise<number> {
  const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // 🔴 L'« IMMEUBLE » DU BIEN = son adresse (Arno, 17/10/2026, syndic) : c'est la clé par laquelle la Gestion relie un bien à
  //    la copropriété de son syndic (`cleImmeuble`), comme pour un bien importé de WIPPIMMO.
  const colonnes = ['wippimmo_id', 'proprietaire_id', 'proprietaire_texte', 'adresse', 'code_postal', 'commune', 'adresse_normalisee',
    'categorie', 'etage', 'porte', 'num_lot_copro', 'surface_carrez_m2', 'surface_exterieure_m2', 'immeuble'];
  const valeurs: unknown[] = [cle, proprietaires[0].id, proprietaires.map((p) => p.nom).join(' / '), c.adresse, c.codePostal, c.commune,
    normaliserTexte([c.adresse, c.commune].filter((x) => x !== null).join(' ')), categorie, c.etage, c.porte, c.numLotCopro,
    c.surfaceCarrezM2, c.surfaceExterieureM2, c.adresse];
  for (const [col, v] of Object.entries(complet ?? {})) { colonnes.push(col); valeurs.push(v); }
  const { rows } = await q<{ id: string }>(
    `INSERT INTO gestion_annuaire_lot (${colonnes.join(', ')}) VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id::text`, valeurs);
  const id = Number(rows[0].id);
  // Les co-propriétaires : comme « Ajouter un propriétaire » de la Gestion (lien en cours, rang croissant).
  for (const [rang, p] of proprietaires.slice(1).entries()) {
    await q(
      `INSERT INTO gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id, rang, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (lot_id, proprietaire_id) WHERE jusqu_a IS NULL DO NOTHING`,
      [id, p.id, rang + 1, auteur.id, auteur.libelle]);
  }
  return id;
}

/**
 * « Enregistrer le bien » : le logement complet, ses co-propriétaires et ses annexes (même adresse, liées pour toujours),
 * en UNE transaction. Refusé si un propriétaire n'existe plus, est archivé ou sorti du portefeuille, ou si le syndic n'est
 * pas un syndic connu de la Gestion.
 */
export async function creerBienComplet(s: SaisieBien & {
  contacts?: ContactSaisi[]; syndic?: SyndicDuBien | null;
  /** Arno, 18/10/2026 — les cartes « contact du propriétaire » EXISTANTES cochées dans « Qui rattacher à ce bien ? ». */
  contactsExistants?: number[];
}, auteur: Auteur):
  Promise<Issue<{ logementId: number; annexes: number[]; contacts: number; contactsRefus: string | null; syndicRefus: string | null; agRefus: string | null; entretienRefus: string | null }>> {
  if (!(await bienCompletDisponible()) || !(await familleDisponible())) return { etat: 'sans_schema' };
  const v = verifierBienComplet(s);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  // Les CONTACTS DU PROPRIÉTAIRE saisis à la création : vérifiés AVANT toute écriture, posés une fois le bien créé.
  const contacts = Array.isArray(s.contacts) ? s.contacts.slice(0, 20) : [];
  const refusC = refusContacts(contacts);
  if (refusC !== null) return { etat: 'refus', motif: refusC };
  // Le SYNDIC choisi (loupe, suggestion ou création dans la modale de la Gestion) : ses nouveaux contacts vérifiés d'abord.
  const syndic = s.syndic != null && Number.isInteger(Number(s.syndic.id)) && Number(s.syndic.id) > 0
    ? { id: Number(s.syndic.id), contactsIds: (s.syndic.contactsIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
      nouveauxContacts: Array.isArray(s.syndic.nouveauxContacts) ? s.syndic.nouveauxContacts.slice(0, 20) : [] }
    : null;
  const refusS = syndic === null ? null : refusNouveauxContacts(syndic.nouveauxContacts);
  if (refusS !== null) return { etat: 'refus', motif: refusS };
  const contactsExistants = Array.isArray(s.contactsExistants) ? s.contactsExistants.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 40) : [];
  const refusE = await refusContactsExistants(contactsExistants, v.proprietaireIds);
  if (refusE !== null) return { etat: 'refus', motif: refusE };
  // La DERNIÈRE AG (Arno, 18/10/2026) : vérifiée avant toute écriture, posée sur l'IMMEUBLE du bien (son adresse) une fois créé.
  const ag = verifierDateAg((s.logement ?? {}).derniereAg);
  if (!ag.ok) return { etat: 'refus', motif: ag.motif };
  // L'ENTRETIEN À PRÉVOIR (Arno, 18/10/2026) : vérifié avant toute écriture, enregistré une fois le bien créé.
  const entretien = verifierEntretiens((s.logement ?? {}).entretienAPrevoir, (s.logement ?? {}).entretiens);
  if (!entretien.ok) return { etat: 'refus', motif: entretien.motif };
  const l = v.logement;
  const avec378 = await annexeNomPnoDisponible();
  const avec379 = await entretienDisponible();
  const vivante = await sqlPersonneVivante('p');
  const portefeuille = await sqlDansPortefeuille('p');
  let cree: { logementId: number; annexes: number[] };
  try {
    cree = await withTransaction(async (q) => {
      const { rows } = await q<{ id: string; nom: string }>(
        `SELECT p.id::text, p.nom_complet AS nom FROM gestion_annuaire_proprietaire p
          WHERE p.id = ANY($1::bigint[]) AND ${vivante}${portefeuille} FOR UPDATE`, [v.proprietaireIds]);
      const proprietaires = v.proprietaireIds.map((id) => rows.find((r) => Number(r.id) === id)).filter((r) => r !== undefined)
        .map((r) => ({ id: Number(r.id), nom: r.nom }));
      if (proprietaires.length !== v.proprietaireIds.length) {
        throw new Refus('Un propriétaire choisi n’existe plus, est archivé ou est sorti du portefeuille : retirez-le ou réactivez-le.');
      }
      if (l.syndicId !== null) {
        const { rows: sy } = await q('SELECT 1 FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL', [l.syndicId]);
        if (sy.length === 0) throw new Refus('Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
      }
      // La FAMILLE est la catégorie du bien : logement, local ou parking (migration 376 : aucune colonne de plus).
      const logementId = await insererLot(q, proprietaires, l, v.famille, {
        batiment: l.batiment, escalier: l.escalier, type_logement: l.typeLogement, nombre_pieces: l.nombrePieces, meuble: l.meuble,
        surface_habitable_m2: l.surfaceHabitableM2, syndic_id: l.syndicId, epoque_construction: l.epoqueConstruction,
        chauffage: l.chauffage, dpe_classe: l.dpeClasse, dpe_date: l.dpeDate, commentaire: l.commentaire,
        type_local: l.typeLocal, parking_situation: l.parkingSituation, parking_type: l.parkingType, surface_m2: l.surfaceM2,
        ascenseur: l.ascenseur, digicode: l.digicode, digicode_code: l.digicodeCode, precision_acces: l.precisionAcces,
        ...(avec378 ? { assurance_pno: l.assurancePno ?? null, pno_date_anniversaire: l.assurancePno === true ? l.pnoDateAnniversaire ?? null : null } : {}),
      }, auteur);
      const annexes: number[] = [];
      for (const a of v.annexes) {
        // « Même adresse » (par défaut) : l'annexe hérite de l'adresse du logement / local. « Autre adresse » : la sienne.
        const adresse = a.autreAdresse ? { adresse: a.adresse, codePostal: a.codePostal, commune: a.commune }
          : { adresse: l.adresse, codePostal: l.codePostal, commune: l.commune };
        const id = await insererLot(q, proprietaires, { ...a, ...adresse }, a.categorie ?? 'cave', {
          adresse_autre: a.autreAdresse, parking_situation: a.parkingSituation, parking_type: a.parkingType,
          ...(avec378 ? { nom_annexe: a.nomAnnexe } : {}),
          ...(avec379 ? { annotation: a.annotation ?? null, ...(a.detachee === true ? { annexe_detachee_le: new Date().toISOString(), annexe_detachee_par_libelle: auteur.libelle } : {}) } : {}),
        }, auteur);
        await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, logementId, auteur.libelle]);
        annexes.push(id);
      }
      await journaliser(q, 'annuaire_lot', logementId, 'location_bien_cree',
        `bien créé dans la Location (formulaire complet) : ${v.famille} + ${annexes.length} annexe(s), propriétaire(s) ${proprietaires.map((p) => p.id).join(', ')}`, auteur);
      return { logementId, annexes };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
  // Le bien existe : les contacts se posent par la porte de la Gestion. Un échec ne défait pas le bien — il est DIT.
  const c = await creerContactsDuBien(cree.logementId, 'proprietaire', contacts, auteur);
  // Les contacts EXISTANTS cochés : rattachés sur CE bien (la carte d'origine n'est pas touchée).
  let existants: { ok: true; n: number } | { ok: false; motif: string } = { ok: true, n: 0 };
  if (contactsExistants.length > 0) {
    const { rows: cle } = await query<{ cle: string }>('SELECT wippimmo_id AS cle FROM gestion_annuaire_lot WHERE id = $1', [cree.logementId]);
    existants = await rattacherContactsExistants(cle[0].cle, contactsExistants, v.proprietaireIds, auteur);
  }
  let entretienRefus: string | null = null;
  if (entretien.aPrevoir !== null && v.famille !== 'parking') {
    const r = await enregistrerEntretiens(cree.logementId, entretien.aPrevoir, entretien.entretiens, auteur)
      .catch((e: unknown) => ({ ok: false as const, motif: e instanceof Error ? e.message : 'erreur' }));
    if (!r.ok) entretienRefus = `Le bien est créé, mais l’entretien à prévoir n’a pas été enregistré : ${r.motif}`;
  }
  let agRefus: string | null = null;
  const immeubleAg = v.famille === 'parking' ? null : immeubleDeLAg({ immeuble: v.logement.adresse, parking: false });
  if (ag.date !== null && immeubleAg !== null) {
    const r = await enregistrerAg(immeubleAg, ag.date, cree.logementId, auteur).catch((e: unknown) => ({ ok: false as const, motif: e instanceof Error ? e.message : 'erreur' }));
    if (!r.ok) agRefus = `Le bien est créé, mais la date de la dernière AG n’a pas été enregistrée : ${r.motif}`;
  }
  let syndicRefus: string | null = null;
  if (syndic !== null) {
    const l = v.logement;
    const r = await rattacherSyndicAuBien(cree.logementId, syndic,
      { libelle: l.adresse ?? '', codePostal: l.codePostal ?? '', commune: l.commune ?? '' }, auteur)
      .catch((e: unknown) => ({ ok: false as const, motif: e instanceof Error ? e.message : 'erreur' }));
    if (!r.ok) syndicRefus = `Le bien est créé, mais le syndic n’a pas pu être rattaché : ${r.motif}`;
  }
  const refus = [c.ok ? null : c.motif, existants.ok ? null : existants.motif].filter((x) => x !== null);
  return { etat: 'ok', data: {
    ...cree, contacts: (c.ok ? c.n : 0) + (existants.ok ? existants.n : 0),
    contactsRefus: refus.length === 0 ? null : `Le bien est créé, mais : ${refus.join(' ')}`, syndicRefus, agRefus, entretienRefus,
  } };
}

// ── ③ LA RECHERCHE DES PROPRIÉTAIRES (au-dessus du formulaire du bien) ───────────────────────────────────────────────

const LIMITE = 10;

/**
 * « Une ligne de recherche qui ne cherche QUE parmi les propriétaires : nom, prénom, téléphone, e-mail, et adresse postale
 * des biens en gestion de notre portefeuille (aucune autre adresse). » (Arno)
 * 🔴 Jamais l'adresse personnelle d'un propriétaire : une adresse ne trouve que les propriétaires des biens du portefeuille.
 */
export async function rechercherProprietaires(brut: string): Promise<ResultatPortefeuille[]> {
  const t = analyserTermePortefeuille(brut);
  if (t.vide) return [];
  const coordVivante = await conditionCoordonneeVivante('c');
  const vivante = await sqlPersonneVivante('p');
  const portefeuille = await sqlDansPortefeuille('p');
  const tests: string[] = [];
  if (t.mots.length > 0) tests.push(t.mots.map((_, i) => `p.nom_normalise LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND '));
  const coord: string[] = [];
  if (t.chiffres !== null) coord.push(`(c.sorte = 'telephone' AND regexp_replace(c.valeur, '\\D', '', 'g') LIKE '%' || $1 || '%')`);
  if (t.email !== null) coord.push(`(c.sorte = 'email' AND lower(c.valeur) LIKE '%' || $2 || '%')`);
  if (coord.length > 0) {
    tests.push(`EXISTS (SELECT 1 FROM gestion_annuaire_contact c WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id
      AND c.absent_le IS NULL${coordVivante} AND (${coord.join(' OR ')}))`);
  }
  // L'adresse : celle des SEULS biens du portefeuille (propriétaire principal ou co-propriétaire en cours), annexes exclues.
  if (t.mots.length > 0) {
    tests.push(`EXISTS (SELECT 1 FROM gestion_annuaire_lot lo
      WHERE (lo.proprietaire_id = p.id OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = p.id AND lp.jusqu_a IS NULL))
        AND ${await sqlBienDuPortefeuille('lo')}
        AND (NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id)${(await familleDisponible()) ? ' OR lo.adresse_autre IS TRUE' : ''})
        AND ${t.mots.map((_, i) => `coalesce(lo.adresse_normalisee, '') LIKE '%' || ($3::text[])[${i + 1}] || '%'`).join(' AND ')})`);
  }
  const NEUTRE = `(length($1::text) >= 0 AND length($2::text) >= 0 AND cardinality($3::text[]) >= 0)`;
  const { rows } = await query<{ id: string; nom: string; detail: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom,
            (SELECT nullif(concat_ws(', ', lo.adresse, lo.commune), '') FROM gestion_annuaire_lot lo
              WHERE lo.proprietaire_id = p.id AND ${await sqlBienDuPortefeuille('lo')} ORDER BY lo.id LIMIT 1) AS detail
       FROM gestion_annuaire_proprietaire p
      WHERE ${NEUTRE} AND ${vivante}${portefeuille} AND (${tests.map((x) => `(${x})`).join(' OR ')})
      ORDER BY p.nom_normalise, p.id LIMIT ${LIMITE}`, [t.chiffres ?? '', t.email ?? '', t.mots]);
  return rows.map((r) => ({ id: Number(r.id), titre: r.nom, detail: r.detail }));
}

/** Les propriétaires arrivés de « Créer un nouveau propriétaire » (`?proprietaires=1,2`), déjà rattachés au futur bien. */
export async function proprietairesParIds(ids: readonly number[]): Promise<ResultatPortefeuille[]> {
  const propres = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
  if (propres.length === 0) return [];
  const vivante = await sqlPersonneVivante('p');
  const { rows } = await query<{ id: string; nom: string; detail: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom,
            (SELECT nullif(concat_ws(', ', lo.adresse, lo.commune), '') FROM gestion_annuaire_lot lo
              WHERE lo.proprietaire_id = p.id AND ${await sqlBienDuPortefeuille('lo')} ORDER BY lo.id LIMIT 1) AS detail
       FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[]) AND ${vivante}${await sqlDansPortefeuille('p')}`, [propres]);
  return propres.map((id) => rows.find((r) => Number(r.id) === id)).filter((r) => r !== undefined)
    .map((r) => ({ id: Number(r.id), titre: r.nom, detail: r.detail }));
}

/** Les syndics connus de la Gestion (mêmes fiches, aucune copie), pour le choix du syndic du bien. */
export async function syndicsConnus(): Promise<{ id: number; nom: string; ville: string | null }[]> {
  const { rows } = await query<{ id: string; nom: string; ville: string | null }>(
    `SELECT id::text, nom, ville FROM gestion_syndic WHERE supprime_le IS NULL ORDER BY lower(nom), id`);
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom, ville: r.ville }));
}

// ── ④ LES CHAMPS COMPLÉMENTAIRES SUR LA FICHE DU BIEN (« complétable plus tard ») ─────────────────────────────────────


/** Les champs de la migration 374 d'un bien ; `null` sans la migration. */
export async function complementsDuBien(id: number): Promise<ComplementsFiche | null> {
  if (!(await bienCompletDisponible())) return null;
  const avec376 = await familleDisponible();
  const avec378 = await annexeNomPnoDisponible();
  const { rows } = await query<{
    batiment: string | null; escalier: string | null; type_logement: string | null; nombre_pieces: number | null; meuble: boolean | null;
    surface_habitable_m2: string | null; syndic_id: string | null; syndic_nom: string | null; epoque_construction: string | null;
    chauffage: string | null; dpe_classe: string | null; dpe_date: string | null; commentaire: string | null;
    type_local: string | null; parking_situation: string | null; parking_type: string | null; surface_m2: string | null;
    ascenseur: boolean | null; digicode: boolean | null; digicode_code: string | null; precision_acces: string | null;
    assurance_pno: boolean | null; pno_date_anniversaire: string | null;
  }>(
    `SELECT lo.batiment, lo.escalier, lo.type_logement, lo.nombre_pieces, lo.meuble, lo.surface_habitable_m2::text,
            lo.syndic_id::text, s.nom AS syndic_nom, lo.epoque_construction, lo.chauffage, lo.dpe_classe, lo.dpe_date::text, lo.commentaire,
            ${avec376 ? `lo.type_local, lo.parking_situation, lo.parking_type, lo.surface_m2::text, lo.ascenseur, lo.digicode, lo.digicode_code, lo.precision_acces`
    : `NULL::text AS type_local, NULL::text AS parking_situation, NULL::text AS parking_type, NULL::text AS surface_m2, NULL::boolean AS ascenseur,
       NULL::boolean AS digicode, NULL::text AS digicode_code, NULL::text AS precision_acces`},
            ${avec378 ? 'lo.assurance_pno, lo.pno_date_anniversaire::text' : 'NULL::boolean AS assurance_pno, NULL::text AS pno_date_anniversaire'}
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_syndic s ON s.id = lo.syndic_id WHERE lo.id = $1`, [id]);
  const r = rows[0];
  if (r === undefined) return null;
  const immeubleAg = (await agDisponible()) ? await immeubleAgDuLot(id) : null;
  const entretiens = await lireEntretiens(id);
  return {
    ...(entretiens === null ? {} : { entretienAPrevoir: entretiens.aPrevoir, entretiens: entretiens.entretiens }),
    derniereAg: immeubleAg === null ? null : await lireAg(immeubleAg.cle), agApplicable: immeubleAg !== null,
    batiment: r.batiment, escalier: r.escalier, typeLogement: r.type_logement as ComplementsBien['typeLogement'],
    nombrePieces: r.nombre_pieces, meuble: r.meuble, surfaceHabitableM2: r.surface_habitable_m2 === null ? null : Number(r.surface_habitable_m2),
    syndicId: r.syndic_id === null ? null : Number(r.syndic_id), syndicNom: r.syndic_nom, epoqueConstruction: r.epoque_construction,
    chauffage: r.chauffage, dpeClasse: r.dpe_classe, dpeDate: r.dpe_date, commentaire: r.commentaire,
    typeLocal: r.type_local as ComplementsBien['typeLocal'], parkingSituation: r.parking_situation as ComplementsBien['parkingSituation'],
    parkingType: r.parking_type as ComplementsBien['parkingType'], surfaceM2: r.surface_m2 === null ? null : Number(r.surface_m2),
    ascenseur: r.ascenseur, digicode: r.digicode, digicodeCode: r.digicode_code, precisionAcces: r.precision_acces,
    assurancePno: r.assurance_pno, pnoDateAnniversaire: r.pno_date_anniversaire,
  };
}

/** Modifie les champs complémentaires d'un bien (tous facultatifs), journalisé. */
export async function modifierComplementsBien(id: number, brut: Record<string, unknown>, auteur: Auteur): Promise<Issue> {
  if (!(await bienCompletDisponible())) return { etat: 'sans_schema' };
  const v = verifierComplements(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  // La dernière AG : envoyée seulement par la fiche qui la montre ; vérifiée avant toute écriture.
  const avecAg = Object.prototype.hasOwnProperty.call(brut, 'derniereAg');
  const ag = verifierDateAg(brut.derniereAg);
  if (avecAg && !ag.ok) return { etat: 'refus', motif: ag.motif };
  // L'entretien à prévoir : envoyé seulement par la fiche qui le montre ; vérifié avant toute écriture.
  const avecEntretien = Object.prototype.hasOwnProperty.call(brut, 'entretienAPrevoir');
  const entretien = verifierEntretiens(brut.entretienAPrevoir, brut.entretiens);
  if (avecEntretien && !entretien.ok) return { etat: 'refus', motif: entretien.motif };
  const c = v.valeurs;
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q('SELECT 1 FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [id]);
      if (rows.length === 0) return { etat: 'inconnu' as const };
      if (c.syndicId !== null) {
        const { rows: sy } = await q('SELECT 1 FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL', [c.syndicId]);
        if (sy.length === 0) throw new Refus('Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
      }
      await q(
        `UPDATE gestion_annuaire_lot SET batiment = $2, escalier = $3, type_logement = $4, nombre_pieces = $5, meuble = $6,
                surface_habitable_m2 = $7, syndic_id = $8, epoque_construction = $9, chauffage = $10, dpe_classe = $11,
                dpe_date = $12::date, commentaire = $13 WHERE id = $1`,
        [id, c.batiment, c.escalier, c.typeLogement, c.nombrePieces, c.meuble, c.surfaceHabitableM2, c.syndicId,
          c.epoqueConstruction, c.chauffage, c.dpeClasse, c.dpeDate, c.commentaire]);
      if (await familleDisponible()) {
        await q(
          `UPDATE gestion_annuaire_lot SET type_local = $2, parking_situation = $3, parking_type = $4, surface_m2 = $5, ascenseur = $6,
                  digicode = $7, digicode_code = $8, precision_acces = $9 WHERE id = $1`,
          [id, c.typeLocal, c.parkingSituation, c.parkingType, c.surfaceM2, c.ascenseur, c.digicode, c.digicodeCode, c.precisionAcces]);
      }
      // L'assurance PNO (migration 378) : envoyée par la fiche qui la montre ; Non (ou non renseigné) vide la date.
      if (Object.prototype.hasOwnProperty.call(brut, 'assurancePno') && (await annexeNomPnoDisponible())) {
        await q('UPDATE gestion_annuaire_lot SET assurance_pno = $2, pno_date_anniversaire = $3::date WHERE id = $1',
          [id, c.assurancePno ?? null, c.assurancePno === true ? c.pnoDateAnniversaire ?? null : null]);
      }
      await journaliser(q, 'annuaire_lot', id, 'location_bien_complements', 'informations complémentaires du bien modifiées dans la Location', auteur);
      return { etat: 'ok' as const, data: undefined };
    }).then(async (issue) => {
      // La dernière AG se pose sur l'IMMEUBLE (tous ses lots la voient) : après les compléments du bien, hors de leur transaction.
      if (issue.etat === 'ok' && avecEntretien && entretien.ok) {
        const e = await enregistrerEntretiens(id, entretien.aPrevoir, entretien.entretiens, auteur);
        if (!e.ok) return { etat: 'refus' as const, motif: `Informations enregistrées, mais pas l’entretien à prévoir : ${e.motif}` };
      }
      if (issue.etat !== 'ok' || !avecAg || !ag.ok) return issue;
      const immeuble = await immeubleAgDuLot(id);
      if (immeuble === null) return issue;
      const r = await enregistrerAg(immeuble, ag.date, id, auteur);
      return r.ok ? issue : { etat: 'refus' as const, motif: `Informations enregistrées, mais pas la date de la dernière AG : ${r.motif}` };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

// ── ⑤ « EN GESTION ? » SUR LA FICHE COMMUNE ────────────────────────────────────────────────────────────────────────

/** Corrige « en gestion : oui / non » d'un propriétaire, depuis la fiche commune ; journalisé. `null` = non renseigné. */
export async function enregistrerEnGestion(proprietaireId: number, valeur: unknown, auteur: Auteur): Promise<Issue> {
  if (!(await enGestionDisponible())) return { etat: 'sans_schema' };
  const v = valeur === true || valeur === false ? valeur : valeur === null ? null : undefined;
  if (v === undefined) return { etat: 'refus', motif: 'Réponse attendue : oui, non, ou non renseigné.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ avant: boolean | null }>('SELECT en_gestion AS avant FROM gestion_annuaire_proprietaire WHERE id = $1 FOR UPDATE', [proprietaireId]);
    if (rows[0] === undefined) return { etat: 'inconnu' as const };
    await q('UPDATE gestion_annuaire_proprietaire SET en_gestion = $2 WHERE id = $1', [proprietaireId, v]);
    const mot = (x: boolean | null): string => (x === null ? 'non renseigné' : x ? 'oui' : 'non');
    await journaliser(q, 'annuaire', proprietaireId, 'location_en_gestion', `en gestion : ${mot(rows[0].avant)} → ${mot(v)} (fiche commune)`, auteur);
    return { etat: 'ok' as const, data: undefined };
  });
}
