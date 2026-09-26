/**
 * MODULE « GESTION » — LOT DRIVE-2 : CE QUE LA COPIE DÉCIDE. Module PUR (aucune base, aucun réseau, aucune horloge
 * sinon celle qu'on lui passe).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 « COPIÉ » NE VEUT RIEN DIRE SANS VÉRIFICATION. Drive accepte un envoi et rend un identifiant ; cela ne prouve
 * pas que les octets arrivés sont ceux qu'on a lus. On compare donc l'empreinte MD5 **et** la taille rendues par
 * Drive à celles calculées sur l'original MinIO. Tant que cette comparaison n'a pas eu lieu, la copie est DOUTEUSE,
 * et une copie douteuse sera refaite — après avoir mis le fichier douteux à la corbeille Drive.
 *
 * 🔴 POURQUOI LES DEUX, MD5 ET TAILLE. Le MD5 suffirait s'il était toujours là ; il ne l'est pas — Drive ne le rend
 * pas pour certains types (documents Google, fichiers chiffrés côté client). La taille, elle, est toujours rendue.
 * Exiger le MD5 quand il existe, et se rabattre sur la taille seule quand il n'existe pas, en le DISANT : c'est la
 * seule façon de ne jamais marquer « vérifié » ce qu'on n'a pas vérifié.
 *
 * 🔴 CE MODULE NE COPIE RIEN. Il nomme, il compare, il décide quoi faire d'une ligne existante. L'écriture est
 * ailleurs (`copiePiecesReel.ts`) et passe par le garde-fou de DRIVE-1, comme toute écriture Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { nettoyerTexteNom } from './driveGardeFou';
import type { Confiance, Destination, Regle } from './triPieces';

/** Longueur maximale d'un nom de fichier dans Drive. Au-delà, la colonne devient illisible et certains clients calent. */
export const NOM_FICHIER_MAX = 150;

// ── LE NOM DU FICHIER DANS DRIVE ──────────────────────────────────────────────────────────────────────────────────

/**
 * « AAAA-MM-JJ — expéditeur — nom d'origine ».
 *
 * 🔴 LA DATE EN TÊTE, ET EN ISO. C'est le seul format qui se trie tout seul dans une colonne Drive : « 2024-03-07 »
 * se range après « 2024-02-28 », ce que « 07/03/2024 » ne fait pas. L'équipe lit des dates françaises partout
 * ailleurs dans l'outil ; ici, le tri prime, parce qu'un dossier de 300 pièces ne se lit que trié.
 *
 * ⚠️ L'EXPÉDITEUR EST RÉDUIT À SA PARTIE LOCALE quand l'adresse est longue : « jean.dupont@quelque-chose-de-tres-
 * long.fr » devient « jean.dupont ». Le nom complet reste dans la DESCRIPTION du fichier, qui n'a pas de limite.
 *
 * ⚠️ LE NOM D'ORIGINE N'EST JAMAIS PERDU : c'est lui qu'on tronque en dernier, et son EXTENSION est conservée —
 * un fichier sans extension ne s'ouvre pas au double-clic.
 */
export function nomFichierDrive(o: { date: string; expediteur: string; nomOrigine: string }): string {
  const date = (o.date ?? '').slice(0, 10);
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'date inconnue';

  const brut = (o.expediteur ?? '').trim();
  const expediteur = brut === '' ? 'expéditeur inconnu'
    : brut.length > 40 && brut.includes('@') ? brut.slice(0, brut.indexOf('@')) : brut;

  const origine = (o.nomOrigine ?? '').trim() || 'pièce sans nom';
  // 🔴 ON NETTOIE SANS BORNER, PUIS ON TRONQUE NOUS-MÊMES. Laisser `nettoyerNom` couper à sa borne à lui
  //   effacerait l'extension qu'on vient de prendre soin de garder (défaut mesuré, cf. le test).
  // ⚠️ On nettoie les MORCEAUX, pas le préfixe assemblé : `nettoyerTexteNom` supprime les espaces de bord, et
  //   mangeait l'espace qui sépare le préfixe du nom de fichier.
  const prefixe = `${nettoyerTexteNom(jour)} — ${nettoyerTexteNom(expediteur)} — `;
  const place = NOM_FICHIER_MAX - prefixe.length;
  const nom = nettoyerTexteNom(origine);
  return prefixe + (nom.length <= place ? nom : tronquerEnGardantExtension(nom, place));
}

/** Tronque un nom de fichier en LUI LAISSANT son extension : sans elle, il ne s'ouvre plus au double-clic. PUR. */
export function tronquerEnGardantExtension(nom: string, place: number): string {
  if (place < 8) return nom.slice(0, Math.max(1, place));
  const point = nom.lastIndexOf('.');
  const ext = point > 0 && nom.length - point <= 10 ? nom.slice(point) : '';
  const corps = ext === '' ? nom : nom.slice(0, point);
  return `${corps.slice(0, Math.max(1, place - ext.length - 1))}…${ext}`;
}

