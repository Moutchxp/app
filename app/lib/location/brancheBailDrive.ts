import { nettoyerNom } from '../gestion/driveGardeFou';
import { dateFr, PIECES_BAIL, RUBRIQUES_N6, SOUS_PIECES_BAIL, SOUS_PROPRIETAIRE } from '../gestion/arborescenceDrive';

/**
 * ══ 🔴🔴 NOUVEAU LOCATAIRE — LA BRANCHE « BAIL » DU DRIVE (Arno, 20/10/2026). PUR. ════════════════════════════════════════════
 *
 * L'arborescence validée (`arborescenceDrive.ts`) : N1 « Base de données locative » › N2 « Actifs » › N3 propriétaire › N4
 * adresse › N5 bien › N6 « 6 Locataires » › N7 le bail › N8 « 1 Papiers d'identité » … « 6 Entretien » › N9 « Assurance
 * habitation » / « Chaudière » › N10 l'année en cours. À l'enregistrement d'un nouveau locataire, la branche N7 → N10 de SON
 * bail est créée (mêmes noms, même modèle) ; les parents manquants (N3 → N6) d'abord, selon le même modèle.
 *
 * LE NOM DU N7 (règle d'Arno, 20/10/2026) : « BAIL » + la DATE D'ENTRÉE dans les lieux (jj/mm/aaaa) + les NOMS DE FAMILLE des
 * colocataires du bail seulement (jamais garants ni contacts), en majuscules, dans l'ordre de saisie, séparés par « – » :
 * « BAIL 01/09/2024 MARTIN », « BAIL 26/10/2024 YOUENOU – TALHOUARN ». La date suffit à distinguer les baux ; si, cas
 * extrême, un dossier de ce nom exact existe déjà pour UN AUTRE bail dans ce « 6 Locataires », « (2) » est ajouté (puis
 * « (3) »… pour rester unique). Sans date d'entrée, le dossier ne peut pas être nommé : la date est obligatoire.
 *
 * L'IDEMPOTENCE : chaque dossier porte une CLÉ (étiquette `svav_arbo`, enregistrée dans `gestion_drive_noeud`) ; un dossier
 * dont la clé est déjà connue n'est jamais recréé. Clés de la branche : `bl:<bail>` (N7), `bl:<bail>:<k>` (N8),
 * `bl:<bail>:<k>:s` (N9), `y:bl:<bail>:<k>:s:<année>` (N10).
 */
export const SEPARATEUR_NOMS = ' – ';

/**
 * « BAIL 01/09/2024 MARTIN » ; `autres` = les noms des AUTRES dossiers du « 6 Locataires » (jamais celui de ce bail).
 * `null` : pas de date d'entrée — le dossier ne peut pas être nommé. PUR.
 */
export function nomDossierBail(nomsFamille: readonly string[], entree: string | null, autres: readonly string[]): string | null {
  const date = dateFr(entree);
  if (date === '') return null;
  const noms: string[] = [];
  for (const n of nomsFamille) {
    const m = n.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
    if (m !== '' && !noms.includes(m)) noms.push(m);
  }
  const base = nettoyerNom(`BAIL ${date} ${noms.join(SEPARATEUR_NOMS) || 'LOCATAIRE'}`);
  const exact = (x: string) => x.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
  const pris = new Set(autres.map(exact));
  if (!pris.has(exact(base))) return base;
  for (let k = 2; ; k += 1) { const n = nettoyerNom(`${base} (${k})`); if (!pris.has(exact(n))) return n; }
}

export type SorteNoeudBail = 'proprietaire' | 'adresse' | 'bien' | 'rubrique' | 'sous_rubrique' | 'annee' | 'bail' | 'piece_bail' | 'sous_piece_bail';
export interface CreationBail {
  cle: string; sorte: SorteNoeudBail; niveau: number; nom: string;
  /** Le parent : un dossier déjà là (son identifiant Drive), ou un dossier créé plus haut dans ce plan (sa clé). */
  parent: { driveId: string } | { cle: string };
  lotId: number | null; annee: number | null; bailEntree: string | null; bailId: number | null;
}

export interface EntreePlanBail {
  bailId: number; annee: number; entree: string | null; nomN7: string;
  proprietaire: { id: number; nom: string };
  bien: { teteId: number; nom: string };
  /** Le N4 : sa CLÉ complète (celle déjà enregistrée, ou une neuve `a:<propriétaire>:A:<empreinte>`) et son nom. */
  adresse: { cle: string; nom: string };
  /** L'identifiant Drive du N2 « Actifs » (le parent commun des N3 actifs). */
  n2: string | null;
  /** Les dossiers DÉJÀ enregistrés, par clé (N3 → N10) : ils ne sont jamais recréés. */
  existants: ReadonlyMap<string, string>;
}

