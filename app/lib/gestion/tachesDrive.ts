import 'server-only';
import {
  chercherDossiers, chercherFichiers, filAriane, listerContenu, listerDrivesAvecId, listerPartagesAvecMoi,
  lireMetadonnees, MIME_DOSSIER,
} from './drive';
import { fetchDriveLectureSeule } from './driveLectureSeule';
import { ficheLot } from './annuaireRepo';
import { RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE, RACINE_PARTAGES_AVEC_MOI } from './cibleDepot';
import type { PieceAjout } from './taches';

/**
 * ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — CE QUE LES TÂCHES LISENT DU DRIVE, ET RIEN D'AUTRE ═════════════════════════════
 *
 * Lister un dossier, remonter, chercher, relire les métadonnées d'un fichier choisi. TOUTES ces lectures passent par
 * `fetchDriveLectureSeule` : une écriture (créer, renommer, déplacer, partager, corbeille, envoyer) est refusée AVANT
 * de partir, quelle que soit la fonction appelée. Le jeton est celui du collaborateur connecté (délégation, lot
 * 5-PJ-C2) : on ne voit que ce qu'il a le droit de voir — « Documents clients scannés » compris, en lecture.
 */
const LECTURE = () => ({ fetch: fetchDriveLectureSeule() });

/** La racine de navigation : les trois entrées de la fenêtre Drive existante. */
export const RACINE_TACHES = 'svav:racine';

export interface ElementDrive {
  id: string; nom: string; typeMime: string; dossier: boolean; modifieLe: string | null; lien: string | null;
}

export type IssueLecture<T> = { ok: true; valeur: T } | { ok: false; motif: string };

const RACINES: ElementDrive[] = [
  { id: RACINE_MON_DRIVE, nom: 'Mon Drive', typeMime: MIME_DOSSIER, dossier: true, modifieLe: null, lien: null },
  { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés', typeMime: MIME_DOSSIER, dossier: true, modifieLe: null, lien: null },
  { id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi', typeMime: MIME_DOSSIER, dossier: true, modifieLe: null, lien: null },
];

/**
 * LE DOSSIER DE DÉPART : celui du bien — LE MÊME que le bouton « Dossier Drive ↗ » de sa fiche (`driveDossierId`).
 * `null` quand le bien n'a pas encore de dossier : la fenêtre s'ouvre alors à la racine, avec un message.
 */
export async function departDuBien(jeton: string, lotId: number): Promise<{ id: string; nom: string } | null> {
  const f = await ficheLot(lotId);
  if (f.etat !== 'ok' || f.data.driveDossierId === null) return null;
  const m = await lireMetadonnees(jeton, f.data.driveDossierId, LECTURE());
  return { id: f.data.driveDossierId, nom: m.ok ? m.valeur.nom : 'Dossier du bien' };
}

/** Le contenu d'un dossier (dossiers d'abord), et de quoi REMONTER (le parent, s'il est lisible). */
export async function lireDossierTache(jeton: string, dossierId: string): Promise<IssueLecture<{
  dossier: { id: string; nom: string }; parent: { id: string; nom: string } | null; elements: ElementDrive[]; tronque: boolean;
}>> {
  const d = LECTURE();
  if (dossierId === RACINE_TACHES) {
    return { ok: true, valeur: { dossier: { id: RACINE_TACHES, nom: 'Drive' }, parent: null, elements: RACINES, tronque: false } };
  }
  if (dossierId === RACINE_DRIVES_PARTAGES || dossierId === RACINE_PARTAGES_AVEC_MOI) {
    const l = dossierId === RACINE_DRIVES_PARTAGES ? await listerDrivesAvecId(jeton, d) : await listerPartagesAvecMoi(jeton, d);
    if (!l.ok) return { ok: false, motif: l.motif };
    return { ok: true, valeur: {
      dossier: { id: dossierId, nom: dossierId === RACINE_DRIVES_PARTAGES ? 'Drives partagés' : 'Partagés avec moi' },
      parent: { id: RACINE_TACHES, nom: 'Drive' },
      elements: l.valeur.map((x) => ({ id: x.id, nom: x.nom, typeMime: MIME_DOSSIER, dossier: true, modifieLe: null, lien: null })),
      tronque: false,
    } };
  }
  const [c, ariane] = await Promise.all([
    listerContenu(jeton, { parentId: dossierId }, d),
    dossierId === RACINE_MON_DRIVE ? Promise.resolve(null) : filAriane(jeton, dossierId, d),
  ]);
  if (!c.ok) return { ok: false, motif: c.motif };
  const etapes = ariane !== null && ariane.ok ? ariane.valeur : [];
  const ici = etapes[etapes.length - 1];
  const avant = etapes[etapes.length - 2];
  const elements = c.valeur.fichiers
    .map((f) => ({ id: f.id, nom: f.nom, typeMime: f.typeMime, dossier: f.dossier, modifieLe: f.modifieLe, lien: f.lien }))
    .sort((a, b) => Number(b.dossier) - Number(a.dossier) || a.nom.localeCompare(b.nom, 'fr'));
  return { ok: true, valeur: {
    dossier: { id: dossierId, nom: dossierId === RACINE_MON_DRIVE ? 'Mon Drive' : ici?.nom ?? 'Dossier' },
    // Sans parent lisible (racine d'un Drive partagé, ou parent hors de vos droits) : on remonte à la racine.
    parent: avant ? { id: avant.id, nom: avant.nom } : { id: RACINE_TACHES, nom: 'Drive' },
    elements, tronque: c.valeur.tronque,
  } };
}

/** Chercher par nom, dans tout ce que le collaborateur peut voir (dossiers et fichiers). */
export async function chercherTache(jeton: string, texte: string): Promise<IssueLecture<ElementDrive[]>> {
  const d = LECTURE();
  const [dossiers, fichiers] = await Promise.all([chercherDossiers(jeton, texte, d, 20), chercherFichiers(jeton, texte, d)]);
  if (!fichiers.ok) return { ok: false, motif: fichiers.motif };
  return { ok: true, valeur: [
    ...(dossiers.ok ? dossiers.valeur.map((x) => ({ id: x.id, nom: x.nom, typeMime: MIME_DOSSIER, dossier: true, modifieLe: null, lien: null })) : []),
    ...fichiers.valeur.map((f) => ({ id: f.id, nom: f.nom, typeMime: f.typeMime, dossier: f.dossier, modifieLe: f.modifieLe, lien: f.lien })),
  ] };
}

/**
 * RELIRE dans le Drive les fichiers choisis, avant d'en garder la RÉFÉRENCE : le nom, le type et le lien viennent de
 * Google (avec les droits du collaborateur), jamais du navigateur. Un dossier n'est pas une pièce jointe.
 */
export async function relirePieces(jeton: string, ids: readonly string[]): Promise<IssueLecture<PieceAjout[]>> {
  const out: PieceAjout[] = [];
  for (const id of ids) {
    const m = await lireMetadonnees(jeton, id, LECTURE());
    if (!m.ok) return { ok: false, motif: `Un fichier choisi n’a pas pu être relu dans le Drive : ${m.motif}` };
    if (m.valeur.typeMime === MIME_DOSSIER) return { ok: false, motif: `« ${m.valeur.nom} » est un dossier : choisissez des fichiers.` };
    out.push({ driveId: m.valeur.id, nom: m.valeur.nom, typeMime: m.valeur.typeMime, lien: m.valeur.lien });
  }
  return { ok: true, valeur: out };
}
