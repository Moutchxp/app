import { sqlStatutBien, statutBienDisponible } from '../gestion/statutBienRepo';
import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { fabriquerMessageId } from '../gestion/envoiGmail';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { complementsDuBien } from './creationBienRepo';
import { conditionsParOccupation } from './conditionsEntreeRepo';
import { loyerDesOccupations } from './loyerEntreeRepo';
import { dossierDuBail } from './brancheBailDriveRepo';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { lireDigicodeDuLot } from './digicodeImmeubleRepo';
import { memeBatimentQue } from './digicodeImmeuble';
import { mandatsDesProprietaires } from './mandatBienRepo';
import { libelleMandat, sorteDuBien } from './mandatBien';
import { lireGarantsDuBail } from '../gestion/partieCategorieRepo';
import { libelleEntretien } from './entretien';
import { LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, type TypeLocal, type TypeLogement, type TypeParking } from './bienComplet';
import {
  bandeauGli, estMobile, FORMAT_ADRESSE, htmlNouvelleLocation, lignesBailMail, listeProposee, lotDuMail, mentionEnvoi, nomAffiche,
  objetNouvelleLocation, statutProprietaires, texteNouvelleLocation, verifierDestinataires,
  type Destinataire, type DestinatairePropose, type DonneesNouvelleLocation, type GarantMail, type LotSource, type PersonneMail,
} from './mailNouvelleLocation';

/**
 * ══ 🔴🔴 LOCATION — LE MAIL « NOUVELLE LOCATION » (ENVOI ADHOC & MONGA) (Arno, 21/10/2026). IMPUR (base + envoi). ═══════════
 *
 * Tout est TIRÉ À LA SOURCE (aucune saisie de plus) : le bail (393), ses occupations et leurs lots, la fiche du bien (374-382),
 * ses propriétaires ACTIFS et leurs coordonnées, ses locataires et leurs garants (393, `gestion_bail_garant`) — et AUCUN autre
 * contact —, les conditions d'entrée et les honoraires ENREGISTRÉS (391-392, jamais recalculés), le loyer de départ (370), le
 * dossier N7 du bail sur le Drive (394).
 * LE CANAL : celui des mails de tâches et du portefeuille — l'API Gmail de gestion@criterimmo.fr (`transportParDefaut` :
 * factice sous les tests ; en RECETTE, le verrou réseau intercepte l'envoi et le dépose dans la boîte de test).
 * 🔴 RIEN NE PART SANS LE GESTE « Envoyer » : seul `envoyerNouvelleLocation` envoie, appelé par la route POST.
 * 🔴 CHAQUE ENVOI EST JOURNALISÉ (`gestion_location_mail_envoi`, migration 395) : bail, date, personne qui a envoyé, liste
 *    réelle des destinataires, objet, statut, erreur. Sans la 395, aucun envoi (le journal est une condition de l'envoi).
 */

export function mailNouvelleLocationDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_mail_envoi', 'bail_id');
}

