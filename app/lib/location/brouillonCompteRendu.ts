/**
 * ══ 🔴🔴 Arno (15/11/2026, 6e retour du test iPhone) — LE BROUILLON DU COMPTE RENDU DE PRÉ-VISITE ════════════════════════════════════════
 * « Aucune saisie ne doit jamais être perdue. » Ce que le formulaire enregistre tout seul (après chaque modification, et à chaque passage en
 * arrière-plan) : le texte, les présences, les personnes ajoutées et leurs notes, les photos DÉJÀ déposées (numéro de pièce) et leurs
 * légendes, les fichiers vocaux (nom, prises déjà déposées, « envoyé aux locataires »), l'état du bouton d'envoi aux locataires.
 * Jamais un fichier : des numéros de pièces du stockage objet. PUR, sans import : lu par l'écran comme par le serveur.
 */
export interface PersonneBrouillon { cle: string; civilite: 'Madame' | 'Monsieur'; nom: string; prenom: string; present: boolean; note: string }
/* 🔴🔴 Arno (15/11/2026, 9e retour) — JAMAIS DE VOCAL NI DE PHOTO FANTÔME : le brouillon référence AUSSI les prises et les photos pas encore
   confirmées par le serveur (`id` absent, `cle` de l'appareil). À la réouverture, celle qu'on ne retrouve ni sur le serveur ni dans le
   téléphone est signalée « vide ou perdue » (en rouge, bloquante) au lieu de disparaître en silence. `perdue` : posé par le serveur quand la
   pièce référencée n'existe plus. */
export interface PhotoBrouillon { id?: number; cle?: string; legende: string; perdue?: boolean }
export interface PriseBrouillon { id?: number; cle?: string; dureeS: number; perdue?: boolean }
export interface FichierBrouillon { cle: string; nom: string; locataires: boolean; prises: PriseBrouillon[] }
export interface ContenuBrouillon {
  corps: string; presents: number[]; ajoutees: PersonneBrouillon[]; photos: PhotoBrouillon[]; fichiers: FichierBrouillon[]; aussiLocataires: boolean;
  /** 🔴 Arno (15/11/2026, 8e retour) — le fichier vocal ACTIF (destination des prochaines prises), par sa clé ; null : le dernier */
  fichierActif: string | null;
  /** 🔴 (16/11/2026) « Absence de la partie locataire » cochée */
  absence: boolean;
  /** 🔴 (16/11/2026) le bouton « Compte rendu envoyé aux propriétaires » (désactivé par défaut) et les adresses cochées (`<propriétaire>|<adresse>`) ;
   *  null : jamais choisies (toutes cochées par défaut) */
  aussiProprietaires: boolean;
  adressesProprietaires: string[] | null;
}

export const BROUILLON_VIDE: ContenuBrouillon = { corps: '', presents: [], ajoutees: [], photos: [], fichiers: [], aussiLocataires: true, fichierActif: null,
  absence: false, aussiProprietaires: false, adressesProprietaires: null };
const CORPS_MAX = 20_000; const PHOTOS_MAX = 40; const FICHIERS_MAX = 20; const PRISES_MAX = 40; const PERSONNES_MAX = 10;