/**
 * LA DESCRIPTION DU FICHIER DRIVE : de quoi retrouver le mail d'origine sans quitter le Drive.
 *
 * 🔴 L'IDENTIFIANT INTERNE DE LA PIÈCE Y FIGURE, et c'est le plus important : un nom de fichier peut être renommé
 * par n'importe qui, la description reste, et ce numéro mène au mail exact dans notre outil.
 */
export function descriptionFichierDrive(o: {
  pieceId: number; messageId: number; objet: string; date: string; expediteur: string;
  regle: Regle; confiance: Confiance; motif: string;
}): string {
  const lignes = [
    `Objet : ${(o.objet ?? '').trim() || '(sans objet)'}`,
    `Reçu le : ${(o.date ?? '').slice(0, 10)}`,
    `Expéditeur : ${(o.expediteur ?? '').trim() || '(inconnu)'}`,
    `Pièce n° ${o.pieceId} · message n° ${o.messageId} (identifiants internes Sans Vis-à-Vis)`,
    `Rangé par la règle ${o.regle} (confiance ${o.confiance}) : ${o.motif}`,
  ];
  return lignes.join('\n');
}

// ── LA VÉRIFICATION ───────────────────────────────────────────────────────────────────────────────────────────────

export type Verification =
  | { ok: true; parMd5: boolean; motif: string }
  | { ok: false; motif: string };

/**
 * LE FICHIER ARRIVÉ EST-IL CELUI QU'ON A ENVOYÉ ?
 *
 * ⚠️ UNE TAILLE QUI CORRESPOND N'EST PAS UNE PREUVE — deux fichiers différents peuvent peser pareil. Quand Drive
 * rend un MD5, c'est LUI qui fait foi et la taille n'est qu'un contrôle de plus. Quand il n'en rend pas, on
 * accepte la taille seule, mais le résultat le DIT (`parMd5: false`) pour que le rapport puisse compter à part ce
 * qui n'a pas pu être vérifié au mieux.
 */
export function verifierCopie(o: {
  md5Attendu: string | null; md5Rendu: string | null | undefined;
  tailleAttendue: number; tailleRendue: number | null | undefined;
}): Verification {
  const tailleRendue = typeof o.tailleRendue === 'number' && Number.isFinite(o.tailleRendue) ? o.tailleRendue : null;
  if (tailleRendue === null) {
    return { ok: false, motif: 'Drive n’a pas rendu la taille du fichier : impossible de vérifier quoi que ce soit.' };
  }
  if (tailleRendue !== o.tailleAttendue) {
    return {
      ok: false,
      motif: `La taille ne correspond pas : ${o.tailleAttendue} octets envoyés, ${tailleRendue} reçus par Drive.`,
    };
  }

  const attendu = (o.md5Attendu ?? '').trim().toLowerCase();
  const rendu = (o.md5Rendu ?? '').trim().toLowerCase();
  if (attendu !== '' && rendu !== '') {
    return attendu === rendu
      ? { ok: true, parMd5: true, motif: 'empreinte MD5 et taille identiques' }
      : { ok: false, motif: `L’empreinte ne correspond pas : ${attendu} attendue, ${rendu} rendue par Drive.` };
  }
  return {
    ok: true, parMd5: false,
    motif: rendu === ''
      ? 'taille identique ; Drive n’a pas rendu d’empreinte pour ce type de fichier'
      : 'taille identique ; empreinte de l’original indisponible',
  };
}

// ── CE QU'ON FAIT D'UNE LIGNE DÉJÀ PRÉSENTE ───────────────────────────────────────────────────────────────────────

/** Ce que la base sait déjà d'une pièce, pour décider s'il faut la copier. */
export interface DepotConnu {
  driveFileId: string;
  driveDossierId: string;
  verifie: boolean;
}

export type Conduite =
  /** Déjà copiée et vérifiée : on n'y touche pas, où qu'elle soit. */
  | { faire: 'passer'; motif: string }
  /** Jamais copiée : on copie. */
  | { faire: 'copier'; motif: string }
  /** Copiée mais NON vérifiée : on met le fichier douteux à la corbeille, puis on recopie. */
  | { faire: 'refaire'; corbeille: string; motif: string };

/**
 * QUE FAIRE DE CETTE PIÈCE ?
 *
 * 🔴 UNE PIÈCE VÉRIFIÉE N'EST JAMAIS RENVOYÉE, MÊME SI LA DÉCISION DE TRI A CHANGÉ. C'est un choix, et il mérite
 * d'être dit : recopier vers la nouvelle destination laisserait DEUX exemplaires dans le Drive, et supprimer
 * l'ancien reviendrait à effacer un fichier qu'un humain a peut-être déjà déplacé ou annoté. Le jour où un
 * reclassement sera voulu, ce sera un lot à part, avec ses propres garanties.
 *
 * 🔴 UNE COPIE NON VÉRIFIÉE EST REFAITE, et le fichier douteux part à la corbeille Drive — le SEUL geste de
 * suppression autorisé par ce lot, et uniquement sur un fichier que le programme a lui-même créé et enregistré.
 * Le laisser en place donnerait un doublon silencieux, dont personne ne saurait lequel est bon.
 */
