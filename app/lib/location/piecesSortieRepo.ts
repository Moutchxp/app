import { createHash } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chaineParents, lireMetadonnees, listerContenu, MIME_DOSSIER } from '../gestion/drive';
import { verdictJoindre } from '../gestion/driveVerdict';
import { DOSSIER_INTERDIT_LECTURE } from '../gestion/driveLectureFichier';
import { lireContenuDrive } from '../gestion/pieceDriveLecture';
import { dossierDriveDuLot } from '../gestion/arbreStatutDriveRepo';
import { deposerPieceSortie, recuperer } from '../stockage';
import { colonneExisteMemo } from './sondeLocation';
import { lireBail } from './sortieLocatairesRepo';
import { estEtatDesLieux, PIECE_MAX_OCTETS, refusPiece, typePiece, type PieceJointe } from './validationSortie';

/**
 * ══ 🔴🔴 LES PIÈCES JOINTES AU COMPTE RENDU DE L'ÉTAT DES LIEUX DE SORTIE (Arno, 11/11/2026, migration 468). IMPUR (Drive en LECTURE, stockage, base).
 *
 * TROIS ENTRÉES, UNE SEULE LISTE : « Depuis le Drive du bien » (le dossier N5 du bien, inscrit au registre), le glisser-déposer et
 * « Parcourir mon ordinateur ». Chaque pièce est déposée sur le STOCKAGE OBJET (jamais ses octets en base) et inscrite (ajout seul).
 *
 * 🔴🔴 RÈGLE DRIVE ABSOLUE : CE MODULE NE FAIT QUE LIRE LE DRIVE — `listerContenu`, `lireMetadonnees`, `chaineParents` (GET) et
 * `lireContenuDrive` (`alt=media`, GET). Aucun appel d'écriture n'est importé ici (garde statique : `piecesSortie.garde.test.ts`).
 * « Documents clients scannés » : AUCUNE opération, pas même une lecture de contenu — le verdict `verdictJoindre` (chaîne des parents,
 * refus dans le doute) passe AVANT toute lecture d'octets, et le dossier du bien est lui-même vérifié avant d'être listé.
 * Un fichier n'est joint que s'il est DANS le dossier de CE bien (sa chaîne de parents passe par lui).
 */

export const piecesSortieDisponibles = (): Promise<boolean> => colonneExisteMemo('gestion_location_sortie_piece', 'cle_stockage');
export const MOTIF_SANS_468 = 'Les pièces jointes demandent la mise à jour de la base (migration 468).';

export interface FichierDuBien { id: string; nom: string; typeMime: string; taille: number | null; modifieLe: string | null; chemin: string[]; joignable: boolean; etatDesLieux: boolean }
export type IssueDriveBien =
  | { etat: 'ok'; data: { fichiers: FichierDuBien[]; tronque: boolean; lotId: number } }
  | { etat: 'sans_dossier'; motif: string; lotId: number }
  | { etat: 'refus'; motif: string };

const PROFONDEUR_MAX = 4;
const DOSSIERS_MAX = 80;
const FICHIERS_MAX = 600;
type DepsDrive = { fetch: typeof fetch };

/** Le dossier Drive du bien de cette occupation, VÉRIFIÉ hors de « Documents clients scannés ». */
async function dossierVerifie(occupationId: number, jeton: string): Promise<{ ok: true; driveId: string; lotId: number } | { ok: false; issue: IssueDriveBien }> {
  const bail = await lireBail(occupationId);
  if (bail === null) return { ok: false, issue: { etat: 'refus', motif: 'Ce bail n’existe plus : rechargez la page.' } };
  const d = await dossierDriveDuLot(bail.lotId);
  if (d === null) return { ok: false, issue: { etat: 'sans_dossier', lotId: bail.lotId, motif: 'Ce bien n’a pas de dossier Drive connu : renseignez-le sur la fiche du bien.' } };
  const v = await verdictJoindre(jeton, d.driveId);
  if (!v.joindre) return { ok: false, issue: { etat: 'refus', motif: v.motif ?? `Dossier refusé (« ${DOSSIER_INTERDIT_LECTURE} »).` } };
  return { ok: true, driveId: d.driveId, lotId: bail.lotId };
}