const texte = (x: unknown, max: number): string => (typeof x === 'string' ? x.replace(/\u0000/g, '').slice(0, max) : '');
const ligne = (x: unknown, max: number): string => texte(x, max).replace(/[\u0000-\u001f\u007f]/g, ' ');
const entier = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x > 0 ? x : null);
const tableau = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Le contenu reçu, propre et borné ; ce qui ne tient pas est laissé de côté (jamais une erreur : un brouillon n'est jamais refusé). PUR. */
export function nettoyerBrouillon(brut: unknown): ContenuBrouillon {
  const o = (brut ?? {}) as Record<string, unknown>;
  const presents = [...new Set(tableau(o.presents).map(entier).filter((x): x is number => x !== null))].slice(0, 20);
  const ajoutees = tableau(o.ajoutees).slice(0, PERSONNES_MAX).flatMap((x): PersonneBrouillon[] => {
    const p = (x ?? {}) as Record<string, unknown>;
    const civilite = p.civilite === 'Madame' || p.civilite === 'Monsieur' ? p.civilite : null;
    const nom = ligne(p.nom, 80).trim();
    if (civilite === null || nom === '') return [];
    return [{ cle: ligne(p.cle, 60) || `p${Math.random().toString(36).slice(2)}`, civilite, nom, prenom: ligne(p.prenom, 80).trim(), present: p.present !== false, note: ligne(p.note, 120) }];
  });
  const vus = new Set<number>();
  const photos = tableau(o.photos).slice(0, PHOTOS_MAX).flatMap((x): PhotoBrouillon[] => {
    const p = (x ?? {}) as Record<string, unknown>; const id = entier(p.id); const cle = ligne(p.cle, 80);
    if (id === null) return cle === '' ? [] : [{ cle, legende: ligne(p.legende, 200) }]; // pas encore confirmée : référencée par sa clé
    if (vus.has(id)) return [];
    vus.add(id); return [{ id, legende: ligne(p.legende, 200) }];
  });
  let prisesVues = 0;
  const fichiers = tableau(o.fichiers).slice(0, FICHIERS_MAX).map((x, i): FichierBrouillon => {
    const f = (x ?? {}) as Record<string, unknown>;
    const prises = tableau(f.prises).flatMap((y): PriseBrouillon[] => {
      const p = (y ?? {}) as Record<string, unknown>; const id = entier(p.id); const cle = ligne(p.cle, 80);
      if ((id === null && cle === '') || prisesVues >= PRISES_MAX) return [];
      prisesVues += 1;
      const d = typeof p.dureeS === 'number' && Number.isFinite(p.dureeS) && p.dureeS >= 0 ? Math.min(p.dureeS, 3600) : 0;
      return [id !== null ? { id, dureeS: d } : { cle, dureeS: d }]; // pas encore confirmée : référencée par sa clé
    });
    return { cle: ligne(f.cle, 60) || `f${i}`, nom: ligne(f.nom, 60), locataires: f.locataires === true, prises };
  });
  const actif = ligne(o.fichierActif, 60);
  const absence = o.absence === true;
  const adresses = Array.isArray(o.adressesProprietaires)
    ? [...new Set(o.adressesProprietaires.map((x) => ligne(x, 320).trim()).filter((x) => x !== ''))].slice(0, 40) : null;
  // l'absence cochée : aucun locataire coché (les cases sont décochées et grisées)
  return { corps: texte(o.corps, CORPS_MAX), presents: absence ? [] : presents, ajoutees, photos, fichiers, aussiLocataires: o.aussiLocataires !== false,
    fichierActif: actif !== '' && fichiers.some((f) => f.cle === actif) ? actif : null,
    absence, aussiProprietaires: o.aussiProprietaires === true, adressesProprietaires: adresses };
}

/** Le brouillon est-il vide (rien à garder) ? PUR. */
export function brouillonVide(c: ContenuBrouillon): boolean {
  return c.corps.trim() === '' && c.presents.length === 0 && c.ajoutees.length === 0 && c.photos.length === 0 && c.fichiers.every((f) => f.prises.length === 0 && f.nom.trim() === '')
    && c.aussiLocataires && !c.absence && !c.aussiProprietaires;
}

/** « 14h05 » à Paris. PUR. */
export function heureBrouillon(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('hour')}h${v('minute')}`;
}

export const messageBrouillonRestaure = (iso: string): string => `Brouillon restauré — enregistré à ${heureBrouillon(iso)}`;

/** L'indicateur discret en haut du formulaire. */
export type EtatSauvegarde = 'enregistre' | 'enregistrement' | 'hors_ligne' | 'local' | 'echec';
export const LIBELLE_SAUVEGARDE: Record<EtatSauvegarde, string> = {
  enregistre: 'Enregistré',
  enregistrement: 'Enregistrement…',
  hors_ligne: 'Hors ligne — sera enregistré au retour du réseau',
  local: 'Brouillon gardé sur cet appareil',
  echec: 'Enregistrement impossible pour l’instant — nouvel essai automatique',
};

/** 🔴 Arno (15/11/2026, 7e retour) — le PETIT CARTOUCHE sur la ligne de « ← Retour » (le grand bandeau et la pastille sont retirés, accord d'Arno). */
export const LIBELLE_CARTOUCHE: Record<EtatSauvegarde, string> = {
  enregistre: 'Enregistré', enregistrement: 'Enregistrement…', hors_ligne: 'Hors ligne', local: 'Sur cet appareil', echec: 'Hors ligne',
};
/** Ce qu'un appui sur le cartouche affiche : « Dernier enregistrement à HHhMM », et « Brouillon restauré » si la page a été rouverte. PUR. */
export function detailCartouche(dernier: string | null, restaure: boolean): string {
  const quand = dernier === null ? 'Pas encore enregistré' : `Dernier enregistrement à ${heureBrouillon(dernier)}`;
  return restaure ? `${quand} · Brouillon restauré` : quand;
}