/** La liste par défaut des destinataires, si la base ne la porte pas encore (amorce de la migration 395). */
export const DESTINATAIRES_DEFAUT: readonly Destinataire[] = [
  { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
  { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' },
  { adresse: 'laura@monga.io', libelle: 'MONGA' },
];

/** La liste configurée (la plus récente version) ; l'amorce sans la migration 395. */
export async function lireDestinatairesDefaut(): Promise<Destinataire[]> {
  if (!(await colonneExisteMemo('gestion_location_mail_destinataires', 'liste'))) return [...DESTINATAIRES_DEFAUT];
  const { rows } = await query<{ liste: unknown }>('SELECT liste FROM gestion_location_mail_destinataires ORDER BY id DESC LIMIT 1');
  if (rows[0] === undefined) return [...DESTINATAIRES_DEFAUT];
  const v = verifierDestinataires(rows[0].liste);
  return v.ok ? v.liste : [];
}

const present = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== '';
const adressePostale = (a: string | null, cp: string | null, commune: string | null): string | null => {
  const ville = [cp, commune].filter(present).join(' ');
  const t = [a, ville].filter(present).join(', ');
  return t === '' ? null : t;
};

interface CoordonneeLue { sujet_id: string; sorte: string; v: string | null; libelle: string | null }

/** Range des coordonnées brutes : mobiles, fixes, e-mails (sans doublon, dans l'ordre de la fiche). PUR. */
export function rangerCoordonnees(c: readonly { sorte: string; valeur: string | null; libelle: string | null }[]): Pick<PersonneMail, 'mobiles' | 'fixes' | 'emails'> {
  const mobiles: string[] = []; const fixes: string[] = []; const emails: string[] = [];
  const vus = new Set<string>();
  for (const x of c) {
    const v = (x.valeur ?? '').trim();
    if (v === '') continue;
    const cle = x.sorte === 'email' ? `e:${v.toLowerCase()}` : `t:${v.replace(/[^\d+]/g, '')}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    if (x.sorte === 'email') { if (FORMAT_ADRESSE.test(v)) emails.push(v); continue; }
    if (x.sorte !== 'telephone') continue;
    const lib = (x.libelle ?? '').toLowerCase();
    const mobile = lib.includes('mobile') || lib.includes('portable') ? true : lib.includes('fixe') ? false : estMobile(v);
    (mobile ? mobiles : fixes).push(v);
  }
  return { mobiles, fixes, emails };
}

async function coordonneesDe(sujet: 'proprietaire' | 'locataire', ids: readonly string[]): Promise<Map<string, CoordonneeLue[]>> {
  const carte = new Map<string, CoordonneeLue[]>();
  if (ids.length === 0) return carte;
  const vivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<CoordonneeLue>(
    `SELECT c.sujet_id::text, c.sorte, coalesce(nullif(btrim(c.valeur_brute), ''), c.valeur) AS v, c.libelle
       FROM gestion_annuaire_contact c
      WHERE c.sujet = $1 AND c.sujet_id = ANY($2::bigint[]) AND c.absent_le IS NULL${vivante}
      ORDER BY c.rang NULLS LAST, c.id`, [sujet, ids.map(Number)]);
  for (const r of rows) carte.set(r.sujet_id, [...(carte.get(r.sujet_id) ?? []), r]);
  return carte;
}

const personne = (r: { civilite: string | null; nom: string | null; nom_complet?: string | null; prenom: string | null; qualite: string | null;
  adresse: string | null; code_postal: string | null; commune: string | null; note: string | null }, coord: readonly CoordonneeLue[]): PersonneMail => ({
  civilite: r.civilite, nom: present(r.nom) ? r.nom.trim() : (r.nom_complet ?? '').trim(), prenom: present(r.nom) ? r.prenom : null,
  qualite: r.qualite, adresse: adressePostale(r.adresse, r.code_postal, r.commune), note: r.note,
  ...rangerCoordonnees(coord.map((c) => ({ sorte: c.sorte, valeur: c.v, libelle: c.libelle }))),
});

interface LotSql {
  id: string; categorie: string | null; type_logement: string | null; type_local: string | null; nature: string | null; type_bien: string | null;
  nombre_pieces: number | null; meuble: boolean | null; nom_annexe: string | null; parking_situation: string | null; parking_type: string | null;
  adresse: string | null; code_postal: string | null; commune: string | null; adresse_autre: boolean | null;
  porte: string | null; num_lot_copro: string | null; batiment: string | null; escalier: string | null; etage: string | null;
  precision_acces: string | null; ascenseur: boolean | null; digicode: boolean | null; digicode_code: string | null;
  surface_habitable_m2: string | null; surface_carrez_m2: string | null; surface_exterieure_m2: string | null; surface_m2: string | null;
  epoque_construction: string | null; chauffage: string | null; dpe_classe: string | null; dpe_date: string | null; dpe_non_soumis: boolean | null;
  assurance_pno: boolean | null; pno_date_anniversaire: string | null; annotation: string | null; commentaire: string | null;
}

/** Le libellé du type d'un lot principal (logement, local, parking nu), sinon sa nature importée. PUR. */
function typeDuLot(r: LotSql): string | null {
  if (r.type_logement !== null) return LIBELLE_TYPE_LOGEMENT[r.type_logement as TypeLogement] ?? r.type_logement;
  if (r.type_local !== null) return LIBELLE_TYPE_LOCAL[r.type_local as TypeLocal] ?? r.type_local;
  if (r.parking_type !== null) return `Parking · ${(LIBELLE_TYPE_PARKING[r.parking_type as TypeParking] ?? r.parking_type).toLowerCase()}`;
  return r.nature ?? r.type_bien;
}

/**
 * RASSEMBLE ce que dit le mail d'un bail. `null` : bail inconnu. Lecture seule.
 */
export async function donneesNouvelleLocation(bailId: number): Promise<DonneesNouvelleLocation | null> {
  const { rows: bl } = await query<{ lot_id: string; entree: string | null }>('SELECT lot_id::text, entree::text FROM gestion_bail WHERE id = $1', [bailId]);
  const bail = bl[0];
  if (bail === undefined) return null;
  const principalId = bail.lot_id;
  const { rows: occ } = await query<{ id: string; lot_id: string; locataire_id: string }>(
    'SELECT id::text, lot_id::text, locataire_id::text FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY id', [bailId]);
  const lotIds = [...new Set([principalId, ...occ.map((o) => o.lot_id)])];

  // ── Les lots du bail : le principal (le bien du bail) et ses annexes louées.
  const col = async (c: string, type = 'text'): Promise<string> => ((await colonneExisteMemo('gestion_annuaire_lot', c)) ? `lo.${c}` : `NULL::${type} AS ${c}`);
  const colonnes = await Promise.all([
    col('categorie'), col('type_logement'), col('type_local'), col('nombre_pieces', 'int'), col('meuble', 'boolean'), col('nom_annexe'),
    col('parking_situation'), col('parking_type'), col('adresse_autre', 'boolean'), col('porte'), col('num_lot_copro'), col('batiment'), col('escalier'),
    col('etage'), col('precision_acces'), col('ascenseur', 'boolean'), col('digicode', 'boolean'), col('digicode_code'),
    col('epoque_construction'), col('chauffage'), col('dpe_classe'), col('dpe_non_soumis', 'boolean'), col('assurance_pno', 'boolean'),
    col('annotation'), col('commentaire'),
  ]);
  const texteDe = async (c: string): Promise<string> => ((await colonneExisteMemo('gestion_annuaire_lot', c)) ? `lo.${c}::text AS ${c}` : `NULL::text AS ${c}`);
  const nombres = await Promise.all(['surface_habitable_m2', 'surface_carrez_m2', 'surface_exterieure_m2', 'surface_m2', 'dpe_date', 'pno_date_anniversaire'].map(texteDe));
  const { rows: lotsSql } = await query<LotSql>(
    `SELECT lo.id::text, lo.nature, lo.type_bien, lo.adresse, lo.code_postal, lo.commune, ${[...colonnes, ...nombres].join(', ')}
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[]) ORDER BY (lo.id = $2) DESC, lo.id`, [lotIds.map(Number), Number(principalId)]);
  const principal = lotsSql.find((l) => l.id === principalId);
  const complements = await complementsDuBien(Number(principalId)).catch(() => null);
  const digis = new Map(await Promise.all(lotsSql.map(async (r) => [r.id, await lireDigicodeDuLot(Number(r.id)).catch(() => null)] as const)));
  const adresseBien = { voie: principal?.adresse ?? null, codePostal: principal?.code_postal ?? null, commune: principal?.commune ?? null };
  const repeteLePrincipal = (r: LotSql): boolean => r.id !== principalId && principal !== undefined && memeBatimentQue(
    { voie: r.adresse_autre === false ? null : r.adresse, codePostal: r.code_postal, commune: r.commune, batiment: r.batiment },
    { voie: principal.adresse, codePostal: principal.code_postal, commune: principal.commune, batiment: principal.batiment });
  const lots = lotsSql.map((r) => {
    const estPrincipal = r.id === principalId;
    const source: LotSource = {
      id: Number(r.id), principal: estPrincipal, categorie: r.categorie, typeLibelle: estPrincipal ? typeDuLot(r) : null,
      nombrePieces: r.nombre_pieces, meuble: r.meuble, nomAnnexe: r.nom_annexe, parkingSituation: r.parking_situation, parkingType: r.parking_type,
      // Une annexe « même adresse » (adresse_autre = non) prend celle du logement ; sinon la sienne, si elle en a une.
      voie: !estPrincipal && r.adresse_autre === false ? null : r.adresse, codePostal: r.code_postal, commune: r.commune,
      porte: r.porte, numLotCopro: r.num_lot_copro, batiment: r.batiment, escalier: r.escalier, etage: r.etage,
      precisionAcces: r.precision_acces, ascenseur: r.ascenseur,
      // Arno (21/10/2026, 396) : le digicode est celui de l'IMMEUBLE de l'adresse (sans la 396 : celui du bien) ; 399 : celui
      // du BÂTIMENT du lot (le code général sans bâtiment, ou si le bâtiment n'en a pas). Une annexe ne le répète que si son
      // bâtiment diffère de celui du logement.
      ...(repeteLePrincipal(r) ? { digicode: null, digicodeCode: null } : {
        digicode: digis.get(r.id) === undefined || digis.get(r.id) === null ? r.digicode : digis.get(r.id)!.digicode,
        digicodeCode: digis.get(r.id) === undefined || digis.get(r.id) === null ? r.digicode_code : digis.get(r.id)!.code,
      }),
      surfaceHabitable: r.surface_habitable_m2, surfaceCarrez: r.surface_carrez_m2, surfaceExterieure: r.surface_exterieure_m2, surface: r.surface_m2,
      construction: r.epoque_construction, chauffage: r.chauffage, dpeClasse: r.dpe_classe, dpeDate: r.dpe_date, dpeNonSoumis: r.dpe_non_soumis,
      syndic: estPrincipal ? complements?.syndicNom ?? null : null, derniereAg: estPrincipal ? complements?.derniereAg ?? null : null,
      // Arno (21/10/2026, 400) : « Paiement des charges » du bien loué (lot principal seulement).
      chargesCopro: estPrincipal ? complements?.chargesCopro ?? null : null,
      assurancePno: r.assurance_pno, pnoAnniversaire: r.pno_date_anniversaire,
      entretiens: estPrincipal && complements?.entretienAPrevoir === true
        ? (complements.entretiens ?? []).map((e) => `${libelleEntretien(e)}${e.dateAnniversaire ? ` · date anniversaire le ${e.dateAnniversaire.split('-').reverse().join('/')}` : ''}`) : [],
      annotation: r.annotation, commentaire: r.commentaire,
    };
    return lotDuMail(source, adresseBien);
  });

  // ── Les propriétaires ACTIFS du bien (le propriétaire de la fiche, puis ses copropriétaires).
  const actif = `p.archive_le IS NULL AND p.supprime_le IS NULL${(await colonneExisteMemo('gestion_annuaire_proprietaire', 'sorti_portefeuille_le')) ? ' AND p.sorti_portefeuille_le IS NULL' : ''}`;
  const mandat = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'numero_mandat_gestion')) ? 'p.numero_mandat_gestion' : 'NULL::text';
  const { rows: pr } = await query<{ id: string; civilite: string | null; nom: string | null; nom_complet: string | null; prenom: string | null; qualite: string | null;
    adresse: string | null; code_postal: string | null; commune: string | null; note: string | null; relation_depuis: string | null; mandat: string | null }>(
    `SELECT p.id::text, p.civilite, p.nom, p.nom_complet, p.prenom, p.qualite, p.adresse, p.code_postal, p.commune, p.note,
            p.relation_depuis::text, ${mandat} AS mandat
       FROM gestion_annuaire_proprietaire p
      WHERE p.id IN (SELECT proprietaire_id FROM gestion_annuaire_lot WHERE id = $1 AND proprietaire_id IS NOT NULL
                     UNION SELECT proprietaire_id FROM gestion_annuaire_lot_proprietaire WHERE lot_id = $1 AND jusqu_a IS NULL)
        AND ${actif}
      ORDER BY (p.id = (SELECT proprietaire_id FROM gestion_annuaire_lot WHERE id = $1)) DESC,
               (SELECT min(lp.rang) FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = $1 AND lp.proprietaire_id = p.id AND lp.jusqu_a IS NULL) NULLS LAST, p.id`,
    [Number(principalId)]);
  const coordP = await coordonneesDe('proprietaire', pr.map((p) => p.id));
  const proprietaires = pr.map((p) => personne(p, coordP.get(p.id) ?? []));

  // ── Leur historique (la règle « nouveau / déjà en gestion », `statutProprietaires`).
  const enGestion = (await colonneExisteMemo('gestion_annuaire_lot', 'en_gestion')) ? ' AND lo.en_gestion IS NOT FALSE' : '';
  const sortie = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? ' AND lo.sorti_portefeuille_le IS NULL' : '';
  const biensDe = (p: string): string => `(lo.proprietaire_id = ${p} OR lo.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = ${p} AND lp.jusqu_a IS NULL))`;
  // Arno (21/10/2026, 403) : avec le statut du bien, « en gestion » = statut « en gestion » (sa seule vérité) ; sans lui, comme avant.
  const enPortefeuille = `${(await statutBienDisponible()) ? ` AND lo.statut_bien = 'en_gestion'`
    : `${enGestion}${sortie} AND (lo.gestion_fin IS NULL OR lo.gestion_fin > ${SQL_AUJOURDHUI_PARIS})`}
    AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id)`;
  const { rows: hist } = pr.length === 0 ? { rows: [] } : await query<{ id: string; autres: number; debut: string | null }>(
    `SELECT p.id::text,
            (SELECT count(*)::int FROM gestion_annuaire_lot lo WHERE ${biensDe('p.id')}${enPortefeuille} AND lo.id <> ALL($2::bigint[])) AS autres,
            (SELECT min(lo.gestion_debut)::text FROM gestion_annuaire_lot lo WHERE ${biensDe('p.id')}) AS debut
       FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[])`, [pr.map((p) => Number(p.id)), lotIds.map(Number)]);
  const { rows: anc } = await query<{ ancien: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM gestion_bail b, gestion_bail g WHERE g.id = $1 AND b.lot_id = g.lot_id AND b.id <> g.id AND b.entree < g.entree) AS ancien`, [bailId]);
  const ancienBail = anc[0]?.ancien === true;
  const { rows: total } = pr.length === 0 ? { rows: [{ n: 0 }] } : await query<{ n: number }>(
    `SELECT count(DISTINCT lo.id)::int AS n FROM gestion_annuaire_lot lo, unnest($1::bigint[]) AS x(pid)
      WHERE ${biensDe('x.pid')}${enPortefeuille}`, [pr.map((p) => Number(p.id))]);
  const statut = statutProprietaires({
    proprietaires: pr.map((p, i) => {
      const h = hist.find((x) => x.id === p.id);
      const dates = [h?.debut ?? null, p.relation_depuis].filter((x): x is string => x !== null).sort();
      return { nom: nomAffiche(proprietaires[i]), dejaEnGestion: (h?.autres ?? 0) > 0 || ancienBail, depuis: dates[0] ?? null };
    }),
    biensEnGestion: total[0]?.n ?? 0, mandats: pr.map((p) => p.mandat ?? ''),
    // Arno (21/10/2026, 397) : le mandat DU BIEN — gestion ou transaction locative selon « Bien en gestion ? », n° et date.
    mandatLibelles: await (async () => {
      // Arno (21/10/2026, 403) : lu sur le STATUT du bien (location seule → transaction ; sinon gestion).
      const g = (await query<{ s: string }>(`SELECT ${await sqlStatutBien('lo')} AS s FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [Number(principalId)]))
        .rows[0]?.s !== 'location_seule';
      const sorte = sorteDuBien(g) ?? 'gestion';
      return (await mandatsDesProprietaires(pr.map((p) => Number(p.id)))).map((p) => libelleMandat(sorte, p[sorte])).filter((x): x is string => x !== null);
    })(),
  });

  // ── Les locataires du bail (dans l'ordre de saisie) et leurs garants — AUCUN autre contact.
  const { rows: lo } = await query<{ id: string; civilite: string | null; nom: string | null; prenom: string | null; qualite: string | null;
    adresse: string | null; code_postal: string | null; commune: string | null; note: string | null }>(
    `SELECT l.id::text, l.civilite, l.nom, l.prenom, l.qualite, l.adresse, l.code_postal, l.commune, l.note
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.bail_id = $1 GROUP BY l.id ORDER BY min(o.id)`, [bailId]);
  const coordL = await coordonneesDe('locataire', lo.map((l) => l.id));
  const locataires = lo.map((l) => personne(l, coordL.get(l.id) ?? []));
  const nomDuLocataire = new Map(lo.map((l, i) => [l.id, nomAffiche(locataires[i])]));
  const garants: GarantMail[] = [];
  {
    const ga = await lireGarantsDuBail(bailId);
    for (const g of ga) {
      const extra = Array.isArray(g.coordonnees) ? (g.coordonnees as { sorte?: unknown; valeur?: unknown; libelle?: unknown }[]) : [];
      garants.push({
        civilite: g.civilite, nom: (g.nom ?? '').trim(), prenom: g.prenom, qualite: g.qualite, note: g.note,
        adresse: adressePostale(g.adresse_postale, g.code_postal, g.commune),
        ...rangerCoordonnees([
          { sorte: 'telephone', valeur: g.telephone, libelle: null }, { sorte: 'email', valeur: g.adresse, libelle: null },
          ...extra.map((x) => ({ sorte: String(x.sorte ?? ''), valeur: typeof x.valeur === 'string' ? x.valeur : null, libelle: typeof x.libelle === 'string' ? x.libelle : null })),
        ]),
        garantit: [...new Set(g.garantis.map((id) => nomDuLocataire.get(id)).filter((x): x is string => x !== undefined))],
      });
    }
  }

  // ── Le bail : conditions d'entrée et honoraires ENREGISTRÉS, loyer de départ.
  const conditions = occ.length === 0 ? null : [...(await conditionsParOccupation(occ.map((o) => Number(o.id)))).values()][0] ?? null;
  const drive = await dossierDuBail(bailId).catch(() => null);
  const config = await chargerConfigGestion();
  const entree = bail.entree ?? '';
  return {
    bailId, entree, bien: adresseBien, statut, proprietaires, lots,
    gli: bandeauGli(conditions === null ? null : {
      assurance: conditions.conditions.assurance, precision: conditions.conditions.assurancePrecision, garantPhysique: conditions.conditions.garant,
    }, garants.map((g) => nomAffiche(g))),
    locataires, garants,
    bail: { loyer: conditions?.loyer ?? (occ.length === 0 ? null : await loyerDesOccupations(occ.map((o) => Number(o.id)))), lignes: lignesBailMail(entree, conditions?.conditions ?? null, conditions?.honoraires ?? null) },
    driveUrl: drive === null ? null : `https://drive.google.com/drive/folders/${encodeURIComponent(drive.driveId)}`,
    expediteur: config.adresseGestion,
  };
}

// ── LE JOURNAL ET L'ENVOI ────────────────────────────────────────────────────────────────────────────────────────────────

/** Une borne de sûreté seulement (le message est « sans limite » à l'écran) : 100 000 caractères. */
export const MESSAGE_MAX = 100_000;

export interface EnvoiJournalise { quand: string; par: string; destinataires: string[]; objet: string; mention: string }

/** Le dernier envoi RÉUSSI pour ce bail (`null` : jamais envoyé, ou sans la migration 395). */
export async function dernierEnvoi(bailId: number): Promise<EnvoiJournalise | null> {
  if (!(await mailNouvelleLocationDisponible())) return null;
  const { rows } = await query<{ quand: string; par: string; destinataires: { adresse?: string }[]; objet: string }>(
    `SELECT envoye_le::text AS quand, auteur_libelle AS par, destinataires, objet FROM gestion_location_mail_envoi
      WHERE bail_id = $1 AND statut = 'envoye' ORDER BY envoye_le DESC, id DESC LIMIT 1`, [bailId]);
  const r = rows[0];
  if (r === undefined) return null;
  const destinataires = (Array.isArray(r.destinataires) ? r.destinataires : []).map((d) => d.adresse ?? '').filter((x) => x !== '');
  return { quand: r.quand, par: r.par, destinataires, objet: r.objet, mention: mentionEnvoi({ quand: r.quand, par: r.par, destinataires }) };
}

export interface ApercuNouvelleLocation {
  bailId: number; objet: string; html: string; texte: string; expediteur: string;
  /** Les données du mail (pour l'aperçu en direct du message d'accompagnement) et le nom de la personne connectée. */
  donnees: DonneesNouvelleLocation; auteurNom: string;
  /** Proposés pour CET envoi : la copie personnelle en tête, puis la liste configurée. */
  destinataires: DestinatairePropose[];
  dernierEnvoi: EnvoiJournalise | null;
  /** Faux sans la migration 395 : l'aperçu se lit, l'envoi est refusé (le journal manque). */
  envoiPossible: boolean;
}

/** L'APERÇU de la fenêtre de confirmation. Lecture seule : rien n'est envoyé. */
export async function apercuNouvelleLocation(bailId: number, auteur: Auteur): Promise<ApercuNouvelleLocation | null> {
  const d = await donneesNouvelleLocation(bailId);
  if (d === null) return null;
  const session = await emailDeLAuteur(auteur);
  return {
    bailId, objet: objetNouvelleLocation(d), html: htmlNouvelleLocation(d), texte: texteNouvelleLocation(d), expediteur: d.expediteur,
    donnees: d, auteurNom: session.nom,
    destinataires: listeProposee(await lireDestinatairesDefaut(), session), dernierEnvoi: await dernierEnvoi(bailId),
    envoiPossible: await mailNouvelleLocationDisponible(),
  };
}

export type IssueEnvoiNouvelleLocation =
  | { etat: 'ok'; data: { n: number; envoi: EnvoiJournalise } }
  | { etat: 'echec'; motif: string }
  | { etat: 'refus'; motif: string }
  | { etat: 'sans_schema' }
  | { etat: 'inconnu' };

async function journaliser(o: { bailId: number; auteur: Auteur; nom: string; email: string | null; liste: Destinataire[]; expediteur: string;
  objet: string; statut: 'envoye' | 'echec'; erreur: string | null; messageId: string | null; message: string | null }): Promise<string | null> {
  try {
    // Arno (21/10/2026, 398) : le message d'accompagnement, dans le journal — avec sa colonne seulement (sans la 398 : comme avant).
    const avecMessage = await colonneExisteMemo('gestion_location_mail_envoi', 'message');
    const { rows } = await query<{ quand: string }>(
      `INSERT INTO gestion_location_mail_envoi (bail_id, auteur_id, auteur_libelle, auteur_email, destinataires, expediteur, objet, statut, erreur, message_id${avecMessage ? ', message' : ''})
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10${avecMessage ? ', $11' : ''}) RETURNING envoye_le::text AS quand`,
      [o.bailId, o.auteur.id, o.nom, o.email, JSON.stringify(o.liste), o.expediteur, o.objet, o.statut, o.erreur, o.messageId, ...(avecMessage ? [o.message] : [])]);
    return rows[0]?.quand ?? null;
  } catch (e) {
    console.error('[location] journal du mail « nouvelle location » impossible', (e as Error)?.message);
    return null;
  }
}

/**
 * ENVOIE le mail « Nouvelle location » à la liste CONFIRMÉE dans la fenêtre (modifiable pour cet envoi seulement : la
 * configuration n'est pas touchée). Une seule tentative ; le résultat (réussi ou non) est journalisé. Ne lève jamais.
 */
export async function envoyerNouvelleLocation(bailId: number, brut: unknown, auteur: Auteur,
  deps: { transport?: TransportDemande } = {}, messageBrut: unknown = null): Promise<IssueEnvoiNouvelleLocation> {
  if (!(await mailNouvelleLocationDisponible())) return { etat: 'sans_schema' };
  const v = verifierDestinataires(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  // Arno (21/10/2026) — le message d'accompagnement (facultatif, sans limite pratique) : vide = aucun encart.
  const message = typeof messageBrut === 'string' && messageBrut.trim() !== '' ? messageBrut.replace(/\r\n?/g, '\n') : null;
  if (message !== null && message.length > MESSAGE_MAX) return { etat: 'refus', motif: `Le message d’accompagnement dépasse ${MESSAGE_MAX.toLocaleString('fr-FR')} caractères.` };
  const session = await emailDeLAuteur(auteur);
  let objet = 'Nouvelle location';
  let expediteur = 'gestion@criterimmo.fr';
  try {
    const lu = await donneesNouvelleLocation(bailId);
    if (lu === null) return { etat: 'inconnu' };
    const d: DonneesNouvelleLocation = { ...lu, message: message === null ? null : { auteur: session.nom, texte: message } };
    objet = objetNouvelleLocation(d);
    expediteur = d.expediteur;
    const domaine = expediteur.split('@')[1] ?? 'criterimmo.fr';
    const messageId = fabriquerMessageId(domaine, randomBytes(12).toString('hex'), new Date());
    const r = await (deps.transport ?? transportParDefaut()).envoyer({
      de: expediteur, deNom: 'Gestion', a: v.liste.map((x) => x.adresse), cc: [], cci: [], objet,
      corps: texteNouvelleLocation(d), corpsHtml: htmlNouvelleLocation(d), messageId,
    });
    if (!r.ok) {
      await journaliser({ bailId, auteur, nom: session.nom, email: session.email, liste: v.liste, expediteur, objet, statut: 'echec', erreur: r.motif, messageId: null, message });
      return { etat: 'echec', motif: r.motif };
    }
    const quand = (await journaliser({ bailId, auteur, nom: session.nom, email: session.email, liste: v.liste, expediteur, objet, statut: 'envoye', erreur: null, messageId, message }))
      ?? new Date().toISOString();
    const destinataires = v.liste.map((x) => x.adresse);
    return { etat: 'ok', data: { n: destinataires.length, envoi: { quand, par: session.nom, destinataires, objet, mention: mentionEnvoi({ quand, par: session.nom, destinataires }) } } };
  } catch (e) {
    const motif = (e as Error)?.message || 'erreur inattendue';
    console.error('[location] mail « nouvelle location » non envoyé', motif);
    await journaliser({ bailId, auteur, nom: session.nom, email: session.email, liste: v.liste, expediteur, objet, statut: 'echec', erreur: motif, messageId: null, message });
    return { etat: 'echec', motif };
  }
}

/** Les baux EN COURS d'un locataire (pour le bouton de sa fiche), du plus récent au plus ancien, avec leur dernier envoi. */
export async function bauxEnCoursDuLocataire(locataireId: number): Promise<{ bailId: number; titre: string; entree: string | null; dernierEnvoi: EnvoiJournalise | null }[]> {
  if (!(await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id'))) return [];
  const { rows } = await query<{ id: string; entree: string | null; adresse: string | null; commune: string | null }>(
    `SELECT g.id::text, g.entree::text, lo.adresse, lo.commune FROM gestion_bail g JOIN gestion_annuaire_lot lo ON lo.id = g.lot_id
      WHERE g.sortie IS NULL AND g.id IN (SELECT o.bail_id FROM gestion_annuaire_occupation o WHERE o.locataire_id = $1 AND o.sortie IS NULL)
      ORDER BY g.entree DESC NULLS LAST, g.id DESC`, [locataireId]);
  const sortie = [];
  for (const r of rows) {
    sortie.push({ bailId: Number(r.id), titre: [r.adresse, r.commune].filter(present).join(', ') || `Bail ${r.id}`, entree: r.entree, dernierEnvoi: await dernierEnvoi(Number(r.id)) });
  }
  return sortie;
}

/**
 * Arno (21/10/2026) — le BAIL EN COURS de chaque bien demandé (carte du bien dans la fiche propriétaire de la Gestion, fiche du
 * bien), avec son dernier envoi : le bouton discret « Envoyer à ADHOC & MONGA ». Un bien sans bail en cours est absent du
 * résultat (pas de bouton). Le bail d'un bien : celui posé sur lui, ou celui d'une occupation en cours sur lui (ses annexes) ;
 * plusieurs : le plus récent. Lecture seule.
 */
export async function bauxEnCoursDesLots(lotIds: readonly number[]): Promise<Record<string, { bailId: number; entree: string | null; dernierEnvoi: EnvoiJournalise | null }>> {
  const ids = [...new Set(lotIds)].filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 200);
  if (ids.length === 0 || !(await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id'))) return {};
  const { rows } = await query<{ lot: string; id: string; entree: string | null }>(
    `SELECT DISTINCT ON (x.lot) x.lot::text AS lot, g.id::text, g.entree::text
       FROM (SELECT g.id AS bail, g.lot_id AS lot FROM gestion_bail g WHERE g.sortie IS NULL AND g.lot_id = ANY($1::bigint[])
             UNION
             SELECT o.bail_id, o.lot_id FROM gestion_annuaire_occupation o
              WHERE o.bail_id IS NOT NULL AND o.sortie IS NULL AND o.lot_id = ANY($1::bigint[])) x
       JOIN gestion_bail g ON g.id = x.bail AND g.sortie IS NULL
      ORDER BY x.lot, g.entree DESC NULLS LAST, g.id DESC`, [ids]);
  const sortie: Record<string, { bailId: number; entree: string | null; dernierEnvoi: EnvoiJournalise | null }> = {};
  for (const r of rows) sortie[r.lot] = { bailId: Number(r.id), entree: r.entree, dernierEnvoi: await dernierEnvoi(Number(r.id)) };
  return sortie;
}

/** Un envoi réussi du mail « Nouvelle location », tel que l'Historique du bien le montre. */
export interface EnvoiDuBien { id: number; bailId: number; quand: string; par: string; n: number; message: string | null }

/**
 * Arno (21/10/2026) — LES ENVOIS « NOUVELLE LOCATION » D'UN BIEN, pour son Historique : chaque envoi RÉUSSI d'un bail posé sur ce
 * bien (ou dont une occupation l'a loué), du plus récent au plus ancien, avec le message d'accompagnement s'il y en a un
 * (migration 398). Sans le journal (395) : aucun. Lecture seule.
 */
export async function envoisDuBien(lotId: number): Promise<EnvoiDuBien[]> {
  if (!(await mailNouvelleLocationDisponible())) return [];
  const avecMessage = await colonneExisteMemo('gestion_location_mail_envoi', 'message');
  const avecOccupations = await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id');
  const { rows } = await query<{ id: string; bail_id: string; quand: string; par: string; n: number; message: string | null }>(
    `SELECT e.id::text, e.bail_id::text, e.envoye_le::text AS quand, e.auteur_libelle AS par,
            CASE WHEN jsonb_typeof(e.destinataires) = 'array' THEN jsonb_array_length(e.destinataires) ELSE 0 END AS n,
            ${avecMessage ? 'e.message' : 'NULL::text AS message'}
       FROM gestion_location_mail_envoi e JOIN gestion_bail g ON g.id = e.bail_id
      WHERE e.statut = 'envoye' AND (g.lot_id = $1${avecOccupations
        ? ' OR g.id IN (SELECT o.bail_id FROM gestion_annuaire_occupation o WHERE o.lot_id = $1 AND o.bail_id IS NOT NULL)' : ''})
      ORDER BY e.envoye_le DESC, e.id DESC LIMIT 200`, [lotId]);
  return rows.map((r) => ({ id: Number(r.id), bailId: Number(r.bail_id), quand: r.quand, par: r.par, n: Number(r.n), message: r.message }));
}
