import 'server-only';
import { query, withTransaction } from '../db/client';
import { chargesCoproDisponible, ecrireChargesCoproDans } from './chargesCoproRepo';
import { indiceDuBailDisponible } from './indicesRepo';
import { CHARGES_COPRO, type ChargesCopro } from './bienComplet';
import { chargesDesLots } from './chargesDesLots';
import type { Auteur } from '../gestion/gestes';
import { modifierPersonne } from '../gestion/annuaireEditionRepo';
import { colonnesTrace } from '../gestion/traceJournal';
import { lireCartesRattachees } from '../gestion/partieCategorieRepo';
import { motifConflitFiche } from '../gestion/traceFiche';
import { colonneExisteMemo } from './sondeLocation';
import { familleDuLot } from './bienComplet';
import { complementsDuBien } from './creationBienRepo';
import { conditionsParOccupation, modifierConditionsEntree } from './conditionsEntreeRepo';
import { versEnvoiConditions } from './conditionsEntree';
import { lignesHonoraires } from './honorairesProprietaire';
import { entretiensEnTexte } from './encartBien';
import { modifierEncartBien } from './encartBienRepo';
import { empreinte } from './ficheBienEntiere';
import { annuaireDisponible, mettreAJourActivite } from './suivi/suiviRepo';
import { MODES_PRIME, typeDeBienDesFiches, type CategoriePrime, type ModeApporteur, type ModePrime, type Origine, type OrigineContact } from './suivi/suivi';
import {
  changementsDossier, refusDossier, titreDossier, TITRE_BLOC, type CarteLocataireDossier, type ChangementDossier, type LectureDossier,
  type NomsDossier, type SaisieDossier, type SuiviDossier,
} from './dossierLocation';
import { CONDITIONS_VIDES, versSaisieConditions, type SaisieConditions } from './conditionsEntree';

/**
 * ══ 🔴🔴 « DOSSIER DE LOCATION » — LECTURE ET MISE À JOUR (Arno, 24/10/2026) ═══════════════════════════════════════════════════
 * LECTURE : tout ce qu'affichent les 4 blocs, lu dans les tables SOURCES (annuaire, bail, conditions d'entrée, fiche du bien, ligne
 * de suivi), et leur empreinte (la version).
 * MISE À JOUR : rien n'est créé — chaque partie modifiée passe par le geste EXISTANT qui la modifie ailleurs (mêmes contrôles,
 * mêmes refus) : la fiche du locataire (`modifierPersonne`), les conditions d'entrée du bail (`modifierConditionsEntree` : une
 * nouvelle version, l'historique reste), l'entretien du bien (`modifierEncartBien`), la LIGNE de suivi existante
 * (`mettreAJourActivite`). Une version différente de celle lue à l'ouverture : refus, rien n'est écrit. Une partie refusée arrête la
 * suite ; ce qui a déjà été écrit reste (journalisé) et le refus le dit — la règle de la fiche entière du bien.
 * Chaque champ modifié est journalisé (`gestion_journal`), avec la session et l'écran « Dossier de location (Suivi du mois) » (le
 * contexte de trace est posé par la route). 🔴 AUCUN GESTE DRIVE : aucune création, aucun renommage, aucun déplacement.
 */
const n = (v: unknown): number => Number(v);
const nOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** Un montant en base → le texte de la case (virgule, valeur exacte, jamais arrondie). */
const texteMontant = (v: unknown): string => (v === null || v === undefined ? '' : String(Number(v)).replace('.', ','));
/** Un taux en base (fraction) → le texte de la case, en % (exact). */
const textePct = (v: unknown): string => (v === null || v === undefined ? '' : String(Number((Number(v) * 100).toPrecision(12))).replace('.', ','));

export type IssueDossier =
  | { etat: 'ok'; data: LectureDossier }
  | { etat: 'non_rattache' } | { etat: 'inconnu' } | { etat: 'sans_schema' };

