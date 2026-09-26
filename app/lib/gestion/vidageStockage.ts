/**
 * MODULE « GESTION » — LOT DRIVE-3 : QUELLE PIÈCE PEUT PERDRE SES OCTETS ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE DÉCIDE D'UN EFFACEMENT DÉFINITIF. Un objet MinIO effacé ne revient pas. La règle est donc écrite ici,
 * seule, en clair, et éprouvée sans réseau : c'est le seul endroit où l'on dit « oui » — la commande ne fait
 * qu'obéir.
 *
 * ═══ 🔴 LA RÈGLE, ET ELLE EST CONJONCTIVE : TOUT DOIT ÊTRE VRAI EN MÊME TEMPS ════════════════════════════════════
 *   ① la pièce a un contenu dans MinIO (sinon il n'y a rien à effacer) ;
 *   ② elle n'a pas DÉJÀ été vidée (idempotence : relancer ne doit rien recompter) ;
 *   ③ une copie Drive existe, d'origine « copie », et elle est marquée VÉRIFIÉE en base ;
 *   ④ la relecture des métadonnées Drive, faite À L'INSTANT, rend la MÊME empreinte MD5 et la MÊME taille ;
 *   ⑤ le fichier n'est pas à la corbeille Drive ;
 *   ⑥ son parent est TOUJOURS un descendant de « Base de données locative » — vérifié en remontant l'arbre mémorisé ;
 *   ⑦ la pièce n'appartient pas à un brouillon en cours de rédaction.
 *
 * ⚠️ POURQUOI ④ ALORS QUE ③ DIT DÉJÀ « VÉRIFIÉE ». Parce que « vérifiée » date de la copie, parfois des heures avant.
 * Entre-temps quelqu'un a pu déplacer, renommer, remplacer ou jeter le fichier dans le Drive. Effacer sur la foi d'une
 * vérification passée, c'est effacer sur la foi d'un souvenir. On redemande à Google, juste avant.
 *
 * ⚠️ LES MINIATURES NE SONT JAMAIS CONCERNÉES. Elles vivent sous une autre clé (`miniature_cle`), elles pèsent
 * quelques kilooctets, et c'est d'elles que dépend l'affichage instantané des cartes de pièces jointes. Ce module ne
 * les regarde même pas : aucune de ses fonctions ne reçoit `miniature_cle`.
 *
 * 🔴 EN CAS DE DOUTE, ON N'EFFACE PAS. Chaque refus porte un MOTIF, et le rapport les compte : une pièce conservée
 * pour une mauvaise raison se voit, une pièce effacée à tort ne se voit plus.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la base sait d'une pièce candidate, avant toute relecture Drive. */
export interface PieceCandidate {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  /** `null` = aucun contenu n'a jamais été déposé (pièce refusée, trop grosse, type exclu). */
  cleStockage: string | null;
  tailleOctets: number | null;
  /** Déjà vidée ? Une ligne dans `gestion_piece_vidage`. */
  dejaVidee: boolean;
  /** La copie Drive, quand il y en a une d'origine « copie ». */
  driveFileId: string | null;
  driveDossierId: string | null;
  /** L'empreinte enregistrée lors de la copie, et sa date de vérification. `null` = non vérifiée. */
  md5: string | null;
  verifieLe: string | null;
  /** La pièce est-elle attachée à un brouillon en cours ? */
  brouillonEnCours: boolean;
}

/** Ce que Drive répond quand on relit le fichier, juste avant d'effacer. */
export interface RelectureDrive {
  ok: boolean;
  motif?: string;
  md5?: string | null;
  taille?: number | null;
  /** Le parent est-il un descendant de « Base de données locative » ? Calculé par le garde-fou. */
  sousLaRacine?: boolean;
  /**
   * 🔴 DRIVE N'A ANNONCÉ AUCUN PARENT — ce qui n'est PAS la même chose qu'un parent hors de notre racine.
   *
   * Constaté en simulation le 26/09/2026 : 2 fichiers sur 6 717 sont revenus sans champ `parents`, puis avec leur
   * parent normal au passage suivant. Un fichier réellement DÉPLACÉ, lui, annonce son nouveau parent — donc une
   * liste NON VIDE, inconnue de l'arbre. Une liste vide ne dit rien sur l'emplacement du fichier ; la confondre avec
   * « il a quitté la racine » faisait passer un hoquet de Google pour une réorganisation du Drive. Les deux
   * conduisent à conserver la pièce — mais l'un se relance, l'autre s'enquête.
   */
  sansParent?: boolean;
}

