import 'server-only';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { journaliserChamps, lireDossierLocation, modifierDossierLocation, nomsDuDossier } from './dossierLocationRepo';
import { changementsSuivi, type ChangementDossier } from './dossierLocation';
import { annuaireDisponible, enregistrerActiviteBail } from './suivi/suiviRepo';
import { bailEnPlace, bauxEnPlace } from './rentreOccupeRepo';
import { libelleOrigineContact, type OrigineContact, type TypeActivite } from './suivi/suivi';
import { suiviValide, type BailDuLocataire, type ConversionLue, type CourantSuivi, type LectureSuiviLocataire, type ResumeLigneSuivi } from './suiviLocataire';

/**
 * ══ 🔴🔴 « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE (Arno, 26/10/2026) — LECTURE ET ENREGISTREMENT ═══════════════════════════════════
 * LECTURE : les baux du locataire (ses occupations), leurs lignes de suivi vivantes ; la ligne COURANTE — celle de la ligne du Suivi
 * d'où l'on vient (`activiteId`), sinon la ligne « Bail » (ou « Mandat de gestion seul ») du bail demandé, sinon du bail en cours le plus
 * récent — lue par le Dossier de location (`lireDossierLocation` : les mêmes valeurs, la même version) ; les autres baux et lignes, pour
 * la liste repliée (lecture seule, rien n'est fusionné).
 * ENREGISTREMENT : la ligne existe → le chemin du Dossier de location (`modifierDossierLocation`, bloc 4 seul : la MÊME ligne, conflit
 * refusé, journal par champ) ; aucune ligne → `enregistrerActiviteBail` la crée RATTACHÉE AU BAIL (une seule par bail : l'index unique
 * de la 406, et un refus si une ligne est apparue depuis l'ouverture), puis chaque champ au journal. Aucune autre table n'est touchée.
 */
type Issue<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' } | { etat: 'inconnu' } | { etat: 'refus'; motif: string } | { etat: 'conflit'; motif: string };

const n = (v: unknown): number => Number(v);
const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);

interface LigneLue extends ResumeLigneSuivi { bailId: number }

