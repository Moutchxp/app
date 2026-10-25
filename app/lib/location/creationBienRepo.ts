import { query, withTransaction, type RequeteTx } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { normaliserTexte } from '../gestion/annuaire';
import { estDoublon, phraseDoublon, type BienComparable } from './doublonBien';
import { verifierCoordonnees, type CoordonneeSaisie } from '../gestion/annuaireEdition';
import { creerPersonne, type ChampsPersonne } from '../gestion/annuaireEditionRepo';
import type { Auteur } from '../gestion/gestes';
import { verifierAnnexesSaisies, verifierBienComplet, verifierComplements, type ComplementsBien, type ComplementsFiche, type SaisieBien } from './bienComplet';import { origineProprietaireDisponible } from './origineProprietaireRepo';
import { verifierOrigineProprietaire, type OrigineProprietaire } from './origineProprietaire';

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
import { verifierMandat, sorteDuBien } from './mandatBien';
import { enregistrerMandatDans } from './mandatBienRepo';
import { adresseDuLot, digicodeImmeubleDisponible, enregistrerDigicodeDans, lireDigicodeAdresse, lireDigicodeDuLot } from './digicodeImmeubleRepo';

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

/** La migration 400 (« Paiement des charges » de copropriété : propriétaire / agence) est-elle là ? */
export function chargesCoproDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'charges_copro');
}

/** La migration 401 (« ID fiscal du bien ») est-elle là ? */
export function idFiscalDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'id_fiscal');
}

/** La migration 382 (« Non soumis » au DPE) est-elle là ? */
export function dpeNonSoumisDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'dpe_non_soumis');
}

/** La migration 390 (« Bien en gestion ? », propre à chaque bien) est-elle là ? */
export function bienEnGestionDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'en_gestion');
}

/** La migration 376 (famille de bien, parking, accès, annexe à autre adresse) est-elle là ? */
export function familleDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'adresse_autre');
}

class Refus extends Error {}

/** Arno (21/10/2026) — « Ce bien semble déjà exister » : l'avertissement anti-doublon (jamais bloquant : « Créer quand même »). */
export type IssueDoublon = { etat: 'doublon'; motif: string; data: { lotId: number; adresse: string | null; commune: string | null; etage: string | null; porte: string | null } };
class DoublonTrouve extends Error { constructor(readonly bien: BienComparable & { id: number }) { super('doublon'); } }