export function conduiteAtenir(connu: DepotConnu | null): Conduite {
  if (connu === null) return { faire: 'copier', motif: 'jamais copiée' };
  if (connu.verifie) {
    return { faire: 'passer', motif: `déjà copiée et vérifiée (fichier ${connu.driveFileId})` };
  }
  return {
    faire: 'refaire', corbeille: connu.driveFileId,
    motif: `copie précédente non vérifiée (fichier ${connu.driveFileId}) — mise à la corbeille, puis recopie`,
  };
}

// ── LE RYTHME ET L'ARRÊT PROPRE ───────────────────────────────────────────────────────────────────────────────────

/** Pause entre deux copies. Drive tolère confortablement cette cadence pour un utilisateur délégué. */
export const PAUSE_COPIE_MS = 250;
/** Au-delà, on s'arrête : insister sur une panne durable ne fait qu'allonger la liste des échecs. */
export const ECHECS_CONSECUTIFS_MAX = 10;
/** Première attente après un ralentissement de Google ; elle double à chaque essai. */
export const ATTENTE_INITIALE_MS = 2_000;
export const REESSAIS_MAX = 6;

/** L'attente après le n-ième échec consécutif, bornée à cinq minutes. PUR. */
export function attenteApresEchec(n: number): number {
  return Math.min(ATTENTE_INITIALE_MS * 2 ** Math.max(0, n - 1), 300_000);
}

/**
 * FAUT-IL S'ARRÊTER ? Rend le motif EN CLAIR, ou `null` pour continuer.
 *
 * ⚠️ UNE PASSE DE NUIT DOIT S'ARRÊTER TOUTE SEULE. Personne ne la regarde : une boucle qui insiste sur une panne
 * durable remplit le journal, épuise le quota du lendemain, et laisse au réveil un état qu'on ne sait pas lire.
 */
export function motifArret(o: {
  echecsConsecutifs: number; restantes: number; limiteAtteinte: boolean;
}): string | null {
  if (o.echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) {
    return `${o.echecsConsecutifs} échecs d’affilée : la copie s’arrête plutôt que d’insister. `
      + 'Regardez les derniers motifs ci-dessus — un quota épuisé se règle en attendant, un droit refusé non.';
  }
  if (o.limiteAtteinte) return 'limite demandée atteinte (--limite)';
  if (o.restantes === 0) return null;
  return null;
}

// ── LE SUIVI ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Avancement {
  faites: number;
  restantes: number;
  octetsFaits: number;
  octetsRestants: number;
  echecs: number;
  /** Millisecondes écoulées depuis le début de la passe. */
  ecouleMs: number;
}

/** Une taille en octets, dite en français. PUR. */
export function tailleFr(octets: number): string {
  if (octets >= 1024 ** 3) return `${(octets / 1024 ** 3).toFixed(1)} Go`;
  if (octets >= 1024 ** 2) return `${(octets / 1024 ** 2).toFixed(0)} Mo`;
  if (octets >= 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${octets} o`;
}

/** Une durée en millisecondes, dite en français. PUR. */
export function dureeFr(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * LA LIGNE DE PROGRESSION, lisible par quelqu'un qui regarde le journal à 2 h du matin. PUR.
 *
 * ⚠️ L'ESTIMATION SE FONDE SUR LES OCTETS, PAS SUR LE NOMBRE DE PIÈCES : 200 photos de 5 Mo ne coûtent pas le
 * temps de 200 accusés de réception de 20 Ko. Tant qu'on n'a rien copié, on ne prédit RIEN plutôt que de prédire
 * n'importe quoi.
 */
export function ligneAvancement(a: Avancement): string {
  const total = a.faites + a.restantes;
  const pct = total === 0 ? 100 : Math.floor((a.faites / total) * 100);
  const debit = a.ecouleMs > 0 && a.octetsFaits > 0 ? a.octetsFaits / (a.ecouleMs / 1000) : 0;
  const reste = debit > 0
    ? ` · fin estimée dans ${dureeFr((a.octetsRestants / debit) * 1000)}`
    : ' · fin estimée : pas encore assez de mesures';
  const vitesse = debit > 0 ? ` · ${tailleFr(debit)}/s` : '';
  return `${a.faites}/${total} pièces (${pct} %) · ${tailleFr(a.octetsFaits)} copiés`
    + `${vitesse} · ${a.echecs} échec${a.echecs > 1 ? 's' : ''}${reste}`;
}

/** Le chemin « 00 Non rattachés / AAAA / MM » d'une destination non rattachée. PUR. */
export function cheminNonRattache(d: Extract<Destination, { sorte: 'non_rattache' }>): string[] {
  return [d.annee, d.mois];
}