/**
 * LES MOTIFS DE CONSERVATION. Écrits ici, une fois, pour que le rapport et les tests parlent la même langue.
 *
 * ⚠️ `deja_videe` N'EST PAS UNE ANOMALIE : c'est l'idempotence qui fonctionne. Le rapport le dit à part des autres,
 * pour qu'une relance ne ressemble pas à une avalanche de refus.
 */
export type MotifConservation =
  | 'sans_contenu'
  | 'deja_videe'
  | 'sans_copie'
  | 'copie_non_verifiee'
  | 'brouillon_en_cours'
  | 'drive_illisible'
  | 'drive_corbeille'
  | 'drive_sans_parent'
  | 'drive_hors_racine'
  | 'empreinte_differente'
  | 'taille_differente';

export const LIBELLES_CONSERVATION: Record<MotifConservation, string> = {
  sans_contenu: 'aucun contenu dans le stockage (pièce refusée, type exclu ou trop grosse)',
  deja_videe: 'déjà vidée lors d’une passe précédente',
  sans_copie: 'aucune copie Drive enregistrée',
  copie_non_verifiee: 'copie Drive enregistrée mais NON vérifiée',
  brouillon_en_cours: 'pièce d’un brouillon en cours de rédaction',
  drive_illisible: 'le fichier Drive n’a pas pu être relu',
  drive_corbeille: 'le fichier Drive est à la corbeille',
  drive_sans_parent: 'Drive n’a pas dit où se trouve ce fichier (à relancer — ce n’est pas un déplacement)',
  drive_hors_racine: 'le fichier Drive n’est plus sous « Base de données locative »',
  empreinte_differente: 'l’empreinte MD5 du Drive diffère de celle du stockage',
  taille_differente: 'la taille du fichier Drive diffère de celle du stockage',
};

export type Verdict =
  | { effacable: true; cleStockage: string; driveFileId: string; md5: string; taille: number }
  | { effacable: false; motif: MotifConservation };

/**
 * CE QUE LA BASE SEULE PERMET DE DIRE — les sept conditions qui n'ont pas besoin de Google. PUR.
 *
 * 🔴 ON FILTRE AVANT D'APPELER DRIVE, et l'ordre compte : 24 000 pièces, une relecture Drive chacune, cela ferait
 * 24 000 allers-retours dont la plupart pour s'entendre dire « cette pièce n'a pas de copie vérifiée ». On écarte
 * donc d'abord sur ce qu'on sait déjà, et on ne dérange Google que pour les candidates sérieuses.
 */
export function verdictBase(p: PieceCandidate): Verdict | null {
  if (p.cleStockage === null || p.cleStockage.trim() === '') return { effacable: false, motif: 'sans_contenu' };
  if (p.dejaVidee) return { effacable: false, motif: 'deja_videe' };
  if (p.brouillonEnCours) return { effacable: false, motif: 'brouillon_en_cours' };
  if (p.driveFileId === null || p.driveFileId.trim() === '') return { effacable: false, motif: 'sans_copie' };
  if (p.verifieLe === null || p.md5 === null || p.md5.trim() === '') {
    return { effacable: false, motif: 'copie_non_verifiee' };
  }
  if (p.tailleOctets === null || p.tailleOctets < 0) return { effacable: false, motif: 'sans_contenu' };
  return null;   // `null` = rien ne s'y oppose côté base : il reste à demander à Drive
}

/**
 * LE VERDICT FINAL, avec la relecture Drive faite À L'INSTANT. PUR.
 *
 * ⚠️ UNE EMPREINTE ABSENTE CÔTÉ DRIVE VAUT « DIFFÉRENTE », jamais « égale ». Drive ne rend pas de MD5 pour ses
 * propres formats (Docs, Sheets) : sur un tel fichier on ne peut RIEN prouver, donc on n'efface pas.
 */