/** Un bien EN PORTEFEUILLE d'un de ces propriétaires (titulaire, ou lien de copropriété en cours) qui serait le même (`estDoublon`). */
export async function bienExistantPareil(q: RequeteTx, proprietaireIds: number[], nouveau: BienComparable): Promise<(BienComparable & { id: number }) | null> {
  const sortie = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? ' AND lo.sorti_portefeuille_le IS NULL' : '';
  const { rows } = await q<{ id: string; adresse: string | null; commune: string | null; etage: string | null; porte: string | null; categorie: string | null }>(
    `SELECT lo.id::text, lo.adresse, lo.commune, lo.etage, lo.porte, lo.categorie FROM gestion_annuaire_lot lo
      WHERE (lo.proprietaire_id = ANY($1::bigint[])
             OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = ANY($1::bigint[]) AND lp.jusqu_a IS NULL))
        AND lo.gestion_fin IS NULL${sortie}
      ORDER BY lo.id`, [proprietaireIds]);
  const r = rows.find((x) => estDoublon(nouveau, x));
  return r === undefined ? null : { ...r, id: Number(r.id) };
}

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
  /** 🔴 Arno (25/10/2026, 425) — l'origine du contact des propriétaires CRÉÉS ici (obligatoire avec la 425 ; « Origine inconnue » est un choix). */
  origine?: unknown;
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
  // 🔴 Arno (25/10/2026, 425) — l'origine du contact : obligatoire pour toute carte créée (les fiches retenues gardent la leur).
  let origine: OrigineProprietaire | null = null;
  if (cartes.length > 0 && await origineProprietaireDisponible()) {
    const v = verifierOrigineProprietaire(o.origine);
    if (!v.ok) return { etat: 'refus', motif: v.motif };
    origine = v.valeur;
  }
  const ids: number[] = [];
  for (const [i, c] of cartes.entries()) {
    const cree = await creerPersonne('proprietaire', { ...c, nom: (c.nom ?? '').trim() }, auteur, { origine });
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
type SaisieBienComplete = SaisieBien & {
  contacts?: ContactSaisi[]; syndic?: SyndicDuBien | null; contactsExistants?: number[]; mandat?: unknown; confirmeDoublon?: boolean;
};
type IssueBien = Issue<{ logementId: number; annexes: number[]; contacts: number; contactsRefus: string | null; syndicRefus: string | null; agRefus: string | null; entretienRefus: string | null;
  mandatRefus?: string | null }>;

/** La création telle qu'avant (sans l'avertissement anti-doublon) : le contrat de toujours, pour tout appelant existant. */
export async function creerBienComplet(s: SaisieBienComplete, auteur: Auteur): Promise<IssueBien> {
  const r = await creerBienInterne({ ...s, confirmeDoublon: true }, auteur);
  return r.etat === 'doublon' ? { etat: 'refus', motif: r.motif } : r;
}

/**
 * Arno (21/10/2026) — « NOUVEAU BIEN » AVEC L'ANTI-DOUBLON : si un bien du même propriétaire existe déjà à la même adresse
 * (normalisée), même étage, même n° de porte, rien n'est créé et l'issue `doublon` le dit (« Ce bien semble déjà exister ») ;
 * `confirmeDoublon` (« Créer quand même ») passe. La route de l'écran appelle CELLE-CI.
 */
export function creerBienVerifie(s: SaisieBienComplete, auteur: Auteur): Promise<IssueBien | IssueDoublon> {
  return creerBienInterne(s, auteur);
}

async function creerBienInterne(s: SaisieBien & {
  contacts?: ContactSaisi[]; syndic?: SyndicDuBien | null;
  /** Arno, 18/10/2026 — les cartes « contact du propriétaire » EXISTANTES cochées dans « Qui rattacher à ce bien ? ». */
  contactsExistants?: number[];
  /** Arno (21/10/2026, 397) — le mandat du choix FINAL de « Bien en gestion ? » (n°, date de signature), facultatif. */
  mandat?: unknown;
  /** Arno (21/10/2026) — « Créer quand même » : l'avertissement « Ce bien semble déjà exister » a été vu et passé. */
  confirmeDoublon?: boolean;
}, auteur: Auteur):
  Promise<Issue<{ logementId: number; annexes: number[]; contacts: number; contactsRefus: string | null; syndicRefus: string | null; agRefus: string | null; entretienRefus: string | null;
    mandatRefus?: string | null }> | IssueDoublon> {
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
  // Arno (21/10/2026, 397) — le MANDAT (facultatif), vérifié avant toute écriture ; sa sorte doit être celle du choix final.
  const vm = verifierMandat(s.mandat);
  if (!vm.ok) return { etat: 'refus', motif: vm.motif };
  const mandat = vm.mandat !== null && vm.mandat.sorte === sorteDuBien(typeof s.enGestion === 'boolean' ? s.enGestion : true) ? vm.mandat : null;
  let mandatRefus: string | null = null;
  // La DERNIÈRE AG (Arno, 18/10/2026) : vérifiée avant toute écriture, posée sur l'IMMEUBLE du bien (son adresse) une fois créé.
  const ag = verifierDateAg((s.logement ?? {}).derniereAg);
  if (!ag.ok) return { etat: 'refus', motif: ag.motif };
  // L'ENTRETIEN À PRÉVOIR (Arno, 18/10/2026) : vérifié avant toute écriture, enregistré une fois le bien créé.
  const entretien = verifierEntretiens((s.logement ?? {}).entretienAPrevoir, (s.logement ?? {}).entretiens);
  if (!entretien.ok) return { etat: 'refus', motif: entretien.motif };
  const l = v.logement;
  const avec378 = await annexeNomPnoDisponible();
  const avec379 = await entretienDisponible();
  // « Non soumis » ne s'écrit que dans la colonne de la migration 382 : sans elle, rien n'est créé (jamais un DPE perdu en silence).
  const avec382 = await dpeNonSoumisDisponible();
  if (l.dpeNonSoumis === true && !avec382) return { etat: 'sans_schema' };
  // « Paiement des charges » (Arno, 21/10/2026, migration 400) : sans la colonne, un choix n'est jamais perdu en silence.
  const avec400 = await chargesCoproDisponible();
  if ((l.chargesCopro ?? null) !== null && !avec400) return { etat: 'sans_schema' };
  // « ID fiscal du bien » (Arno, 21/10/2026, migration 401) : même règle — une valeur saisie n'est jamais perdue en silence.
  const avec401 = await idFiscalDisponible();
  if ((l.idFiscal ?? null) !== null && !avec401) return { etat: 'sans_schema' };
  // Arno (21/10/2026, 396) : le digicode se pose sur l'IMMEUBLE de l'adresse (sans la 396 : sur le bien, comme avant).
  const surImmeuble = await digicodeImmeubleDisponible();
  // « Bien en gestion ? » (migration 390) : sans la colonne, « Non » n'est jamais perdu en silence — rien n'est créé.
  // « Oui » est la valeur par défaut de la colonne : sans elle, le bien est créé comme avant.
  const avec390 = await bienEnGestionDisponible();
  if (!v.enGestion && !avec390) return { etat: 'sans_schema' };
  const statut = avec390 ? { en_gestion: v.enGestion } : {};
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
      /* 🔴 ANTI-DOUBLON (Arno, 21/10/2026) — APRÈS le verrou des propriétaires (FOR UPDATE ci-dessus) : deux envois simultanés pour
         le même propriétaire passent l'un après l'autre, et le second voit le bien du premier. « Créer quand même » le saute. */
      if (s.confirmeDoublon !== true) {
        const existant = await bienExistantPareil(q, v.proprietaireIds, { adresse: l.adresse, commune: l.commune, etage: l.etage, porte: l.porte, categorie: v.famille });
        if (existant !== null) throw new DoublonTrouve(existant);
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
        // Arno (21/10/2026, 396) : avec l'immeuble, le digicode n'est PAS copié sur le bien (posé sur l'immeuble juste après).
        ascenseur: l.ascenseur, digicode: surImmeuble ? null : l.digicode, digicode_code: surImmeuble ? null : l.digicodeCode, precision_acces: l.precisionAcces,
        ...(avec378 ? { assurance_pno: l.assurancePno ?? null, pno_date_anniversaire: l.assurancePno === true ? l.pnoDateAnniversaire ?? null : null } : {}),
        ...(avec382 ? { dpe_non_soumis: l.dpeNonSoumis === true ? true : null } : {}),
        ...(avec400 ? { charges_copro: l.chargesCopro ?? null } : {}),
        ...(avec401 ? { id_fiscal: l.idFiscal ?? null } : {}),
        ...statut,
      }, auteur);
      if (surImmeuble && (l.digicode !== null || (l.digicodeCode ?? '').trim() !== '')) {
        // Arno (21/10/2026, 399) : le code du BÂTIMENT du bien (le code général sans bâtiment). Écrit seulement s'il diffère de ce
        // que ce bâtiment lit déjà : le code général pré-rempli et laissé tel quel n'est jamais copié sur le bâtiment.
        const adresse = { voie: l.adresse, codePostal: l.codePostal, commune: l.commune };
        const lu = await lireDigicodeAdresse(adresse, l.batiment, q);
        if (lu === null || lu.digicode !== l.digicode || (lu.code ?? null) !== ((l.digicodeCode ?? '').trim() || null)) {
          const d = await enregistrerDigicodeDans(q, adresse, { digicode: l.digicode, code: l.digicodeCode }, auteur, 'nouveau_bien', logementId, l.batiment);
          if (!d.ok) throw new Refus(d.motif);
        }
      }
      // Le mandat, sur la fiche de chaque propriétaire du bien (les champs existants), dans la même transaction que le bien.
      if (mandat !== null) mandatRefus = await enregistrerMandatDans(q, v.proprietaireIds, mandat, logementId, auteur);
      const annexes: number[] = [];
      for (const a of v.annexes) {
        // « Même adresse » (par défaut) : l'annexe hérite de l'adresse du logement / local. « Autre adresse » : la sienne.
        const adresse = a.autreAdresse ? { adresse: a.adresse, codePostal: a.codePostal, commune: a.commune }
          : { adresse: l.adresse, codePostal: l.codePostal, commune: l.commune };
        const id = await insererLot(q, proprietaires, { ...a, ...adresse }, a.categorie ?? 'cave', {
          adresse_autre: a.autreAdresse, parking_situation: a.parkingSituation, parking_type: a.parkingType,
          ...(avec378 ? { nom_annexe: a.nomAnnexe } : {}),
          // Une annexe suit le statut de son logement / local : elle est louée et gérée avec lui.
          ...statut,
          ...(avec379 ? { annotation: a.annotation ?? null, ...(a.detachee === true ? { annexe_detachee_le: new Date().toISOString(), annexe_detachee_par_libelle: auteur.libelle } : {}) } : {}),
        }, auteur);
        await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, logementId, auteur.libelle]);
        annexes.push(id);
      }
      await journaliser(q, 'annuaire_lot', logementId, 'location_bien_cree',
        `bien créé dans la Location (formulaire complet) : ${v.famille} + ${annexes.length} annexe(s), propriétaire(s) ${proprietaires.map((p) => p.id).join(', ')}`
        + `${avec390 ? `, bien en gestion : ${v.enGestion ? 'oui' : 'non'}` : ''}`, auteur);
      return { logementId, annexes };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    if (e instanceof DoublonTrouve) {
      return { etat: 'doublon', motif: phraseDoublon(e.bien), data: { lotId: e.bien.id, adresse: e.bien.adresse, commune: e.bien.commune, etage: e.bien.etage, porte: e.bien.porte } };
    }
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
    contactsRefus: refus.length === 0 ? null : `Le bien est créé, mais : ${refus.join(' ')}`, syndicRefus, agRefus, entretienRefus, mandatRefus,
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
  const avec382 = await dpeNonSoumisDisponible();
  const avec400 = await chargesCoproDisponible();
  const avec401 = await idFiscalDisponible();
  const { rows } = await query<{
    batiment: string | null; escalier: string | null; type_logement: string | null; nombre_pieces: number | null; meuble: boolean | null;
    surface_habitable_m2: string | null; syndic_id: string | null; syndic_nom: string | null; epoque_construction: string | null;
    chauffage: string | null; dpe_classe: string | null; dpe_date: string | null; commentaire: string | null;
    type_local: string | null; parking_situation: string | null; parking_type: string | null; surface_m2: string | null;
    ascenseur: boolean | null; digicode: boolean | null; digicode_code: string | null; precision_acces: string | null;
    assurance_pno: boolean | null; pno_date_anniversaire: string | null; dpe_non_soumis: boolean | null; charges_copro: string | null; id_fiscal: string | null;
  }>(
    `SELECT lo.batiment, lo.escalier, lo.type_logement, lo.nombre_pieces, lo.meuble, lo.surface_habitable_m2::text,
            lo.syndic_id::text, s.nom AS syndic_nom, lo.epoque_construction, lo.chauffage, lo.dpe_classe, lo.dpe_date::text, lo.commentaire,
            ${avec376 ? `lo.type_local, lo.parking_situation, lo.parking_type, lo.surface_m2::text, lo.ascenseur, lo.digicode, lo.digicode_code, lo.precision_acces`
    : `NULL::text AS type_local, NULL::text AS parking_situation, NULL::text AS parking_type, NULL::text AS surface_m2, NULL::boolean AS ascenseur,
       NULL::boolean AS digicode, NULL::text AS digicode_code, NULL::text AS precision_acces`},
            ${avec378 ? 'lo.assurance_pno, lo.pno_date_anniversaire::text' : 'NULL::boolean AS assurance_pno, NULL::text AS pno_date_anniversaire'},
            ${avec382 ? 'lo.dpe_non_soumis' : 'NULL::boolean AS dpe_non_soumis'},
            ${avec400 ? 'lo.charges_copro' : 'NULL::text AS charges_copro'},
            ${avec401 ? 'lo.id_fiscal' : 'NULL::text AS id_fiscal'}
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_syndic s ON s.id = lo.syndic_id WHERE lo.id = $1`, [id]);
  const r = rows[0];
  if (r === undefined) return null;
  const immeubleAg = (await agDisponible()) ? await immeubleAgDuLot(id) : null;
  const entretiens = await lireEntretiens(id);
  // Arno (21/10/2026, 396) — le digicode est celui de l'IMMEUBLE de l'adresse (l'ancienne valeur du bien, tant qu'il n'en a pas).
  const digi = await lireDigicodeDuLot(id);
  return {
    ...(digi === null ? {} : { digicodeImmeuble: { mention: digi.mention, source: digi.source, portee: digi.portee, batiment: digi.batiment } }),
    ...(entretiens === null ? {} : { entretienAPrevoir: entretiens.aPrevoir, entretiens: entretiens.entretiens }),
    derniereAg: immeubleAg === null ? null : await lireAg(immeubleAg.cle), agApplicable: immeubleAg !== null,
    batiment: r.batiment, escalier: r.escalier, typeLogement: r.type_logement as ComplementsBien['typeLogement'],
    nombrePieces: r.nombre_pieces, meuble: r.meuble, surfaceHabitableM2: r.surface_habitable_m2 === null ? null : Number(r.surface_habitable_m2),
    syndicId: r.syndic_id === null ? null : Number(r.syndic_id), syndicNom: r.syndic_nom, epoqueConstruction: r.epoque_construction,
    chauffage: r.chauffage, dpeClasse: r.dpe_classe, dpeDate: r.dpe_date, dpeNonSoumis: r.dpe_non_soumis, commentaire: r.commentaire,
    typeLocal: r.type_local as ComplementsBien['typeLocal'], parkingSituation: r.parking_situation as ComplementsBien['parkingSituation'],
    parkingType: r.parking_type as ComplementsBien['parkingType'], surfaceM2: r.surface_m2 === null ? null : Number(r.surface_m2),
    ascenseur: r.ascenseur, digicode: digi === null ? r.digicode : digi.digicode, digicodeCode: digi === null ? r.digicode_code : digi.code,
    precisionAcces: r.precision_acces,
    assurancePno: r.assurance_pno, pnoDateAnniversaire: r.pno_date_anniversaire,
    // Arno (21/10/2026, 400) : absent sans la migration (la fiche ne propose alors pas le choix).
    ...(avec400 ? { chargesCopro: r.charges_copro === 'proprietaire' || r.charges_copro === 'agence' ? r.charges_copro : null } : {}),
    // Arno (21/10/2026, 401) : absent sans la migration (la fiche ne propose alors pas le champ).
    ...(avec401 ? { idFiscal: r.id_fiscal } : {}),
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
  const avec382 = await dpeNonSoumisDisponible();
  if (c.dpeNonSoumis === true && !avec382) return { etat: 'sans_schema' };
  // « Paiement des charges » (migration 400) : envoyé seulement par la fiche qui le montre ; jamais perdu en silence.
  const avecCharges = Object.prototype.hasOwnProperty.call(brut, 'chargesCopro');
  const avec400 = await chargesCoproDisponible();
  if (avecCharges && (c.chargesCopro ?? null) !== null && !avec400) return { etat: 'sans_schema' };
  // « ID fiscal du bien » (migration 401) : envoyé seulement par la fiche qui le montre (le bien, jamais une annexe).
  const avecIdFiscal = Object.prototype.hasOwnProperty.call(brut, 'idFiscal');
  const avec401 = await idFiscalDisponible();
  if (avecIdFiscal && (c.idFiscal ?? null) !== null && !avec401) return { etat: 'sans_schema' };
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q('SELECT 1 FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [id]);
      if (rows.length === 0) return { etat: 'inconnu' as const };
      // Arno (21/10/2026, 399) : le digicode que la fiche MONTRAIT (avant que le bâtiment ne change) — seul un écart à cette
      // valeur est une saisie ; un bâtiment changé avec le digicode laissé tel quel ne recopie jamais l'ancien code ailleurs.
      const montre = await lireDigicodeDuLot(id, q);
      if (c.syndicId !== null) {
        const { rows: sy } = await q('SELECT 1 FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL', [c.syndicId]);
        if (sy.length === 0) throw new Refus('Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
      }
      await q(
        `UPDATE gestion_annuaire_lot SET batiment = $2, escalier = $3, type_logement = $4, nombre_pieces = $5, meuble = $6,
                surface_habitable_m2 = $7, syndic_id = $8, epoque_construction = $9, chauffage = $10, dpe_classe = $11,
                dpe_date = $12::date, commentaire = $13${avec382 ? ', dpe_non_soumis = $14' : ''} WHERE id = $1`,
        [id, c.batiment, c.escalier, c.typeLogement, c.nombrePieces, c.meuble, c.surfaceHabitableM2, c.syndicId,
          c.epoqueConstruction, c.chauffage, c.dpeClasse, c.dpeDate, c.commentaire, ...(avec382 ? [c.dpeNonSoumis === true ? true : null] : [])]);
      if (await familleDisponible()) {
        // Arno (21/10/2026, 396) : avec l'immeuble, le digicode s'écrit SUR L'IMMEUBLE de l'adresse (jamais une copie sur le bien) —
        // seulement s'il a changé par rapport à ce que la fiche montrait ; sans la 396, sur le bien, comme avant.
        const surImmeuble = await digicodeImmeubleDisponible();
        await q(surImmeuble
          ? `UPDATE gestion_annuaire_lot SET type_local = $2, parking_situation = $3, parking_type = $4, surface_m2 = $5, ascenseur = $6,
                    precision_acces = $7 WHERE id = $1`
          : `UPDATE gestion_annuaire_lot SET type_local = $2, parking_situation = $3, parking_type = $4, surface_m2 = $5, ascenseur = $6,
                    digicode = $7, digicode_code = $8, precision_acces = $9 WHERE id = $1`,
        surImmeuble
          ? [id, c.typeLocal, c.parkingSituation, c.parkingType, c.surfaceM2, c.ascenseur, c.precisionAcces]
          : [id, c.typeLocal, c.parkingSituation, c.parkingType, c.surfaceM2, c.ascenseur, c.digicode, c.digicodeCode, c.precisionAcces]);
        if (surImmeuble) {
          // Arno (21/10/2026, 399) : écrit sur le BÂTIMENT du bien (le code général s'il n'en a pas) — seulement si la valeur
          // diffère de ce que la fiche montrait.
          const adresse = await adresseDuLot(id);
          if (montre !== null && adresse !== null && (montre.digicode !== c.digicode || (montre.code ?? null) !== (c.digicodeCode ?? null))) {
            const r = await enregistrerDigicodeDans(q, adresse, { digicode: c.digicode, code: c.digicodeCode }, auteur, 'fiche_bien', id, c.batiment);
            if (!r.ok) throw new Refus(r.motif);
          }
        }
      }
      if (avecCharges && avec400) await q('UPDATE gestion_annuaire_lot SET charges_copro = $2 WHERE id = $1', [id, c.chargesCopro ?? null]);
      if (avecIdFiscal && avec401) {
        // Jamais sur une annexe (Arno) : l'identifiant fiscal est celui du bien principal.
        if ((c.idFiscal ?? null) !== null) {
          const { rows: an } = await q('SELECT 1 FROM gestion_lot_annexe WHERE annexe_id = $1', [id]);
          if (an.length > 0) throw new Refus('L’ID fiscal se saisit sur le bien principal, jamais sur une annexe.');
        }
        await q('UPDATE gestion_annuaire_lot SET id_fiscal = $2 WHERE id = $1', [id, c.idFiscal ?? null]);
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

/**
 * Arno (23/10/2026) — LES ANNEXES AJOUTÉES DANS « MODIFIER » LA FICHE ENTIÈRE : exactement l'écriture des annexes de « Nouveau
 * bien » (mêmes contrôles `verifierAnnexesSaisies`, mêmes colonnes : autre adresse, parking, nom, annotation, « Détachée »), sous
 * un bien EXISTANT : ses propriétaires (titulaire et co-propriétaires en cours), son adresse pour « Même adresse », son « en
 * gestion » (une annexe suit son bien). Une transaction ; journalisé sur le bien. Un bien qui est lui-même une annexe n'en a pas.
 */
export async function ajouterAnnexesCompletes(parentId: number, brutes: readonly Record<string, unknown>[], auteur: Auteur): Promise<Issue<{ ids: number[] }>> {
  if (!(await bienCompletDisponible()) || !(await familleDisponible())) return { etat: 'sans_schema' };
  const v = verifierAnnexesSaisies(brutes.slice(0, 20));
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  if (v.annexes.length === 0) return { etat: 'ok', data: { ids: [] } };
  const avec378 = await annexeNomPnoDisponible();
  const avec379 = await entretienDisponible();
  const avec390 = await bienEnGestionDisponible();
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'jusqu_a');
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ proprietaire_id: string | null; nom: string | null; adresse: string | null; code_postal: string | null; commune: string | null;
        en_gestion: boolean | null; categorie: string | null }>(
        `SELECT lo.proprietaire_id::text, p.nom_complet AS nom, lo.adresse, lo.code_postal, lo.commune, lo.categorie,
                ${avec390 ? 'lo.en_gestion' : 'NULL::boolean AS en_gestion'}
           FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire p ON p.id = lo.proprietaire_id
          WHERE lo.id = $1 FOR UPDATE OF lo`, [parentId]);
      const parent = rows[0];
      if (parent === undefined) return { etat: 'inconnu' as const };
      if (parent.proprietaire_id === null) throw new Refus('Ce bien n’a pas de propriétaire rattaché : son annexe ne saurait à qui appartenir.');
      if (parent.categorie === 'parking' || parent.categorie === 'box') throw new Refus('Un parking nu n’a pas d’annexe.');
      const { rows: co } = avecCo ? await q<{ id: string; nom: string }>(
        `SELECT lp.proprietaire_id::text AS id, p.nom_complet AS nom FROM gestion_annuaire_lot_proprietaire lp
           JOIN gestion_annuaire_proprietaire p ON p.id = lp.proprietaire_id
          WHERE lp.lot_id = $1 AND lp.jusqu_a IS NULL AND lp.proprietaire_id <> $2 ORDER BY lp.rang, lp.proprietaire_id`, [parentId, parent.proprietaire_id]) : { rows: [] };
      const proprietaires = [{ id: Number(parent.proprietaire_id), nom: parent.nom ?? '' }, ...co.map((c) => ({ id: Number(c.id), nom: c.nom }))];
      const statut = avec390 && parent.en_gestion !== null ? { en_gestion: parent.en_gestion } : {};
      const ids: number[] = [];
      for (const a of v.annexes) {
        const adresse = a.autreAdresse ? { adresse: a.adresse, codePostal: a.codePostal, commune: a.commune }
          : { adresse: parent.adresse, codePostal: parent.code_postal, commune: parent.commune };
        const id = await insererLot(q, proprietaires, { ...a, ...adresse }, a.categorie ?? 'cave', {
          adresse_autre: a.autreAdresse, parking_situation: a.parkingSituation, parking_type: a.parkingType,
          ...(avec378 ? { nom_annexe: a.nomAnnexe } : {}),
          ...statut,
          ...(avec379 ? { annotation: a.annotation ?? null, ...(a.detachee === true ? { annexe_detachee_le: new Date().toISOString(), annexe_detachee_par_libelle: auteur.libelle } : {}) } : {}),
        }, auteur);
        await q('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, parentId, auteur.libelle]);
        ids.push(id);
      }
      await journaliser(q, 'annuaire_lot', parentId, 'location_annexe_ajoutee',
        `${ids.length} annexe(s) ajoutée(s) dans « Modifier » de la fiche (formulaire complet) : ${ids.join(', ')}`, auteur);
      return { etat: 'ok' as const, data: { ids } };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    const m = e instanceof Error ? e.message : '';
    if (/annexe d'annexe|a déjà des annexes|gestion_lot_annexe_unique_uq|gestion_lot_annexe_soi_chk/.test(m)) {
      return { etat: 'refus', motif: 'Ce bien ne peut pas recevoir d’annexe (il est lui-même une annexe).' };
    }
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