export async function lireDossierLocation(activiteId: number): Promise<IssueDossier> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const avec411 = await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
  const avec413 = await colonneExisteMemo('gestion_location_activite', 'apporteur_mode');
  const a = (await query<Record<string, unknown>>(
    `SELECT a.id, a.bail_id, a.type, a.date_signature::text AS date_signature, a.hono_proprietaire_ht, a.hono_locataire_ht, a.negociateur_id,
            a.apporteur_id, a.apporteur_taux, a.apporteur_commission_saisie, a.mandat_gestion, a.avec_gestion, a.categorie_prime,
            a.origine_proprietaire_saisie, a.origine_locataire_saisie, a.origine_contact, a.collegue_id, a.prime_mode, a.prime_gestion_saisie,
            ${avec411 ? 'a.origine_contact_precision' : 'NULL::text AS origine_contact_precision'},
            ${avec413 ? 'a.apporteur_mode, a.apporteur_taux_gestion' : 'NULL::text AS apporteur_mode, NULL::numeric AS apporteur_taux_gestion'},
            a.modifie_le::text AS modifie_le
       FROM gestion_location_activite a WHERE a.id = $1 AND a.annule_le IS NULL`, [activiteId])).rows[0];
  if (a === undefined) return { etat: 'inconnu' };
  if (a.bail_id === null) return { etat: 'non_rattache' };
  const bailId = n(a.bail_id);
  const b = (await query<{ lot_id: string; entree: string | null; adresse: string | null; commune: string | null; nature: string | null; categorie: string | null; type_bien: string | null }>(
    `SELECT b.lot_id::text, b.entree::text AS entree, l.adresse, l.commune, l.nature, l.categorie, l.type_bien
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id WHERE b.id = $1`, [bailId])).rows[0];
  if (b === undefined) return { etat: 'non_rattache' };
  const lotId = n(b.lot_id);
  const occ = (await query<{ id: string; locataire_id: string; lot_id: string }>(
    'SELECT id::text, locataire_id::text, lot_id::text FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY id', [bailId])).rows;
  const locIds = [...new Set(occ.map((o) => n(o.locataire_id)))];
  const lotIds = [...new Set([lotId, ...occ.map((o) => n(o.lot_id))])];
  // 🔴 Arno (25/10/2026) — le « Type de bien » du bloc 4 : celui des FICHES des lots du bail (la source unique), comme le résumé du Suivi.
  const fichesLots = (await query<{ id: string; categorie: string | null; nature: string | null; type_bien: string | null }>(
    'SELECT id::text, categorie, nature, type_bien FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[])', [lotIds])).rows;
  const typeFiche = typeDeBienDesFiches(lotId, fichesLots);
  const lots = (await query<{ id: string; libelle: string }>(
    `SELECT l.id::text, coalesce(nullif(concat_ws(' — ', nullif(btrim(l.nature), ''), nullif(btrim(concat_ws(' ', l.adresse, l.commune)), '')), ''), 'Bien n° ' || l.id) AS libelle
       FROM gestion_annuaire_lot l WHERE l.id = ANY($1::bigint[]) ORDER BY (l.id = $2) DESC, l.id`, [lotIds, lotId])).rows.map((r) => ({ id: n(r.id), libelle: r.libelle }));
  const lus = (await query<Record<string, string | null>>(
    `SELECT id::text, civilite, prenom, nom, qualite, adresse, code_postal, commune, note FROM gestion_annuaire_locataire WHERE id = ANY($1::bigint[]) ORDER BY id`, [locIds])).rows;
  const coord = (await query<{ sujet_id: string; id: string; sorte: 'telephone' | 'email'; valeur: string; valeur_brute: string | null; libelle: string | null }>(
    `SELECT sujet_id::text, id::text, sorte, valeur, valeur_brute, libelle FROM gestion_annuaire_contact
      WHERE sujet = 'locataire' AND sujet_id = ANY($1::bigint[]) AND archive_le IS NULL AND absent_le IS NULL ORDER BY rang, id`, [locIds])).rows;
  const locataires: CarteLocataireDossier[] = lus.map((r) => ({
    id: n(r.id), civilite: r.civilite, prenom: r.prenom, nom: r.nom ?? '', qualite: r.qualite, adresse: r.adresse, codePostal: r.code_postal,
    commune: r.commune, note: r.note,
    contacts: coord.filter((c) => c.sujet_id === r.id).map((c) => ({ id: n(c.id), sorte: c.sorte, affichage: c.valeur_brute ?? c.valeur, libelle: c.libelle })),
  }));
  // Les contacts du locataire : par le dépôt des cartes (le seul à nommer leur table) — ceux du bien côté locataire et ceux de ses locataires.
  const cartesLues = [...await lireCartesRattachees({ lotId }), ...(await Promise.all(locIds.map((id) => lireCartesRattachees({ locataireId: id })))).flat()];
  const contacts = [...new Map(cartesLues.map((c) => [c.id, c])).values()]
    .map((c) => ({ id: n(c.id), libelle: [(c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ') || c.adresse, qualite: c.qualite }));
  const cond = await conditionsParOccupation(occ.map((o) => n(o.id)));
  const c = [...cond.values()][0];
  // 🔴 Arno (25/10/2026) — le « paiement des charges » du BIEN (migration 400), montré et modifiable avec les conditions du bail.
  // Arno (25/10/2026, suite) : PRÉSÉLECTIONNÉ depuis les lots du bail (`chargesDesLots`) ; des lots divergents → aucune présélection.
  const avec400 = await chargesCoproDisponible();
  const chargesLues = avec400 ? (await query<{ id: string; v: string | null }>('SELECT id::text, charges_copro AS v FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[])', [lotIds])).rows : null;
  const lotsCharges: LectureDossier['lots'] = chargesLues === null ? lots
    : lots.map((x) => { const v = chargesLues.find((r) => n(r.id) === x.id)?.v; return { ...x, chargesCopro: v === 'agence' || v === 'proprietaire' ? v as ChargesCopro : null }; });
  const fiche = chargesLues === null ? null : chargesDesLots(lotsCharges.map((x) => x.chargesCopro));
  const conditions = c === undefined ? null : {
    occupationId: c.occupationIds[0] ?? n(occ[0].id),
    valeurs: fiche === null ? c.conditions : { ...c.conditions, chargesCopro: fiche.sorte === 'valeur' ? fiche.valeur : null },
    loyer: c.loyer ?? null,
    lignesHonoraires: c.honoraires === null ? [] : c.honoraires.etat === 'ok' || c.honoraires.etat === 'saisi' ? lignesHonoraires(c.honoraires).map((x) => ({ mot: x.mot, valeur: x.valeur })) : [],
  };
  const famille = familleDuLot({ categorie: b.categorie, nature: b.nature, typeBien: b.type_bien });
  const comp = famille === 'logement' || famille === 'local' ? await complementsDuBien(lotId) : null;
  const entretien = comp === null || comp.entretienAPrevoir === undefined ? null
    : { aPrevoir: comp.entretienAPrevoir ?? null, entretiens: (comp.entretiens ?? []).map((e) => ({ sorte: e.sorte, nom: e.nom ?? null, dateAnniversaire: e.dateAnniversaire ?? null })) };
  const primeMode = (MODES_PRIME as readonly string[]).includes(String(a.prime_mode)) ? a.prime_mode as ModePrime
    : Number(a.prime_gestion_saisie ?? 0) > 0 ? 'personnalise' : 'aucune';
  const suivi: SuiviDossier = {
    type: a.type === 'avenant' || a.type === 'gestion_seule' ? a.type : 'bail', dateSignature: String(a.date_signature),
    honoProprietaireHt: texteMontant(a.hono_proprietaire_ht), honoLocataireHt: texteMontant(a.hono_locataire_ht),
    negociateurId: nOuNull(a.negociateur_id), apporteurId: nOuNull(a.apporteur_id), apporteurTaux: textePct(a.apporteur_taux),
    mandatGestion: a.mandat_gestion === true, avecGestion: a.avec_gestion === true,
    origineProprietaire: (a.origine_proprietaire_saisie as Origine | null) ?? null, origineLocataire: (a.origine_locataire_saisie as Origine | null) ?? null,
    origineContact: (a.origine_contact as OrigineContact | null) ?? null, collegueId: nOuNull(a.collegue_id),
    commissionApporteur: texteMontant(a.apporteur_commission_saisie), primeMode,
    primeMontant: primeMode === 'personnalise' ? texteMontant(a.prime_gestion_saisie) : '',
    origineContactPrecision: (a.origine_contact_precision as string | null) ?? '',
    apporteurMode: a.apporteur_mode === 'one_shot' || a.apporteur_mode === 'recurrent' ? a.apporteur_mode as ModeApporteur : null,
    apporteurTauxGestion: textePct(a.apporteur_taux_gestion),
    categoriePrime: typeFiche ?? (a.categorie_prime as CategoriePrime | null) ?? null,
  };
  const adresse = [b.adresse, b.commune].filter((x) => x).join(' ');
  const lecture: Omit<LectureDossier, 'version'> = {
    activiteId, bailId, lotId, titre: titreDossier(locataires, adresse),
    bien: { id: lotId, titre: adresse || `Bien n° ${lotId}`, famille }, lots: lotsCharges, entree: b.entree, locataires, contacts, conditions, entretien, suivi,
  };
  return { etat: 'ok', data: { ...lecture, version: empreinte({ ...lecture, modifie: a.modifie_le }) } };
}

// ── LA SAISIE REÇUE ─────────────────────────────────────────────────────────────────────────────────────────────────

const ch = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** La saisie brute → la saisie lue ; ce qui manque garde la valeur lue (jamais un champ vidé par omission). */
export function lireSaisieDossier(brut: Record<string, unknown>, lu: LectureDossier): SaisieDossier {
  const locs = Array.isArray(brut.locataires) ? brut.locataires : [];
  const locataires = locs.slice(0, 20).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'number' ? o.id : NaN;
    if (!lu.locataires.some((l) => l.id === id) || o.champs === null || typeof o.champs !== 'object') return [];
    return [{ id, champs: o.champs as SaisieDossier['locataires'][number]['champs'] }];
  });
  const condBrut = brut.conditions !== null && typeof brut.conditions === 'object' ? brut.conditions as SaisieConditions : null;
  // L'indice et le paiement des charges absents de la saisie gardent la valeur LUE (jamais vidés par omission) ; une valeur inconnue est refusée.
  const lus = lu.conditions === null ? null : versSaisieConditions(lu.conditions.valeurs, lu.conditions.loyer);
  const charges = condBrut === null || lus?.chargesCopro === undefined ? undefined
    : condBrut.chargesCopro === undefined ? lus.chargesCopro : (CHARGES_COPRO as readonly unknown[]).includes(condBrut.chargesCopro) ? condBrut.chargesCopro : null;
  const conditions = lu.conditions === null || condBrut === null ? null : { ...CONDITIONS_VIDES, ...condBrut, loyer: { principal: ch(condBrut.loyer?.principal, 40), provisions: ch(condBrut.loyer?.provisions, 40) },
    ...(condBrut.indice === undefined && lus?.indice !== undefined ? { indice: lus.indice } : {}),
    ...(charges === undefined ? {} : { chargesCopro: charges }) };
  const e = brut.entretien !== null && typeof brut.entretien === 'object' ? brut.entretien as SaisieDossier['entretien'] : null;
  const suivi = brut.suivi !== null && typeof brut.suivi === 'object' ? { ...lu.suivi, ...(brut.suivi as Partial<SuiviDossier>) } : lu.suivi;
  return { version: ch(brut.version, 64), locataires, conditions, entretien: lu.entretien === null ? null : e, suivi };
}

// ── LES NOMS (journal et récapitulatif) ────────────────────────────────────────────────────────────────────────────

async function nomsDuDossier(): Promise<NomsDossier> {
  const comptes = new Map((await query<{ id: string; libelle: string }>(
    `SELECT id::text, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS libelle FROM admin_utilisateur`)).rows.map((r) => [n(r.id), r.libelle]));
  const apporteurs = new Map((await query<{ id: string; nom: string }>('SELECT id::text, nom FROM gestion_location_apporteur')).rows.map((r) => [n(r.id), r.nom]));
  const compte = (id: number): string => comptes.get(id) ?? `compte n° ${id}`;
  return { negociateur: compte, collegue: compte, apporteur: (id) => apporteurs.get(id) ?? `apporteur n° ${id}` };
}

// ── LE JOURNAL (une ligne par champ) ───────────────────────────────────────────────────────────────────────────────

async function journaliserChamps(o: { entite: 'location_activite' | 'location_bail'; id: number; lotId: number; action: string; changements: readonly ChangementDossier[]; auteur: Auteur }): Promise<void> {
  // Sans la 418, le journal n'accepte pas ces entités : la ligne va au bien (`annuaire_lot`), et dit de quoi il s'agit.
  const avec418 = ((await query<{ def: string | null }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass`)).rows[0]?.def ?? '')
    .includes(`'${o.entite}'`);
  for (const c of o.changements) {
    const t = await colonnesTrace({ sujet: o.entite === 'location_activite' ? 'activite' : 'bail', champ: c.champ }, 9);
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8${t.marques})`,
      [avec418 ? o.entite : 'annuaire_lot', avec418 ? o.id : o.lotId, o.action, c.avant, c.apres,
        `Dossier de location — ${TITRE_BLOC[c.bloc]} — ${c.champ} : ${c.avant} → ${c.apres}${avec418 ? '' : ` (${o.entite === 'location_activite' ? 'ligne de suivi' : 'bail'} n° ${o.id})`}`,
        o.auteur.id, o.auteur.libelle, ...t.valeurs]);
  }
}

// ── LE CONFLIT : qui a modifié, et quand ───────────────────────────────────────────────────────────────────────────

async function derniereModification(lu: LectureDossier): Promise<{ par: string; quand: string } | null> {
  const { rows } = await query<{ par: string; quand: string }>(
    `SELECT coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), j.auteur_libelle) AS par, j.survenu_le::text AS quand
       FROM gestion_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id
      WHERE (j.entite = 'location_activite' AND j.entite_id = $1) OR (j.entite = 'location_bail' AND j.entite_id = $2)
         OR (j.entite = 'annuaire_lot' AND j.entite_id = $3) OR (j.entite = 'annuaire' AND j.entite_id = ANY($4::bigint[]))
      ORDER BY j.survenu_le DESC, j.id DESC LIMIT 1`, [lu.activiteId, lu.bailId, lu.lotId, lu.locataires.map((l) => l.id)]);
  return rows[0] ?? null;
}

// ── LA MISE À JOUR ─────────────────────────────────────────────────────────────────────────────────────────────────

export type IssueModificationDossier =
  | { etat: 'ok'; data: { changements: ChangementDossier[] } }
  | { etat: 'conflit'; motif: string } | { etat: 'refus'; motif: string } | { etat: 'non_rattache' } | { etat: 'inconnu' } | { etat: 'sans_schema' };

export async function modifierDossierLocation(activiteId: number, brut: Record<string, unknown>, auteur: Auteur): Promise<IssueModificationDossier> {
  const l = await lireDossierLocation(activiteId);
  if (l.etat !== 'ok') return l;
  const lu = l.data;
  const s = lireSaisieDossier(brut, lu);
  if (s.version !== lu.version) return { etat: 'conflit', motif: motifConflitFiche(await derniereModification(lu)) };
  const refus = refusDossier(lu, s, { indice: await indiceDuBailDisponible(), charges: lu.conditions?.valeurs.chargesCopro !== undefined });
  if (refus !== null) return { etat: 'refus', motif: refus };
  const changements = changementsDossier(lu, s, await nomsDuDossier());
  if (changements.length === 0) return { etat: 'ok', data: { changements } };
  const faits: string[] = [];
  const partiel = (motif: string): IssueModificationDossier => ({ etat: 'refus', motif: faits.length === 0 ? motif : `${motif} Ont été enregistrés : ${faits.join(', ')}.` });

  // ① LES LOCATAIRES — la fiche de l'annuaire (source unique), par son geste (journal par champ, copie du nom suivie).
  for (const loc of s.locataires) {
    const carte = lu.locataires.find((x) => x.id === loc.id);
    const qui = carte === undefined ? '' : `${[carte.nom, carte.prenom].filter((x) => x).join(' ')} — `;
    const siens = changements.filter((c) => c.bloc === 1 && c.champ.startsWith(qui));
    if (carte === undefined || siens.length === 0) continue;
    const r = await modifierPersonne('locataire', loc.id, loc.champs as Parameters<typeof modifierPersonne>[2], auteur);
    if (r.etat !== 'ok') return partiel('motif' in r ? r.motif : 'La fiche du locataire n’a pas pu être modifiée.');
    faits.push(...siens.map((c) => c.champ));
  }
  // ③ LES CONDITIONS D'ENTRÉE (une nouvelle version pour le bail) ; l'ENTRETIEN du bien (sa fiche).
  const cond = changements.filter((c) => c.bloc === 3 && c.champ !== 'Entretien à prévoir' && c.champ !== 'Entretiens' && c.champ !== 'Paiement des charges');
  if (cond.length > 0 && lu.conditions !== null && s.conditions !== null) {
    const r = await modifierConditionsEntree(lu.conditions.occupationId, { ...versEnvoiConditions(s.conditions), loyer: { ...s.conditions.loyer } }, auteur);
    if (r.etat !== 'ok') return partiel('motif' in r && typeof r.motif === 'string' ? r.motif : 'Les conditions d’entrée n’ont pas pu être modifiées.');
    await journaliserChamps({ entite: 'location_bail', id: lu.bailId, lotId: lu.lotId, action: 'location_dossier_conditions', changements: cond, auteur });
    faits.push(...cond.map((c) => c.champ));
  }
  // 🔴 Arno (25/10/2026) — le paiement des charges : sur le BIEN (sa colonne, son Historique), et au journal du bail comme le reste.
  const ch3 = changements.filter((c) => c.bloc === 3 && c.champ === 'Paiement des charges');
  const nouvelles = s.conditions?.chargesCopro;
  if (ch3.length > 0 && (nouvelles === 'agence' || nouvelles === 'proprietaire')) {
    const ok = await withTransaction((q) => ecrireChargesCoproDans(q, lu.lotId, nouvelles, auteur, 'Dossier de location'));
    if (!ok) return partiel('Le paiement des charges n’a pas pu être enregistré : ce bien n’existe plus.');
    await journaliserChamps({ entite: 'location_bail', id: lu.bailId, lotId: lu.lotId, action: 'location_dossier_conditions', changements: ch3, auteur });
    faits.push(...ch3.map((c) => c.champ));
  }
  const ent = changements.filter((c) => c.bloc === 3 && (c.champ === 'Entretien à prévoir' || c.champ === 'Entretiens'));
  if (ent.length > 0 && s.entretien !== null) {
    const r = await modifierEncartBien(lu.lotId, 'dpe', {
      entretienAPrevoir: s.entretien.aPrevoir === true ? 'oui' : s.entretien.aPrevoir === false ? 'non' : '',
      entretiens: entretiensEnTexte(s.entretien.aPrevoir === true ? s.entretien.entretiens : []),
    }, auteur);
    if (r.etat !== 'ok') return partiel('motif' in r && typeof r.motif === 'string' ? r.motif : 'L’entretien du bien n’a pas pu être modifié.');
    faits.push(...ent.map((c) => c.champ));
  }
  // ④ LE SUIVI COMMERCIAL — la MÊME ligne, mise à jour.
  const suivi = changements.filter((c) => c.bloc === 4);
  if (suivi.length > 0) {
    const conserver = s.suivi.apporteurTaux === lu.suivi.apporteurTaux && s.suivi.commissionApporteur === lu.suivi.commissionApporteur;
    const r = await mettreAJourActivite(activiteId, s.suivi, auteur, { conserverMontants: conserver });
    if (r.etat !== 'ok') return partiel('motif' in r ? r.motif : 'Le suivi commercial n’a pas pu être modifié.');
    await journaliserChamps({ entite: 'location_activite', id: activiteId, lotId: lu.lotId, action: 'location_dossier_suivi', changements: suivi, auteur });
    faits.push(...suivi.map((c) => c.champ));
  }
  return { etat: 'ok', data: { changements } };
}
