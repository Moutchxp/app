import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { lireDossierDuBail, modifierDossierLocation, preparerDossier, type IssueDossier } from './dossierLocationRepo';
import { enregistrerSuiviLocataire } from './suiviLocataireRepo';
import type { ChangementDossier } from './dossierLocation';

/**
 * ══ 🔴🔴 Arno (20/11/2026) — LES BLOCS 3 « CONDITIONS D'ENTRÉE » ET 4 « SUIVI COMMERCIAL » SUR LA FICHE DU LOCATAIRE (Location) ═══════════════
 * Le BAIL EN COURS du locataire (une occupation sans date de sortie), lu comme le Dossier de location (`lireDossierDuBail` : avec sa ligne
 * de suivi s'il en a une, sinon le bloc 4 vide). Un SEUL « Enregistrer » pour les deux blocs, écrit sur ce bail par les chemins existants —
 * mêmes contrôles, mêmes obligations, même journal ; AUCUN MAIL, aucun geste Drive :
 *   ① le bloc 3 est d'abord CONTRÔLÉ sans rien écrire (version, refus, obligations de « Nouveau locataire ») ;
 *   ② le bloc 4, s'il a été touché : `enregistrerSuiviLocataire` (la même ligne mise à jour, ou créée rattachée au bail) ;
 *   ③ le bloc 3, s'il a changé : `modifierDossierLocation` sur le bail — sa version relue après ② (les deux blocs partagent la même lecture :
 *     notre propre écriture du bloc 4 ne doit pas se faire passer pour une modification venue d'ailleurs).
 * Un échec en ③ après ② le DIT (« le suivi commercial a été enregistré ; les conditions d'entrée non »), rien n'est caché.
 */
const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);
const objet = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** Le bail en cours du locataire : une de ses occupations sans date de sortie (la plus récente entrée d'abord). */
export async function bailEnCoursDuLocataire(locataireId: number): Promise<number | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT b.id::text FROM gestion_annuaire_occupation o JOIN gestion_bail b ON b.id = o.bail_id
      WHERE o.locataire_id = $1 AND o.sortie IS NULL ORDER BY b.entree DESC NULLS LAST, b.id DESC LIMIT 1`, [locataireId]);
  return rows[0] === undefined ? null : Number(rows[0].id);
}

export type LectureConditionsFiche = { etat: 'sans_bail' } | IssueDossier;

export async function lireConditionsFicheLocataire(locataireId: number): Promise<LectureConditionsFiche> {
  const bailId = await bailEnCoursDuLocataire(locataireId);
  return bailId === null ? { etat: 'sans_bail' } : lireDossierDuBail(bailId);
}

export type IssueConditionsFiche =
  | { etat: 'ok'; data: { changements: ChangementDossier[]; note?: string } }
  | { etat: 'refus' | 'conflit'; motif: string } | { etat: 'sans_bail' } | { etat: 'inconnu' } | { etat: 'non_rattache' } | { etat: 'sans_schema' };

export async function enregistrerConditionsFicheLocataire(locataireId: number, corps: Record<string, unknown>, auteur: Auteur): Promise<IssueConditionsFiche> {
  const bailId = entier(corps.bailId);
  const enCours = await bailEnCoursDuLocataire(locataireId);
  if (enCours === null) return { etat: 'sans_bail' };
  if (bailId !== enCours) return { etat: 'conflit', motif: 'Ce bail n’est plus le bail en cours de ce locataire : rechargez la fiche. Rien n’a été enregistré.' };
  const conditions = objet(corps.conditions);
  const suivi = objet(corps.suivi);
  if (conditions === null && suivi === null) return { etat: 'refus', motif: 'Aucune modification à enregistrer.' };
  // Le bloc 4 ne part jamais par le chemin du bloc 3 (il a le sien) : seuls conditions, entretien et honoraires saisis.
  const bloc3 = conditions === null ? null : {
    version: conditions.version, conditions: conditions.conditions, entretien: conditions.entretien,
    ...(conditions.honorairesSaisis !== undefined ? { honorairesSaisis: conditions.honorairesSaisis } : {}),
  };
  // ① le bloc 3 contrôlé AVANT toute écriture
  if (bloc3 !== null) {
    const p = await preparerDossier({ bailId }, bloc3, { ficheLocataire: true });
    if (p.etat !== 'pret' && p.etat !== 'ok') return p;
  }
  const changements: ChangementDossier[] = [];
  let note: string | undefined;
  // ② le bloc 4
  if (suivi !== null) {
    const r = await enregistrerSuiviLocataire(locataireId, { ...suivi, bailId }, auteur);
    if (r.etat !== 'ok') return r as IssueConditionsFiche;
    changements.push(...r.data.changements);
    if (typeof r.data.note === 'string') note = r.data.note;
  }
  // ③ le bloc 3, sur la version relue après notre propre écriture du bloc 4
  if (bloc3 !== null) {
    let version = bloc3.version;
    if (suivi !== null) {
      const l = await lireDossierDuBail(bailId);
      if (l.etat !== 'ok') return { etat: 'refus', motif: 'Le suivi commercial a été enregistré ; les conditions d’entrée non : le bail n’a pas pu être relu.' };
      version = l.data.version;
    }
    const m = await modifierDossierLocation({ bailId }, { ...bloc3, version }, auteur, { ficheLocataire: true });
    if (m.etat !== 'ok') {
      const motif = 'motif' in m && typeof m.motif === 'string' ? m.motif : 'Les conditions d’entrée n’ont pas été enregistrées.';
      return { etat: m.etat === 'conflit' ? 'conflit' : 'refus', motif: suivi !== null ? `Le suivi commercial a été enregistré ; les conditions d’entrée non : ${motif}` : motif };
    }
    changements.push(...m.data.changements);
    if (typeof m.data.note === 'string') note = note === undefined ? m.data.note : `${note} ${m.data.note}`;
  }
  return { etat: 'ok', data: { changements, ...(note === undefined ? {} : { note }) } };
}