async function lignesDesBaux(baux: readonly number[]): Promise<LigneLue[]> {
  if (baux.length === 0) return [];
  const avec411 = await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
  const avec431 = await colonneExisteMemo('gestion_location_activite', 'converti_le');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT a.id::text, a.bail_id::text, a.type, a.date_signature::text AS date_signature, a.origine_contact,
            ${avec411 ? 'a.origine_contact_precision' : 'NULL::text AS origine_contact_precision'},
            coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), nullif(btrim(a.negociateur_libelle), ''), u.identifiant, '') AS negociateur,
            coalesce(a.hono_proprietaire_ht, 0) + coalesce(a.hono_locataire_ht, 0) AS hono,
            ${avec431 ? 'a.converti_le::text AS converti_le, a.converti_par_libelle, a.type_origine, a.date_signature_origine::text AS date_signature_origine'
              : 'NULL::text AS converti_le, NULL::text AS converti_par_libelle, NULL::text AS type_origine, NULL::text AS date_signature_origine'}
       FROM gestion_location_activite a LEFT JOIN admin_utilisateur u ON u.id = a.negociateur_id
      WHERE a.bail_id = ANY($1::bigint[]) AND a.annule_le IS NULL
      ORDER BY a.date_signature DESC, a.id DESC`, [[...baux]]);
  return rows.map((r) => {
    const origine = (r.origine_contact as OrigineContact | null) ?? null;
    const conversion: ConversionLue | null = r.converti_le === null || r.converti_le === undefined ? null
      : { le: String(r.converti_le), par: String(r.converti_par_libelle ?? ''), typeOrigine: String(r.type_origine ?? 'bail'), dateOrigine: String(r.date_signature_origine ?? '') };
    return {
      activiteId: n(r.id), bailId: n(r.bail_id), type: r.type as TypeActivite, dateSignature: String(r.date_signature), negociateur: String(r.negociateur ?? ''),
      origine: origine === null ? null : libelleOrigineContact(origine, (r.origine_contact_precision as string | null) ?? null), honoHt: n(r.hono),
      valide: suiviValide({ origineContact: origine }), conversion,
    };
  });
}

/** La ligne PRINCIPALE d'un bail : « Bail » d'abord, sinon « Mandat de gestion seul » (les avenants restent dans la liste). PUR. */
const lignePrincipale = (lignes: readonly LigneLue[], bailId: number): LigneLue | undefined =>
  lignes.find((l) => l.bailId === bailId && l.type === 'bail') ?? lignes.find((l) => l.bailId === bailId && l.type === 'gestion_seule');

export async function lireSuiviLocataire(locataireId: number, o: { bailId?: number | null; activiteId?: number | null;
  /** La ligne du Suivi d'où l'on vient n'a pas de bail (« non rattachée ») : rien n'est pris à sa place ; les baux restent consultables. */
  nonRattache?: boolean } = {}): Promise<Issue<LectureSuiviLocataire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const baux = (await query<{ id: string; entree: string | null; sortie: string | null; lot_id: string; titre: string }>(
    `SELECT DISTINCT b.id::text, b.entree::text AS entree, b.sortie::text AS sortie, b.lot_id::text,
            coalesce(nullif(btrim(concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), ''))), ''), 'Bien n° ' || l.id) AS titre
       FROM gestion_annuaire_occupation o JOIN gestion_bail b ON b.id = o.bail_id JOIN gestion_annuaire_lot l ON l.id = b.lot_id
      WHERE o.locataire_id = $1`, [locataireId])).rows
    .map((b) => ({ bailId: n(b.id), entree: b.entree, sortie: b.sortie, lotId: n(b.lot_id), titre: b.titre }))
    // Le bail en cours d'abord, puis le plus récent.
    .sort((x, y) => Number(x.sortie !== null) - Number(y.sortie !== null) || (y.entree ?? '').localeCompare(x.entree ?? '') || y.bailId - x.bailId);
  const lignes = await lignesDesBaux(baux.map((b) => b.bailId));

  let courant: CourantSuivi;
  let activiteCourante: number | null = null;
  let bailCourant: number | null = null;
  if (o.nonRattache === true) {
    activiteCourante = null;
  } else if (o.activiteId !== undefined && o.activiteId !== null) {
    // La ligne du Suivi d'où l'on vient : la sienne, et pas une autre (sans bail : « non rattachée »).
    activiteCourante = o.activiteId;
  } else {
    const b = baux.find((x) => x.bailId === o.bailId) ?? baux[0];
    bailCourant = b?.bailId ?? null;
    activiteCourante = b === undefined ? null : lignePrincipale(lignes, b.bailId)?.activiteId ?? null;
  }
  if (o.nonRattache === true) {
    courant = { sorte: 'non_rattache' };
  } else if (activiteCourante !== null) {
    const d = await lireDossierLocation(activiteCourante);
    if (d.etat === 'sans_schema') return d;
    if (d.etat === 'non_rattache') courant = { sorte: 'non_rattache' };
    else if (d.etat === 'inconnu') courant = { sorte: 'sans_bail' };
    else {
      const l = d.data;
      bailCourant = l.bailId;
      const conversion = lignes.find((x) => x.activiteId === activiteCourante)?.conversion ?? null;
      courant = {
        sorte: 'ligne', activiteId: l.activiteId, bailId: l.bailId, lotId: l.lotId, titre: titreBail(l.bien.titre, l.entree), version: l.version, suivi: l.suivi,
        valide: suiviValide(l.suivi), locataireIds: l.locataires.map((x) => x.id), conversion,
        // 🔴 430/431 — un « Mandat de gestion seul » (locataire en place) : montré comme tel, daté du mandat, sans honoraire de location.
        enPlace: l.suivi.type === 'gestion_seule' ? { dateMandat: l.suivi.dateSignature } : null,
      };
    }
  } else if (bailCourant !== null) {
    const b = baux.find((x) => x.bailId === bailCourant);
    const locs = (await query<{ id: string }>('SELECT DISTINCT locataire_id::text AS id FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY 1', [bailCourant])).rows.map((r) => n(r.id));
    const enPlace = await bailEnPlace(bailCourant)
      ? { dateMandat: (await bauxEnPlace({ locataireId })).find((x) => x.bailId === bailCourant)?.dateMandat ?? null } : null;
    courant = { sorte: 'sans_ligne', bailId: bailCourant, lotId: b?.lotId ?? 0, titre: titreBail(b?.titre ?? '', b?.entree ?? null), locataireIds: locs, enPlace };
  } else {
    courant = { sorte: 'sans_bail' };
  }
  // Les autres baux et lignes : tout sauf la ligne courante (un bail sans autre ligne que la courante n'est pas répété).
  const autres: BailDuLocataire[] = baux.map((b) => ({
    bailId: b.bailId, titre: b.titre, entree: b.entree, sortie: b.sortie,
    lignes: lignes.filter((l) => l.bailId === b.bailId && l.activiteId !== activiteCourante).map((l): ResumeLigneSuivi => ({
      activiteId: l.activiteId, type: l.type, dateSignature: l.dateSignature, negociateur: l.negociateur, origine: l.origine, honoHt: l.honoHt,
      valide: l.valide, conversion: l.conversion })),
  })).filter((b) => b.bailId !== bailCourant || b.lignes.length > 0);
  return { etat: 'ok', data: { locataireId, courant, autres } };
}

const titreBail = (adresse: string, entree: string | null): string =>
  `${adresse || 'Bien'}${entree !== null && /^\d{4}-\d{2}-\d{2}$/.test(entree) ? ` — bail du ${entree.split('-').reverse().join('/')}` : ''}`;

export type IssueSuiviLocataire = Issue<{ changements: ChangementDossier[]; activiteId: number; note?: string }>;

/**
 * Enregistre le bloc 4 de la fiche locataire. `activiteId` : la ligne lue à l'ouverture (mise à jour) ; `null` : le bail n'en avait pas
 * (création, rattachée au bail). Le bail doit être l'un de ceux du locataire, la ligne celle de ce bail.
 */
export async function enregistrerSuiviLocataire(locataireId: number, brut: unknown, auteur: Auteur): Promise<IssueSuiviLocataire> {
  const b = (brut ?? {}) as Record<string, unknown>;
  const bailId = entier(b.bailId);
  const activiteId = b.activiteId === null || b.activiteId === undefined ? null : entier(b.activiteId);
  const suivi = b.suivi !== null && typeof b.suivi === 'object' ? b.suivi as Record<string, unknown> : null;
  if (bailId === null || suivi === null || (b.activiteId !== null && b.activiteId !== undefined && activiteId === null)) return { etat: 'refus', motif: 'Saisie incomplète : rien n’a été enregistré.' };
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const occupe = (await query('SELECT 1 FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND bail_id = $2 LIMIT 1', [locataireId, bailId])).rows.length > 0;
  if (!occupe) return { etat: 'refus', motif: 'Ce bail n’est pas celui de ce locataire : rien n’a été enregistré.' };

  if (activiteId !== null) {
    const ligne = (await query<{ bail_id: string | null }>('SELECT bail_id::text FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL', [activiteId])).rows[0];
    if (ligne === undefined) return { etat: 'conflit', motif: 'Cette ligne du suivi n’existe plus : rechargez la fiche. Rien n’a été enregistré.' };
    if (ligne.bail_id === null || n(ligne.bail_id) !== bailId) return { etat: 'refus', motif: 'Cette ligne du suivi n’est pas celle de ce bail : rien n’a été enregistré.' };
    const r = await modifierDossierLocation(activiteId, { version: b.version, suivi }, auteur, { ficheLocataire: true });
    if (r.etat === 'non_rattache') return { etat: 'refus', motif: 'Dossier non rattaché — à rattacher d’abord.' };
    if (r.etat !== 'ok') return r;
    return { etat: 'ok', data: { changements: r.data.changements, activiteId, ...(r.data.note === undefined ? {} : { note: r.data.note }) } };
  }

  // 🔴 Jamais de doublon : une ligne apparue depuis l'ouverture (« Nouveau locataire », Suivi du mois) fait refuser, rien n'est écrit.
  const deja = (await query('SELECT 1 FROM gestion_location_activite WHERE bail_id = $1 AND type IN ($2, $3) AND annule_le IS NULL LIMIT 1', [bailId, 'bail', 'gestion_seule'])).rows.length > 0;
  if (deja) return { etat: 'conflit', motif: 'Une ligne de suivi a été enregistrée pour ce bail depuis l’ouverture de la fiche : rechargez-la. Rien n’a été enregistré.' };
  const r = await enregistrerActiviteBail(bailId, suivi, auteur);
  if (r.etat === 'indisponible') return { etat: 'sans_schema' };
  if (r.etat !== 'ok' || r.data === undefined) return { etat: 'refus', motif: r.etat === 'refus' ? r.motif : 'Le suivi commercial n’a pas pu être enregistré.' };
  const id = r.data.id;
  // Le journal : ce qui a été ENREGISTRÉ (relu : le serveur impose le « Mandat de gestion seul » d'un locataire en place), champ par champ.
  const relu = await lireDossierLocation(id);
  const changements = relu.etat === 'ok' ? changementsSuivi(null, relu.data.suivi, await nomsDuDossier()) : [];
  const lot = (await query<{ lot_id: string }>('SELECT lot_id::text FROM gestion_bail WHERE id = $1', [bailId])).rows[0];
  await journaliserChamps({ entite: 'location_activite', id, lotId: lot === undefined ? 0 : n(lot.lot_id), action: 'location_dossier_suivi', changements, auteur });
  return { etat: 'ok', data: { changements, activiteId: id, ...(r.data.note === undefined ? {} : { note: r.data.note }) } };
}