/** LES FICHIERS DU DOSSIER DRIVE DU BIEN (sous-dossiers compris, bornés), les plus récents d'abord. LECTURE SEULE. */
export async function fichiersDriveDuBien(occupationId: number, jeton: string, deps: DepsDrive = { fetch }): Promise<IssueDriveBien> {
  const d = await dossierVerifie(occupationId, jeton);
  if (!d.ok) return d.issue;
  const fichiers: FichierDuBien[] = [];
  const file: { id: string; chemin: string[] }[] = [{ id: d.driveId, chemin: [] }];
  let dossiersLus = 0;
  let tronque = false;
  while (file.length > 0) {
    const { id, chemin } = file.shift()!;
    if (++dossiersLus > DOSSIERS_MAX) { tronque = true; break; }
    const r = await listerContenu(jeton, { parentId: id }, deps);
    if (!r.ok) return { etat: 'refus', motif: `Lecture du Drive impossible : ${r.motif}` };
    tronque ||= r.valeur.tronque;
    for (const f of r.valeur.fichiers) {
      if (f.dossier || f.typeMime === MIME_DOSSIER) {
        if (chemin.length + 1 < PROFONDEUR_MAX) file.push({ id: f.id, chemin: [...chemin, f.nom] });
        continue;
      }
      if (fichiers.length >= FICHIERS_MAX) { tronque = true; continue; }
      fichiers.push({ id: f.id, nom: f.nom, typeMime: f.typeMime, taille: f.tailleOctets, modifieLe: f.modifieLe, chemin,
        joignable: typePiece(f.nom, f.typeMime) !== null && f.tailleOctets !== null && f.tailleOctets > 0 && f.tailleOctets <= PIECE_MAX_OCTETS,
        etatDesLieux: estEtatDesLieux(f.nom, chemin) });
    }
  }
  fichiers.sort((a, b) => (b.modifieLe ?? '').localeCompare(a.modifieLe ?? ''));
  return { etat: 'ok', data: { fichiers, tronque, lotId: d.lotId } };
}

export interface PieceAjoutee { id: number; nom: string; typeMime: string; taille: number; provenance: 'drive' | 'ordinateur' }
export type IssueAjout = { etat: 'ok'; data: { pieces: PieceAjoutee[]; refus: string[] } } | { etat: 'refus'; motif: string };