export function verdict(p: PieceCandidate, r: RelectureDrive): Verdict {
  const base = verdictBase(p);
  if (base !== null) return base;

  if (!r.ok) {
    const motif = (r.motif ?? '').toLowerCase();
    if (motif.includes('corbeille')) return { effacable: false, motif: 'drive_corbeille' };
    return { effacable: false, motif: 'drive_illisible' };
  }
  // Avant de conclure « il a quitté la racine », vérifier que Drive a bien dit où il est. Cf. `sansParent`.
  if (r.sansParent === true) return { effacable: false, motif: 'drive_sans_parent' };
  if (r.sousLaRacine !== true) return { effacable: false, motif: 'drive_hors_racine' };
  if (typeof r.md5 !== 'string' || r.md5.trim() === '' || r.md5.toLowerCase() !== (p.md5 ?? '').toLowerCase()) {
    return { effacable: false, motif: 'empreinte_differente' };
  }
  if (typeof r.taille !== 'number' || r.taille !== p.tailleOctets) {
    return { effacable: false, motif: 'taille_differente' };
  }
  return {
    effacable: true,
    cleStockage: p.cleStockage as string,
    driveFileId: p.driveFileId as string,
    md5: p.md5 as string,
    taille: p.tailleOctets as number,
  };
}

// ── LES COMPTES DE LA PASSE ─────────────────────────────────────────────────────────────────────────────────────

export interface ComptesVidage {
  vues: number;
  effacables: number;
  octetsEffacables: number;
  effacees: number;
  octetsEffaces: number;
  /** Combien de pièces conservées, par motif. */
  conservees: Record<MotifConservation, number>;
  /** Combien de fois Drive a été relu — la seule dépense réseau de cette commande. */
  relecturesDrive: number;
}

export function comptesVides(): ComptesVidage {
  const conservees = {} as Record<MotifConservation, number>;
  for (const m of Object.keys(LIBELLES_CONSERVATION) as MotifConservation[]) conservees[m] = 0;
  return { vues: 0, effacables: 0, octetsEffacables: 0, effacees: 0, octetsEffaces: 0, conservees, relecturesDrive: 0 };
}

/** Ajoute un verdict aux comptes. PUR (mute l'objet fourni, comme les autres compteurs du module). */
export function compter(c: ComptesVidage, v: Verdict): void {
  c.vues += 1;
  if (v.effacable) {
    c.effacables += 1;
    c.octetsEffacables += v.taille;
    return;
  }
  c.conservees[v.motif] += 1;
}

/** Le plafond par défaut d'une passe. Un vidage se fait par lots : on veut pouvoir s'arrêter et regarder. */
export const LOT_VIDAGE = 500;

/** L'option qui, SEULE, autorise l'effacement. Écrite une fois : un mot approchant ne doit rien déclencher. */
export const CONFIRMATION = '--je-confirme-effacement';

/**
 * L'EFFACEMENT EST-IL AUTORISÉ ? PUR.
 *
 * 🔴 DEUX OPTIONS, ET LES DEUX SONT EXIGÉES. `--appliquer` est l'option ordinaire du dépôt ; elle ne suffit pas ici,
 * parce qu'un effacement d'objets ne se répare pas comme une ligne de base. La seconde option doit être TAPÉE
 * entièrement, et son nom dit ce qu'elle fait.
 */
export function effacementAutorise(argv: readonly string[]): boolean {
  return argv.includes('--appliquer') && argv.includes(CONFIRMATION);
}

/** Le résumé d'une passe, lisible par quelqu'un qui n'a pas écrit le code. PUR. */
export function resumeVidage(c: ComptesVidage, appliquer: boolean): string[] {
  const lignes = [
    `pièces examinées ............ ${c.vues}`,
    `${appliquer ? 'pièces VIDÉES ...............' : 'pièces effaçables ..........'} `
      + `${appliquer ? c.effacees : c.effacables}`,
    `${appliquer ? 'octets libérés .............' : 'volume libérable ..........'} `
      + `${appliquer ? c.octetsEffaces : c.octetsEffacables}`,
    `relectures Drive ............ ${c.relecturesDrive}`,
    'conservées, par motif :',
  ];
  for (const m of Object.keys(LIBELLES_CONSERVATION) as MotifConservation[]) {
    if (c.conservees[m] > 0) lignes.push(`  ${String(c.conservees[m]).padStart(6)} · ${LIBELLES_CONSERVATION[m]}`);
  }
  return lignes;
}
