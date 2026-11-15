import { useSyncExternalStore } from 'react';
import { libererMicroSiLibre } from '../../../../lib/location/enregistreurVocal';

/**
 * ══ 🔴🔴 Arno (15/11/2026, 9e retour du test iPhone) — LE LECTEUR DES VOCAUX, UN SEUL POUR TOUTE LA PAGE ══════════════════════════════════
 * Tous les boutons « Écouter » (cartes des fichiers, prises, récapitulatif, consultation) passent par CE lecteur : un seul vocal joue à la
 * fois (en lancer un autre arrête le précédent) ; Lecture / Pause (la pause garde la position) ; les prises d'un fichier s'ENCHAÎNENT ;
 * la position et la durée sont publiées pour la barre de progression (« Lecture… 00:03 / 00:05 »).
 *  · la lecture démarre DANS le geste (appel direct de `play()` au toucher) : condition de l'iPhone ;
 *  · le micro gardé ouvert est relâché avant la lecture (sinon l'iPhone joue dans l'écouteur, à peine audible) ;
 *  · les sons du serveur sont servis par plages (206) : sans cela l'iPhone refusait de les lire (`plageOctets.ts`).
 */
export interface Piste { url: string; dureeS: number }
export interface EtatLecteur { cle: string | null; enLecture: boolean; positionS: number; dureeS: number; motif: string | null }
export const MOTIF_LECTURE_IMPOSSIBLE = 'Lecture impossible sur cet appareil : réessayez.';
const REPOS: EtatLecteur = { cle: null, enLecture: false, positionS: 0, dureeS: 0, motif: null };

let etat: EtatLecteur = REPOS;
const abonnes = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let pistes: Piste[] = [];
let rang = 0;

function publier(e: EtatLecteur): void { etat = e; abonnes.forEach((f) => f()); }
const connue = (p: Piste): number => (Number.isFinite(p.dureeS) && p.dureeS > 0 ? p.dureeS : 0);
/** la durée totale : la somme des prises si toutes sont connues ; sinon ce qui est connu, plus la prise en cours telle que lue */
function dureeTotale(a: HTMLAudioElement | null): number {
  const somme = pistes.reduce((t, p) => t + connue(p), 0);
  if (pistes.every((p) => connue(p) > 0)) return somme;
  const courante = a !== null && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
  return pistes.slice(0, rang).reduce((t, p) => t + connue(p), 0) + courante;
}
function suivre(): void {
  const a = audio;
  if (a === null || etat.cle === null) return;
  const avant = pistes.slice(0, rang).reduce((t, p) => t + connue(p), 0);
  const total = dureeTotale(a);
  publier({ ...etat, positionS: Math.min(avant + (Number.isFinite(a.currentTime) ? a.currentTime : 0), total > 0 ? total : Infinity), dureeS: total });
}
function element(): HTMLAudioElement | null {
  if (audio !== null) return audio;
  if (typeof Audio === 'undefined') return null;
  const a = new Audio();
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  a.addEventListener('timeupdate', suivre);
  a.addEventListener('loadedmetadata', suivre);
  a.addEventListener('ended', () => {
    if (etat.cle === null) return;
    if (rang + 1 < pistes.length) { rang += 1; a.src = pistes[rang].url; jouer(); return; }
    pistes = []; rang = 0; publier(REPOS);
  });
  a.addEventListener('error', () => { if (etat.cle !== null && a.getAttribute('src')) publier({ ...etat, enLecture: false, motif: MOTIF_LECTURE_IMPOSSIBLE }); });
  audio = a;
  return a;
}
function jouer(): void {
  const a = element();
  if (a === null) return;
  publier({ ...etat, enLecture: true, motif: null });
  try {
    const p = a.play() as Promise<void> | undefined;
    p?.catch?.((e: { name?: string }) => { if (e?.name !== 'AbortError' && etat.cle !== null) publier({ ...etat, enLecture: false, motif: MOTIF_LECTURE_IMPOSSIBLE }); });
  } catch { publier({ ...etat, enLecture: false, motif: MOTIF_LECTURE_IMPOSSIBLE }); }
}

/** Arrête tout (position remise à zéro). */
export function arreterLecture(): void {
  const a = audio;
  if (a !== null) { try { a.pause(); } catch { /* rien */ } }
  pistes = []; rang = 0;
  if (etat !== REPOS) publier(REPOS);
}
/** Le geste de CHAQUE bouton : lance ce vocal (et arrête l'autre), ou le met en pause, ou le reprend. Appelé dans le toucher. */
export function basculerLecture(cle: string, ps: readonly Piste[]): void {
  if (etat.cle === cle && pistes.length > 0) {
    if (etat.enLecture) { try { audio?.pause(); } catch { /* rien */ } publier({ ...etat, enLecture: false }); return; }
    jouer(); return;
  }
  arreterLecture();
  const valides = ps.filter((p) => p.url !== '');
  if (valides.length === 0) return;
  libererMicroSiLibre();
  const a = element();
  if (a === null) return;
  pistes = [...valides]; rang = 0;
  publier({ cle, enLecture: true, positionS: 0, dureeS: dureeTotale(null), motif: null });
  a.src = pistes[0].url;
  jouer();
}
export const etatLecture = (): EtatLecteur => etat;
const souscrire = (f: () => void): (() => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

/** L'état du lecteur, pour un bouton (rendu à chaque changement). */
export function useLecteurVocal(): EtatLecteur {
  return useSyncExternalStore(souscrire, etatLecture, () => REPOS);
}
/** Épreuves : l'état initial (aucun élément audio gardé). */
export function oublierLecteur(): void { audio = null; pistes = []; rang = 0; etat = REPOS; }