/**
 * LE PLAN : les dossiers à créer, dans l'ordre (un parent avant ses enfants). `null` + motif si l'on ne sait pas où créer (aucun
 * N2 connu pour un N3 manquant). PUR.
 */
export function planBrancheBail(e: EntreePlanBail): { ok: true; creations: CreationBail[] } | { ok: false; motif: string } {
  const out: CreationBail[] = [];
  const t = e.bien.teteId;
  const cleN3 = `p:${e.proprietaire.id}:A`;
  const cleN4 = e.adresse.cle;
  const cleN5 = `b:${t}`;
  const cleN6 = `r:${t}:6`;
  const parentDe = (cle: string): CreationBail['parent'] => {
    const d = e.existants.get(cle);
    return d !== undefined ? { driveId: d } : { cle };
  };
  const poser = (c: Omit<CreationBail, 'parent'> & { parentCle?: string; parentDrive?: string }): void => {
    if (e.existants.has(c.cle) || out.some((x) => x.cle === c.cle)) return;
    const { parentCle, parentDrive, ...reste } = c;
    out.push({ ...reste, parent: parentDrive !== undefined ? { driveId: parentDrive } : parentDe(parentCle!) });
  };
  const sans = { annee: null, bailEntree: null, bailId: null };
  // Les parents manquants, selon le modèle : N3 → N4 → N5 (et, pour un N5 neuf, toutes ses rubriques N6) → « 6 Locataires ».
  if (!e.existants.has(cleN6)) {
    if (!e.existants.has(cleN5)) {
      if (!e.existants.has(cleN4)) {
        if (!e.existants.has(cleN3)) {
          if (e.n2 === null) return { ok: false, motif: 'Le dossier « Actifs » du Drive est introuvable : la branche du propriétaire ne peut pas être créée.' };
          poser({ cle: cleN3, sorte: 'proprietaire', niveau: 3, nom: nettoyerNom(e.proprietaire.nom), lotId: null, ...sans, parentDrive: e.n2 });
        }
        poser({ cle: cleN4, sorte: 'adresse', niveau: 4, nom: e.adresse.nom, lotId: null, ...sans, parentCle: cleN3 });
      }
      poser({ cle: cleN5, sorte: 'bien', niveau: 5, nom: e.bien.nom, lotId: t, ...sans, parentCle: cleN4 });
      RUBRIQUES_N6.forEach((nom, i) => {
        if (i === 6) return;
        poser({ cle: `r:${t}:${i}`, sorte: 'rubrique', niveau: 6, nom, lotId: t, ...sans, parentCle: cleN5 });
        if (i === 1) SOUS_PROPRIETAIRE.forEach((s, k) => {
          poser({ cle: `pr:${t}:${k}`, sorte: 'sous_rubrique', niveau: 7, nom: s, lotId: t, ...sans, parentCle: `r:${t}:1` });
          poser({ cle: `y:pr:${t}:${k}:${e.annee}`, sorte: 'annee', niveau: 8, nom: String(e.annee), lotId: t, ...sans, annee: e.annee, parentCle: `pr:${t}:${k}` });
        });
      });
    }
    poser({ cle: cleN6, sorte: 'rubrique', niveau: 6, nom: RUBRIQUES_N6[6], lotId: t, ...sans, parentCle: cleN5 });
  }
  // La branche du bail : N7 → N10.
  const b = `bl:${e.bailId}`;
  const duBail = { lotId: t, annee: null, bailEntree: e.entree, bailId: e.bailId };
  poser({ cle: b, sorte: 'bail', niveau: 7, nom: e.nomN7, ...duBail, parentCle: cleN6 });
  PIECES_BAIL.forEach((nom, i) => {
    const k = i + 1;
    poser({ cle: `${b}:${k}`, sorte: 'piece_bail', niveau: 8, nom, ...duBail, parentCle: b });
    const s9 = SOUS_PIECES_BAIL[k];
    if (s9 === undefined) return;
    poser({ cle: `${b}:${k}:s`, sorte: 'sous_piece_bail', niveau: 9, nom: s9, ...duBail, parentCle: `${b}:${k}` });
    poser({ cle: `y:${b}:${k}:s:${e.annee}`, sorte: 'annee', niveau: 10, nom: String(e.annee), ...duBail, annee: e.annee, parentCle: `${b}:${k}:s` });
  });
  return { ok: true, creations: out };
}

/** Le N6 « 6 Locataires » d'un bien : sa clé (pour lire ses voisins avant de nommer le N7). PUR. */
export const cleLocatairesDuBien = (teteId: number): string => `r:${teteId}:6`;