async function inscrire(occupationId: number, p: { provenance: 'drive' | 'ordinateur'; nom: string; typeMime: string; octets: Buffer; driveFileId: string | null }, auteur: Auteur): Promise<PieceAjoutee | string> {
  const depot = await deposerPieceSortie(p.octets, p.typeMime, { occupationId, tailleMaxOctets: PIECE_MAX_OCTETS });
  if (!depot.depose) return `« ${p.nom} » : ${depot.motif}`;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_location_sortie_piece (occupation_id, provenance, nom, type_mime, taille_octets, cle_stockage, empreinte_sha256, drive_file_id, ajoute_par_id, ajoute_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text`,
    [occupationId, p.provenance, p.nom, p.typeMime, p.octets.byteLength, depot.cle, depot.empreinte, p.driveFileId, auteur.id, auteur.libelle]);
  return { id: Number(rows[0].id), nom: p.nom, typeMime: p.typeMime, taille: p.octets.byteLength, provenance: p.provenance };
}

/**
 * « JOINDRE » DEPUIS LE DRIVE DU BIEN. Pour chaque fichier : 🔴 le verdict (« Documents clients scannés », dans le doute : refus) AVANT
 * toute lecture ; le fichier doit être dans le dossier de CE bien ; type et taille ; PUIS seulement ses octets (lecture `alt=media`).
 * Rien n'est écrit dans le Drive : ni copie, ni déplacement.
 */
export async function joindreDepuisDrive(occupationId: number, fileIds: readonly string[], dejaJointes: readonly { taille: number }[], jeton: string, auteur: Auteur,
  deps: DepsDrive = { fetch }): Promise<IssueAjout> {
  if (!(await piecesSortieDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_468 };
  const d = await dossierVerifie(occupationId, jeton);
  if (!d.ok) return { etat: 'refus', motif: 'motif' in d.issue ? d.issue.motif : 'Dossier Drive introuvable.' };
  const pieces: PieceAjoutee[] = [];
  const refus: string[] = [];
  for (const id of [...new Set(fileIds)].slice(0, 20)) {
    const v = await verdictJoindre(jeton, id);
    if (!v.joindre) { refus.push(v.motif ?? 'Fichier refusé.'); continue; }
    const chaine = await chaineParents(jeton, id, deps);
    if (!chaine.some((m) => m.id === d.driveId)) { refus.push('Ce fichier n’est pas dans le dossier Drive de ce bien.'); continue; }
    const meta = await lireMetadonnees(jeton, id, deps);
    if (!meta.ok) { refus.push(`Fichier illisible : ${meta.motif}`); continue; }
    const typeMime = typePiece(meta.valeur.nom, meta.valeur.typeMime);
    const r0 = refusPiece({ nom: meta.valeur.nom, typeMime: meta.valeur.typeMime, taille: meta.valeur.tailleOctets ?? 0 }, [...dejaJointes, ...pieces]);
    if (r0 !== null || typeMime === null) { refus.push(r0 ?? `« ${meta.valeur.nom} » : type refusé.`); continue; }
    const c = await lireContenuDrive(id, jeton, deps);
    if (!c.ok) { refus.push(`« ${meta.valeur.nom} » : ${c.motif}`); continue; }
    const r = await inscrire(occupationId, { provenance: 'drive', nom: meta.valeur.nom, typeMime, octets: c.octets, driveFileId: id }, auteur);
    if (typeof r === 'string') refus.push(r); else pieces.push(r);
  }
  return { etat: 'ok', data: { pieces, refus } };
}

/** DEPUIS L'ORDINATEUR (glisser-déposer ou « Parcourir ») : type, taille, total ; puis le dépôt. */
export async function joindreDepuisOrdinateur(occupationId: number, fichiers: readonly { nom: string; typeMime: string | null; octets: Buffer }[],
  dejaJointes: readonly { taille: number }[], auteur: Auteur): Promise<IssueAjout> {
  if (!(await piecesSortieDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_468 };
  if ((await lireBail(occupationId)) === null) return { etat: 'refus', motif: 'Ce bail n’existe plus : rechargez la page.' };
  const pieces: PieceAjoutee[] = [];
  const refus: string[] = [];
  for (const f of fichiers.slice(0, 20)) {
    const r0 = refusPiece({ nom: f.nom, typeMime: f.typeMime, taille: f.octets.byteLength }, [...dejaJointes, ...pieces]);
    const typeMime = typePiece(f.nom, f.typeMime);
    if (r0 !== null || typeMime === null) { refus.push(r0 ?? `« ${f.nom} » : type refusé.`); continue; }
    const r = await inscrire(occupationId, { provenance: 'ordinateur', nom: f.nom, typeMime, octets: f.octets, driveFileId: null }, auteur);
    if (typeof r === 'string') refus.push(r); else pieces.push(r);
  }
  return { etat: 'ok', data: { pieces, refus } };
}

/**
 * LES PIÈCES CHOISIES, POUR L'ENVOI : seulement celles de CES occupations (un identifiant forgé ne lit pas la pièce d'un autre bail) ;
 * leurs octets, relus du stockage et VÉRIFIÉS (empreinte). Une pièce introuvable ou altérée : refus dit, rien ne part.
 */
export async function piecesPourEnvoi(ids: readonly number[], occupationIds: readonly number[], lireOctets: (cle: string) => Promise<Buffer> = recuperer):
  Promise<{ ok: true; pieces: PieceJointe[] } | { ok: false; motif: string }> {
  const voulues = [...new Set(ids)];
  if (voulues.length === 0) return { ok: true, pieces: [] };
  if (!(await piecesSortieDisponibles())) return { ok: false, motif: MOTIF_SANS_468 };
  const { rows } = await query<{ id: string; nom: string; type_mime: string; taille_octets: string; cle_stockage: string; empreinte_sha256: string }>(
    `SELECT id::text, nom, type_mime, taille_octets::text, cle_stockage, empreinte_sha256 FROM gestion_location_sortie_piece
      WHERE id = ANY($1::bigint[]) AND occupation_id = ANY($2::bigint[]) ORDER BY array_position($1::bigint[], id)`, [voulues, [...occupationIds]]);
  if (rows.length !== voulues.length) return { ok: false, motif: 'Une pièce jointe est introuvable pour ce préavis : retirez-la puis ajoutez-la de nouveau.' };
  // Le même contrôle qu'à l'ajout, refait au serveur sur ce qui va partir : chaque fichier, puis le total.
  for (let i = 0; i < rows.length; i += 1) {
    const r = refusPiece({ nom: rows[i].nom, typeMime: rows[i].type_mime, taille: Number(rows[i].taille_octets) }, rows.slice(0, i).map((x) => ({ taille: Number(x.taille_octets) })));
    if (r !== null) return { ok: false, motif: r };
  }
  const pieces: PieceJointe[] = [];
  for (const r of rows) {
    let octets: Buffer;
    try { octets = await lireOctets(r.cle_stockage); } catch { return { ok: false, motif: `La pièce « ${r.nom} » est illisible sur le stockage : rien n’est parti.` }; }
    if (createHash('sha256').update(octets).digest('hex') !== r.empreinte_sha256) return { ok: false, motif: `La pièce « ${r.nom} » a changé depuis son ajout : rien n’est parti.` };
    pieces.push({ id: Number(r.id), nom: r.nom, typeMime: r.type_mime, taille: Number(r.taille_octets), octets: new Uint8Array(octets) });
  }
  return { ok: true, pieces };
}

/** LES MÉTADONNÉES de pièces (récapitulatif, historique) — jamais une clé de stockage. */
export async function metaPieces(ids: readonly number[], occupationIds?: readonly number[]): Promise<{ id: number; nom: string; typeMime: string; taille: number; provenance: string }[]> {
  if (ids.length === 0 || !(await piecesSortieDisponibles())) return [];
  // Bornées aux occupations du préavis quand elles sont données (le récapitulatif) : un identifiant forgé ne montre pas la pièce d'un autre bail.
  const { rows } = await query<{ id: string; nom: string; type_mime: string; taille_octets: string; provenance: string }>(
    `SELECT id::text, nom, type_mime, taille_octets::text, provenance FROM gestion_location_sortie_piece WHERE id = ANY($1::bigint[])${occupationIds ? ' AND occupation_id = ANY($2::bigint[])' : ''}
      ORDER BY array_position($1::bigint[], id)`, occupationIds ? [[...ids], [...occupationIds]] : [[...ids]]);
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom, typeMime: r.type_mime, taille: Number(r.taille_octets), provenance: r.provenance }));
}

/** LES OCTETS D'UNE PIÈCE, pour la télécharger depuis l'historique (droit vérifié par la route). */
export async function octetsPieceSortie(id: number, lireOctets: (cle: string) => Promise<Buffer> = recuperer): Promise<{ nom: string; typeMime: string; octets: Buffer } | null> {
  if (!(await piecesSortieDisponibles())) return null;
  const { rows } = await query<{ nom: string; type_mime: string; cle_stockage: string }>('SELECT nom, type_mime, cle_stockage FROM gestion_location_sortie_piece WHERE id = $1', [id]);
  if (rows[0] === undefined) return null;
  return { nom: rows[0].nom, typeMime: rows[0].type_mime, octets: await lireOctets(rows[0].cle_stockage) };
}
