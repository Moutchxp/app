'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { autreUnite, LIBELLE_UNITE, type MontantSaisi } from '../../../../lib/transaction/commissions';
import { ESPACE, eur, nombreFr } from '../../../../lib/transaction/format';
import { TVA } from '../../../../lib/transaction/modele';
import { CSS_TRIANGLE, CSS_TRIANGLE_BOITE } from '../_composants/TriangleDepliage';

/** TUILE TRANSACTION — le socle des écrans : lecture de la route, envoi d'un geste, formats. Aucun calcul métier ici (`modele.ts`). */
export const API_TRANSACTION = '/api/admin/transaction';

export type Lecture<T> = { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: T };

/** Lit `?<parametres>` ; `relire()` relit (après un geste). */
export function useTransaction<T>(parametres: string): { lu: Lecture<T>; relire: () => void } {
  const [lu, setLu] = useState<Lecture<T>>({ etat: 'charge' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_TRANSACTION}?${parametres}`, { cache: 'no-store' })
      .then(async (r) => (r.status === 401 || r.status === 403 ? { etat: 'refus' } : r.json()))
      .then((x: { etat?: string; data?: T; message?: string; motif?: string }) => {
        if (!vivant) return;
        if (x.etat === 'ok' && x.data !== undefined) setLu({ etat: 'ok', data: x.data });
        else setLu({ etat: 'erreur', message: x.etat === 'refus' ? 'Accès refusé : droit « Transaction » requis (ou session expirée).' : x.motif ?? x.message ?? 'Lecture impossible.' });
      })
      .catch(() => { if (vivant) setLu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [parametres, n]);
  return { lu, relire: useCallback(() => setN((x) => x + 1), []) };
}

/** Envoie un geste ; rend `null` s'il est accepté, sinon le motif (montré tel quel). */
export async function posterTransaction(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(API_TRANSACTION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (r.status === 401 || r.status === 403) return 'Accès refusé : droit « Transaction » requis (ou session expirée).';
    const d = await r.json() as { etat?: string; motif?: string; message?: string };
    return d.etat === 'ok' ? null : d.motif ?? d.message ?? 'Enregistrement refusé.';
  } catch {
    return 'Enregistrement impossible : le serveur n’a pas répondu.';
  }
}

/** 🔴 LOT AC — le même envoi, avec la donnée rendue (ex. l'id d'un apporteur créé) : `motif` null quand c'est accepté. */
export async function posterTransactionDonnee<T>(corps: Record<string, unknown>): Promise<{ motif: string | null; data: T | null }> {
  try {
    const r = await fetch(API_TRANSACTION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (r.status === 401 || r.status === 403) return { motif: 'Accès refusé : droit « Transaction » requis (ou session expirée).', data: null };
    const d = await r.json() as { etat?: string; motif?: string; message?: string; data?: T };
    return d.etat === 'ok' ? { motif: null, data: d.data ?? null } : { motif: d.motif ?? d.message ?? 'Enregistrement refusé.', data: null };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.', data: null };
  }
}

// 🔴 LOT AM — LE format unique des montants (milliers séparés par une espace insécable VISIBLE, U+00A0) : `lib/transaction/format.ts`.
export { eur, nombreFr, pctFr, ESPACE, grouperSaisie } from '../../../../lib/transaction/format';
/** LOT I — un montant avec SON unité et son équivalent : « 1 000,00 € HT (soit 1 200,00 € TTC) ». */
export const eurUnite = (m: MontantSaisi): string => { const a = autreUnite(m); return `${eur(m.montant)}${ESPACE}${LIBELLE_UNITE[m.unite]} (soit ${eur(a.montant)}${ESPACE}${LIBELLE_UNITE[a.unite]})`; };
/** LOT J — un montant avec son unité et, entre parenthèses, son équivalent : « 800,00 € HT (960,00 € TTC) ». */
export const eurEtEquivalent = (m: MontantSaisi): string => { const a = autreUnite(m); return `${eur(m.montant)}${ESPACE}${LIBELLE_UNITE[m.unite]} (${eur(a.montant)}${ESPACE}${LIBELLE_UNITE[a.unite]})`; };
const pct = (x: number): string => `${nombreFr(x * 100, { maximumFractionDigits: 1 })}${ESPACE}%`;
export const signePct = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x))}`);
export const ecartEur = (x: number): string => `${x >= 0 ? '+' : '−'}${eur(Math.abs(x))}`;

// ── 🔴 LOT AM (Arno, 29/10/2026) : LE BOUTON « HT | TTC » DE L'ONGLET COMPROMIS ─────────────────────────────────────────────────────────
//
// Le choix décide quel montant s'affiche EN GRAND ; l'autre suit, en petit, entre parenthèses, dessous (ou à côté), toujours dans le même
// ordre — dans tout le bloc « Compromis en cours » (tuiles, cartes, répartition, ligne miroir, fenêtre, montants affichés des formulaires).
// Retenu dans le navigateur (le même pour CRITERIMMO et MACJ), TTC par défaut. Les champs de SAISIE gardent leur propre unité : ce choix
// ne change que l'affichage, jamais une valeur enregistrée. COULEURS selon le SENS du montant (plus selon HT / TTC) : rouge = versé ou
// déduit ; vert = CA, reçu, solde ; sinon l'encre — le grand et le petit de la même couleur, le petit plus léger.

export type UniteAffichage = 'ht' | 'ttc';
export const CLE_AFFICHAGE = 'trx-affichage-montants';
export const UNITE_AFFICHAGE_DEFAUT: UniteAffichage = 'ttc';
export const MOT_UNITE: Record<UniteAffichage, string> = { ht: 'HT', ttc: 'TTC' };
export function lireAffichage(): UniteAffichage {
  try { const x = window.localStorage.getItem(CLE_AFFICHAGE); return x === 'ht' || x === 'ttc' ? x : UNITE_AFFICHAGE_DEFAUT; } catch { return UNITE_AFFICHAGE_DEFAUT; }
}
/** Le choix retenu, et son changement (gardé dans le navigateur ; sans stockage, l'écran marche quand même). */
export function useAffichageRetenu(): [UniteAffichage, (u: UniteAffichage) => void] {
  const [u, setU] = useState<UniteAffichage>(lireAffichage);
  const changer = useCallback((x: UniteAffichage) => {
    setU(x);
    try { window.localStorage.setItem(CLE_AFFICHAGE, x); } catch { /* préférence d'affichage seulement */ }
  }, []);
  return [u, changer];
}
const ContexteAffichage = createContext<UniteAffichage>(UNITE_AFFICHAGE_DEFAUT);
export const FournisseurAffichage = ContexteAffichage.Provider;
/** L'unité affichée en grand (TTC hors d'un onglet Compromis). */
export const useAffichage = (): UniteAffichage => useContext(ContexteAffichage);
/**
 * 🔴 LOT CG (Arno) — LE NOM AFFICHÉ DES NÉGOCIATEURS (« Prénom NOM ») : la table « libellé → nom » envoyée par le serveur (compte, fiche sans compte,
 * sinon le libellé en prénom) ; `useNommer()` rend la fonction d'affichage (un libellé absent de la table : tel quel).
 */
const ContexteNoms = createContext<Readonly<Record<string, string>>>({});
export const FournisseurNoms = ContexteNoms.Provider;
export function useNommer(): (libelle: string) => string {
  const table = useContext(ContexteNoms);
  return useCallback((libelle: string) => table[libelle] ?? libelle, [table]);
}
/** 🔴 LOT AN — le changement de l'unité, partagé : les formulaires et panneaux montrent le même sélecteur, synchronisé avec le bloc. */
const ContexteChangerAffichage = createContext<((u: UniteAffichage) => void) | null>(null);
export const FournisseurChangerAffichage = ContexteChangerAffichage.Provider;
/** Le sélecteur « HT | TTC » relié à celui du bloc (rien hors d'un onglet Compromis). */
export function SelecteurAffichage() {
  const unite = useAffichage();
  const changer = useContext(ContexteChangerAffichage);
  return changer === null ? null : <BoutonAffichage unite={unite} onChange={changer} />;
}

/** Le sens d'un montant : sa couleur. */
export type Sens = 'verse' | 'recu' | 'neutre';
export const CLASSE_SENS: Record<Sens, string> = { verse: 'trx-rouge', recu: 'trx-vert', neutre: '' };
/**
 * 🔴 LOT CM (Arno) — LA SEULE RÈGLE DE COULEUR D'UN MONTANT : un COÛT (« versé », rouge) qui vaut 0 (en HT et en TTC, au centime) s'affiche en
 * GRIS, comme une com à 0 ; un montant vert (CA, reste) garde sa couleur même à 0. Utilisée partout dans la tuile (cartes, Résultat, espace par
 * négociateur, fenêtres, synthèse, tuiles, répartition). PUR.
 */
export const montantNul = (ht: number, ttc: number): boolean => Math.round(ht * 100) === 0 && Math.round(ttc * 100) === 0;
export const classeSens = (sens: Sens, ht: number, ttc: number): string => (sens === 'verse' && montantNul(ht, ttc) ? 'trx-cout-nul' : CLASSE_SENS[sens]);

/** Un montant seul, dans l'unité affichée (« 6 500,00 € TTC ») — l'opérande d'un calcul. PUR. */
export const montantAffiche = (u: UniteAffichage, ht: number, ttc: number): string => `${eur(u === 'ttc' ? ttc : ht)}${ESPACE}${MOT_UNITE[u]}`;
/** Les deux montants en texte : « 7 500,00 € TTC (6 250,00 € HT) » dans l'ordre affiché. PUR. */
export const montantsTexte = (u: UniteAffichage, ht: number, ttc: number): string =>
  `${montantAffiche(u, ht, ttc)} (${montantAffiche(u === 'ttc' ? 'ht' : 'ttc', ht, ttc)})`;
/** Le HT et le TTC d'un montant saisi dans son unité. PUR. */
export const htTtcDe = (m: MontantSaisi): { ht: number; ttc: number } => (m.unite === 'ht' ? { ht: m.montant, ttc: m.montant * TVA } : { ht: m.montant / TVA, ttc: m.montant });

/**
 * 🔴 LOT AM — DEUX MONTANTS : l'unité choisie en grand, l'autre en petit entre parenthèses, dessous (`pile`, défaut) ou à côté (`ligne`).
 * `donneesHt` / `donneesTtc` : les marques de chaque unité (où qu'elle soit affichée) ; `suffixe` : un mot après le grand (« versées »).
 */
export function Montants({ ht, ttc, sens = 'neutre', disposition = 'pile', suffixe, donnees, donneesHt, donneesTtc, classe }: {
  ht: number; ttc: number; sens?: Sens; disposition?: 'pile' | 'ligne'; suffixe?: ReactNode;
  donnees?: Record<string, string>; donneesHt?: Record<string, string>; donneesTtc?: Record<string, string>; classe?: string;
}) {
  const u = useAffichage();
  const autre: UniteAffichage = u === 'ttc' ? 'ht' : 'ttc';
  const valeur = (x: UniteAffichage): number => (x === 'ttc' ? ttc : ht);
  const marques = (x: UniteAffichage): Record<string, string> | undefined => (x === 'ttc' ? donneesTtc : donneesHt);
  const couleur = classeSens(sens, ht, ttc);
  return (
    <span className={`trx-mt trx-mt--${disposition}${classe ? ` ${classe}` : ''}`} data-montants={u} {...donnees}>
      <strong className={`trx-mt-grand${couleur ? ` ${couleur}` : ''}`} data-montant-grand><span className={couleur || undefined} {...marques(u)}>{eur(valeur(u))}{ESPACE}{MOT_UNITE[u]}</span>{suffixe}</strong>
      {disposition === 'ligne' ? ' ' : null}<span className={`trx-mt-petit${couleur ? ` ${couleur}` : ''}`} data-montant-petit>(<span className={couleur || undefined} {...marques(autre)}>{eur(valeur(autre))}{ESPACE}{MOT_UNITE[autre]}</span>)</span>
    </span>
  );
}

/** 🔴 LOT AM — le sélecteur « HT | TTC » (deux boutons de 44 px, le choisi enfoncé). */
export function BoutonAffichage({ unite, onChange }: { unite: UniteAffichage; onChange: (u: UniteAffichage) => void }) {
  return (
    <div className="trx-unites trx-affichage" role="group" aria-label="Montants affichés en grand" data-affichage-montants={unite}>
      {(['ht', 'ttc'] as const).map((x) => (
        <button key={x} type="button" className="trx-unite" aria-pressed={unite === x} onClick={() => onChange(x)} data-afficher={x}>{MOT_UNITE[x]}</button>
      ))}
    </div>
  );
}

export const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Les paramètres de l'adresse de la page, lus une fois (rien côté serveur : la page est rendue après lecture). */
export function parametre(nom: string): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(nom);
}
/** Réécrit l'adresse (sans recharger) : la sélection se garde dans un lien ou un rechargement. */
export function ecrireAdresse(p: Record<string, string | null>): void {
  const u = new URL(window.location.href);
  const avant = u.searchParams.toString();
  for (const [k, v] of Object.entries(p)) { if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
  if (u.searchParams.toString() === avant) return;
  const q = u.searchParams.toString();
  window.history.replaceState(window.history.state, '', `${u.pathname}${q === '' ? '' : `?${q}`}${u.hash}`);
}

/** 🔴 LOT CU — un paramètre à plusieurs valeurs (« &negociateur=A&negociateur=B ») ; aucun : []. */
export function parametres(nom: string): string[] {
  return typeof window === 'undefined' ? [] : new URLSearchParams(window.location.search).getAll(nom).filter((x) => x !== '');
}
/** 🔴 LOT CU — réécrit un paramètre à plusieurs valeurs (vide : retiré), sans recharger. */
export function ecrireAdresseListe(nom: string, valeurs: readonly string[]): void {
  const u = new URL(window.location.href);
  const avant = u.searchParams.toString();
  u.searchParams.delete(nom);
  for (const v of valeurs) u.searchParams.append(nom, v);
  if (u.searchParams.toString() === avant) return;
  const q = u.searchParams.toString();
  window.history.replaceState(window.history.state, '', `${u.pathname}${q === '' ? '' : `?${q}`}${u.hash}`);
}

/** Les classes propres à la tuile (les autres viennent du Suivi de la Location : `tdb-*`, `loc-*`). Jetons de couleur seulement. */
/** 🔴 LOT LO2 — les styles du sélecteur « HT | TTC » (`BoutonAffichage`), à part : le Suivi annuel de la Location les prend aussi. */
export const CSS_BOUTON_AFFICHAGE = `.trx-unites{display:inline-flex;gap:0;align-self:flex-start;border:1px solid var(--color-svv-line-strong);border-radius:10px;overflow:hidden}
.trx-unite{appearance:none;min-width:56px;min-height:44px;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer;padding:0 12px}
.trx-unite + .trx-unite{border-left:1px solid var(--color-svv-line-strong)}
.trx-unite[aria-pressed='true']{background:var(--color-svv-ink);color:var(--color-svv-surface)}
.trx-unite:disabled{opacity:.5;cursor:not-allowed}
.trx-unite:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
`;
export const CSS_TRANSACTION = `
${CSS_TRIANGLE}
${CSS_TRIANGLE_BOITE}
.trx-barre{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.trx-vues{display:flex;gap:4px;border-bottom:1px solid var(--color-svv-line);overflow-x:auto}
.trx-actions{display:flex;flex-wrap:wrap;gap:8px}
.trx-actions .svv-btn{width:auto;min-height:44px}
.trx-bouton-lien{appearance:none;border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-weight:700;cursor:pointer;min-height:44px;padding:0 6px;text-decoration:underline}
.trx-bouton-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-pastilles{display:inline-flex;flex-wrap:wrap;gap:4px;margin-left:6px;vertical-align:middle}
.trx-pastille--orange{background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.trx-pastille--verte{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.trx-source{color:var(--color-svv-muted);font-size:.78rem}
.trx-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.trx-form label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:700;color:var(--color-svv-muted)}
.trx-form input,.trx-form textarea,.trx-form select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.trx-form textarea{min-height:72px;padding:8px 10px}
.trx-form .trx-plein{grid-column:1/-1}
.trx-parts{display:flex;flex-direction:column;gap:8px}
.trx-part{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) auto;gap:8px;align-items:end}
.trx-erreur{color:var(--color-svv-red);font-weight:700}
.trx-journal{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.trx-journal li{border:1px solid var(--color-svv-line);border-radius:10px;padding:8px 10px;font-size:.88rem}
.trx-total{font-weight:800}
.trx-resultat{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;max-width:520px}
.trx-resultat dt{color:var(--color-svv-muted)}
.trx-resultat dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.trx-alerte{color:var(--color-svv-red);font-weight:700;font-size:.85rem}
.trx-parties .trx-partie{display:flex;flex-direction:column;gap:6px}
.trx-partie-tete{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.trx-partie--total{background:var(--color-svv-field)}
.trx-croix{appearance:none;margin-left:auto;min-width:44px;min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.3rem;cursor:pointer}
.trx-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-explication{color:var(--color-svv-red);font-weight:700;font-size:.85rem;align-self:center}
.trx-cartes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}
/* LOT H (Arno) — UN ESPACEMENT NET ET RÉGULIER (16 px) : entre les tuiles et la première carte, entre les cartes, sous la barre d'actions
   d'une carte dépliée, et avant « Compromis annulés (N) ». */
.trx-onglet-compromis > .tdb-tuiles{margin-bottom:16px}
/* LOT L (Arno) — « + Nouveau compromis » sur la ligne du titre, aligné à droite, et 16 px nets au-dessus des tuiles (il touchait « Solde net »). */
.trx-onglet-compromis > .trx-barre{flex-wrap:nowrap;align-items:center;margin-bottom:16px}
.trx-onglet-compromis > .trx-barre > h3{flex:1 1 auto;min-width:0;margin:0}
.trx-onglet-compromis > .trx-barre > .trx-actions{flex:0 0 auto;margin-left:auto}
.trx-onglet-compromis > .trx-barre .svv-btn{white-space:nowrap}
/* 🔴 LOT AM — le sélecteur « HT | TTC » juste à gauche de « + Nouveau compromis » ; trop étroit : il passe au-dessus, aligné à droite. */
.trx-onglet-compromis > .trx-barre > .trx-actions{justify-content:flex-end;align-items:center}
.trx-affichage{flex:0 0 auto}
/* 🔴 LOT AP (Arno) — LES LIGNES DE SOMME sur une trame grise très légère (sous-totaux, CA, base, reste) ; le TOTAL FINAL d'une fenêtre un cran
   plus marqué (trame plus soutenue, filet, gras) ; les lignes de détail restent sur la surface. Une variable commune, en clair et en sombre ;
   contrastes mesurés (AA ≥ 4,5:1) : clair #f3f5f7 — vert 4,9 · rouge 7,5 ; #e9edf1 — vert 4,6 · rouge 6,9 ; sombre #263140 — vert 8,3 ·
   rouge 4,7 ; #283445 — vert 8,0 · rouge 4,5 (le rouge sombre borne la trame finale : le cran de plus passe aussi par le filet et le gras).
   🔴 LOT AR — --trx-fond-synthese : le fond du bloc « Synthèse — ce que l'on doit », distinct des cartes d'affaires (clair #f6f8fb, sombre #161e29).
   🔴 LOT AS — --trx-lisere-* : le liseré de chaque carte de catégorie de ce bloc (bleu, violet, ocre, sarcelle ; sobres, jamais le rouge). */
.svv-adm-root{--trx-trame:#f3f5f7;--trx-trame-finale:#e9edf1;--trx-fond-synthese:#f6f8fb;--trx-lisere-negociateurs:#3f6fa3;--trx-lisere-inter:#7a5aa6;--trx-lisere-apporteurs:#b07d1f;--trx-lisere-agences:#2f8a84}
.svv-adm-root[data-theme='dark']{--trx-trame:#263140;--trx-trame-finale:#283445;--trx-fond-synthese:#161e29;--trx-lisere-negociateurs:#79a6db;--trx-lisere-inter:#ad93d9;--trx-lisere-apporteurs:#d6a646;--trx-lisere-agences:#5fbab3}
@media (prefers-color-scheme: dark){ .svv-adm-root[data-theme='system']{--trx-trame:#263140;--trx-trame-finale:#283445;--trx-fond-synthese:#161e29;--trx-lisere-negociateurs:#79a6db;--trx-lisere-inter:#ad93d9;--trx-lisere-apporteurs:#d6a646;--trx-lisere-agences:#5fbab3} }
.trx-somme{background:var(--trx-trame);border-radius:8px}
.trx-somme--finale{background:var(--trx-trame-finale);border-top:2px solid var(--color-svv-line-strong);font-weight:800}
.trx-somme--finale strong,.trx-somme--finale > span{font-weight:800}
tr.trx-somme-ligne > th,tr.trx-somme-ligne > td{background:var(--trx-trame)}
tr.trx-somme-ligne > :first-child{border-top-left-radius:8px;border-bottom-left-radius:8px}
tr.trx-somme-ligne > :last-child{border-top-right-radius:8px;border-bottom-right-radius:8px}
/* Les tableaux qui portent des sommes (Répartition de la carte, résumé du panneau) sur la SURFACE : les lignes de détail restent sur fond
   blanc (sombre : la surface), même posées dans un bloc gris (Informations communes) — la trame des sommes s'y voit. */
.trx-table-repartition,.trx-resume-base{background:var(--color-svv-surface);border-radius:10px}
/* 🔴 LOT AN — le même sélecteur en tête d'un formulaire ou d'un panneau (synchronisé avec le bloc). */
.trx-form-affichage{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;grid-column:1/-1}
@media (max-width:560px){
  .trx-onglet-compromis > .trx-barre{flex-wrap:wrap}
  .trx-onglet-compromis > .trx-barre > .trx-actions{flex:1 1 auto;max-width:100%}
}
/* 🔴 LOT AM — DEUX MONTANTS (composant Montants) : l'unité choisie en grand, l'autre en petit entre parenthèses, de la même couleur (le petit plus léger) ;
   dessous (pile) ou à côté (ligne) ; aucun montant ne se coupe en fin de ligne. */
.trx-mt-grand,.trx-mt-petit{white-space:nowrap}
.trx-mt--pile{display:inline-flex;flex-direction:column}
.trx-mt--ligne{display:inline}
.trx-mt-grand{font-weight:800}
.trx-mt--ligne .trx-mt-grand{font-weight:700}
.trx-mt-petit{font-size:.85em;font-weight:600;opacity:.8}
.trx-tuile-montants .trx-mt-grand{font-size:1.4rem}
.trx-tuile-montants .trx-mt-petit{font-size:.9rem}
.trx-carte-montants{align-items:flex-end;text-align:right}
.trx-carte-montants .trx-mt-grand{font-size:1.15rem}
.trx-carte-montants .trx-mt-petit{font-size:.88rem}
.trx-onglet-compromis .trx-carte-detail,.trx-liste-affaires .trx-carte-detail{padding-bottom:6px}
.trx-onglet-compromis .trx-carte.tdb-replie--ouvert,.trx-liste-affaires .trx-carte.tdb-replie--ouvert{padding-bottom:14px}
.trx-espace-annules{height:16px}
/* LOT H — le champ d'adresse partagé (ChampAdresseBan) dans les formulaires de la tuile : pleine largeur, propositions ≥ 44 px. */
.trx-form .cab-enveloppe input{width:100%;box-sizing:border-box}
.trx-form .cab-prop{min-height:44px;font-size:.92rem}
.trx-carte{border:1px solid var(--color-svv-line-strong);border-radius:14px;padding:10px 14px;background:var(--color-svv-surface)}
/* LOT G (Arno) — CONTRASTE ET RELIEF, en Clair comme en Sombre (jetons seulement) : la page en « field », les cartes et les tuiles plus
   claires (« surface-raised » : blanc en Clair, un cran plus clair que la page en Sombre), bordure marquée, ombre légère (teinte
   « tip-bg », sombre dans les deux thèmes) ; dans une carte dépliée, les sous-blocs reviennent au fond « field », bordés. */
.trx-onglet-compromis,.trx-liste-affaires{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.trx-onglet-compromis .trx-carte,.trx-liste-affaires .trx-carte,.trx-onglet-compromis .tdb-tuile,.trx-onglet-compromis .trx-annules{background:var(--color-svv-surface-raised);border:1px solid var(--color-svv-line-strong);
  box-shadow:0 1px 2px color-mix(in srgb, var(--color-svv-tip-bg) 18%, transparent),0 4px 12px color-mix(in srgb, var(--color-svv-tip-bg) 10%, transparent)}
.trx-onglet-compromis .trx-colonne,.trx-onglet-compromis .trx-communes,.trx-liste-affaires .trx-colonne,.trx-liste-affaires .trx-communes{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.trx-onglet-compromis .trx-carte-detail,.trx-liste-affaires .trx-carte-detail{border-top-color:var(--color-svv-line-strong)}
/* LOT CA — la 3e ligne grise des cartes de « Le mois » (négociateurs, rétro, com négo, reste agence), plus petite ; les montants à leurs couleurs. */
/* LOT CC — la carte repliée : ligne 1 = le nom puis, en gris, adresse · date (au téléphone, dessous) ; puis une petite ligne grise par négociateur. */
.trx-carte-ligne1{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;min-width:0}
.trx-carte-lieu{font-size:.86rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.trx-carte-negos{display:flex;flex-direction:column;gap:1px;font-size:.8rem;color:var(--color-svv-muted)}
.trx-carte-nego{overflow-wrap:anywhere}
/* LOT CD — les lignes de négociateur d'une carte en COLONNES : nom (largeur du plus long de la carte) · côté · honoraires nets · com négo · reste,
   les montants alignés à droite ; une ligne inter-cabinet : « reversé à … » sur les deux dernières colonnes. Au téléphone : retour à la ligne. */
@media (min-width:761px){
  .trx-carte-negos{display:grid;grid-template-columns:var(--trx-nego-c1,max-content) var(--trx-nego-c2,max-content) var(--trx-nego-c3,max-content) var(--trx-nego-c4,max-content) var(--trx-nego-c5,max-content) auto;column-gap:6px;row-gap:1px;justify-content:start}
  .trx-carte-nego{display:contents}
  .trx-nego-col{display:flex;justify-content:space-between;gap:4px;white-space:nowrap}
  .trx-nego-col--double{grid-column:span 2;justify-content:flex-start}
  /* 🔴 LOT DP — FUSION : une colonne de plus, la société du négociateur, entre le nom et « entrée / sortie » (largeur commune à toute la liste) */
  .trx-carte-negos--societes{grid-template-columns:var(--trx-nego-c1,max-content) var(--trx-nego-c6,max-content) var(--trx-nego-c2,max-content) var(--trx-nego-c3,max-content) var(--trx-nego-c4,max-content) var(--trx-nego-c5,max-content) auto}
}
/* 🔴 LOT DP — l'étiquette ROUGE « Inter-cabinet … – … » après le nom de l'affaire (clair et sombre : fond rouge pâle, texte rouge) */
.trx-pastille-inter{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);font-size:.72rem;letter-spacing:.02em;vertical-align:middle;white-space:nowrap}
.trx-nego-societe{display:inline-block}
/* les séparateurs restent gris, quelle que soit la couleur du montant ; au téléphone, chaque segment est insécable (retour entre les segments) */
.trx-carte-negos .trx-nego-sep{color:var(--color-svv-muted);font-weight:400}
/* LOT CE — « honoraires nets » rouge (déduction) : le libellé seul ; le montant reste gris. */
.trx-carte-negos .trx-nego-montant{color:var(--color-svv-muted);font-weight:400}
@media (max-width:760px){ .trx-carte-nego > span{margin-right:4px} .trx-carte-nego > .trx-nego-col,.trx-carte-nego > .trx-nego-cote{white-space:nowrap} }
.trx-carte-negos .trx-rouge,.trx-carte-negos .trx-vert{font-weight:700}
@media (max-width:760px){ .trx-carte-lieu{flex-basis:100%} }
/* LOT CA — un en-tête de liste : le titre, son sélecteur et le compteur « (N) » ensemble à gauche ; les boutons à droite (au téléphone, dessous). */
.trx-entete-gauche{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}
.trx-entete-gauche h3{margin:0}
/* LOT DB — les rangées de tuiles (Le mois, L'année, onglet Compromis, CA global) : dans une même ligne de tuiles, le titre occupe une zone de hauteur
   commune (celle du plus long, titre aligné en bas), puis le gros chiffre, le montant entre parenthèses et la ligne du bas sont chacun sur la même
   ligne horizontale ; une tuile sans montant entre parenthèses garde sa place vide. La grille de la rangée porte les lignes ; chaque tuile les
   reprend (subgrid) : toutes ont la même hauteur. Au téléphone (2 puis 1 par ligne) : la même règle, ligne par ligne. */
.trx-tuiles-alignees{row-gap:0;margin-bottom:-14px}
/* l'espace entre deux lignes de tuiles est porté par chaque tuile (14 px) ; la rangée le reprend en bas : l'espace sous les tuiles ne change pas */
.trx-onglet-compromis > .trx-tuiles-alignees{margin-bottom:2px}
.trx-tuiles-alignees>li{display:grid;grid-row:span 5;grid-template-rows:subgrid;row-gap:0;margin-bottom:14px;min-width:0}
.trx-tuiles-alignees>li>.tdb-tuile{grid-row:1 / -1;display:grid;grid-template-rows:subgrid;row-gap:0;justify-items:center;align-items:start;height:auto;min-height:0}
/* 🔴 LOT UI1 (Arno) — tuiles plus compactes : moins de marge intérieure en haut et en bas (les textes et la largeur utile gardent leur taille) */
.trx-tuiles-alignees>li>.tdb-tuile{padding:12px 20px}
.trx-tuiles-alignees .tdb-tuile>*{grid-column:1;min-width:0;max-width:100%}
.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-mot{grid-row:1;align-self:end;padding-bottom:5px}
/* 🔴 LOT DU — la ligne d'explication sous le titre d'une tuile (petite, grise, sur une ou deux lignes) : dans la rangée du titre, les montants restent alignés */
.tdb-tuile-mot>.trx-tuile-explication{display:block;margin-top:2px;font-weight:600;line-height:1.25}
/* 🔴 LOT LO1 — une ligne du bas d'une tuile qui porte deux phrases (« cumul … » puis N−1) : une phrase par ligne */
.tdb-tuile-n1 .trx-ligne-bloc{display:block}
/* 🔴 LOT UI1 — au téléphone, la même logique : marge intérieure réduite */
@media (max-width:640px){ .trx-tuiles-alignees>li>.tdb-tuile{padding:11px 16px} }
/* 🔴 LOT LO1 — « Compter » de la Location (4 choix) : au téléphone, les choix passent à la ligne au lieu de déborder ; la ligne « dont … » de la tuile Baux aussi */
@media (max-width:760px){ .trx-modes[data-filtre="compter"]{flex-wrap:wrap} .trx-modes[data-filtre="compter"] .trx-unite{flex:1 1 auto} }
[data-ecran-location-tuiles] .trx-tuile-autre{white-space:normal;overflow-wrap:anywhere}
/* 🔴 LOT UI1 — le montant principal posé au BAS de sa rangée : le montant converti est collé dessous (2 px), un seul bloc ; d'une tuile à l'autre, les
   montants (leur dernière ligne) et les montants convertis restent sur la même ligne */
.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-valeur{grid-row:2;align-self:end;line-height:1.1}
.trx-tuiles-alignees .tdb-tuile>.trx-tuile-montants{grid-row:2 / span 2}
.trx-tuiles-alignees .tdb-tuile>.trx-tuile-autre{grid-row:3;padding-top:2px}
.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-n1{grid-row:4;padding-top:5px}
.trx-tuiles-alignees .tdb-tuile>.tdb-tuile-n1~.tdb-tuile-n1{grid-row:5;padding-top:3px}
/* 🔴 LOT LO6 — Location : « Voir le détail » des tuiles 3 et 4, une sixième ligne commune à la rangée (sous leurs deux lignes du bas) */
.trx-tuiles-alignees[data-ecran-location-tuiles]>li,.trx-tuiles-alignees[data-ecran-fusion-tuiles]>li{grid-row:span 6}
.trx-tuiles-alignees[data-ecran-location-tuiles] .tdb-tuile>.tdb-tuile-n1.trx-tuile-voir,.trx-tuiles-alignees[data-ecran-fusion-tuiles] .tdb-tuile>.tdb-tuile-n1.trx-tuile-voir{grid-row:6;padding-top:4px}
[data-ecran-fusion-tuiles] .trx-tuile-autre{white-space:normal;overflow-wrap:anywhere}
/* LOT CW — la définition du CA net, en petit, sous le graphique. */
.trx-note-ca-net{margin:6px 0 0;font-size:.8rem}
/* LOT CW — trois onglets « CA | CA net | Nombre de ventes » dans la colonne de 270 px de l'encadré : un peu moins d'espace autour de chacun. */
[data-transaction] [data-bloc="histogramme-mois"] .tdb-mesure{padding-left:6px;padding-right:6px}
/* LOT CU — de 2 à 5 négociateurs : la palette fixe des séries (clair ; sombre plus bas), une couleur par négociateur dans l'ordre de la sélection. */
.tdb{--trx-serie-1:#2563eb;--trx-serie-2:#c2410c;--trx-serie-3:#047857;--trx-serie-4:#7c3aed;--trx-serie-5:#be185d}
.svv-adm-root[data-theme='dark'] .tdb{--trx-serie-1:#60a5fa;--trx-serie-2:#fb923c;--trx-serie-3:#34d399;--trx-serie-4:#a78bfa;--trx-serie-5:#f472b6}
@media (prefers-color-scheme: dark){ .svv-adm-root[data-theme='system'] .tdb{--trx-serie-1:#60a5fa;--trx-serie-2:#fb923c;--trx-serie-3:#34d399;--trx-serie-4:#a78bfa;--trx-serie-5:#f472b6} }
.trx-serie--1{--trx-serie:var(--trx-serie-1)} .trx-serie--2{--trx-serie:var(--trx-serie-2)} .trx-serie--3{--trx-serie:var(--trx-serie-3)}
.trx-serie--4{--trx-serie:var(--trx-serie-4)} .trx-serie--5{--trx-serie:var(--trx-serie-5)}
.trx-serie-barre,.trx-serie-point{fill:var(--trx-serie)}
.trx-serie-trait{fill:none;stroke:var(--trx-serie);stroke-width:2.5;stroke-linejoin:round}
.trx-pastille-serie{display:inline-block;flex:0 0 auto;width:12px;height:12px;border-radius:3px;background:var(--trx-serie);margin-right:6px}
.trx-legende-series{display:flex;flex-wrap:wrap;gap:6px 16px}
.trx-legende-serie{display:inline-flex;align-items:center;white-space:nowrap;color:var(--color-svv-ink);font-weight:600}
.trx-serie-ligne{gap:8px}
.trx-serie-ligne>span:first-child{display:inline-flex;align-items:center;flex:1 1 auto;min-width:0}
.trx-serie-ligne .tdb-bulle-montant,.trx-graphe-negos [data-detail-ensemble] .tdb-bulle-montant{flex:0 0 auto}
.trx-graphe-negos .tdb-histo-detail .tdb-bulle--sous{font-size:.8rem}
.trx-serie-entete{color:var(--color-svv-muted);font-size:.75rem}
.trx-serie-note{font-size:.75rem;margin-top:4px !important}
/* LOT DC — sous l'ensemble de la sélection : la même sélection l'année précédente, en gris. */
.trx-serie-n1{color:var(--color-svv-muted)}
/* LOT CU — le filtre « Négociateur » à choix multiple : des cases à cocher dans la liste ; « 5 au maximum » dessous. */
.trx-filtre-negos .trx-filtre-negos-panneau{right:auto;min-width:100%;width:max-content;max-width:min(340px,90vw);max-height:min(480px,70vh)}
@media (max-width:720px){ .trx-filtre-negos .trx-filtre-negos-panneau{left:auto;right:0;width:min(300px,calc(100vw - 32px));max-width:none} }
.trx-filtre-negos-liste:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.trx-case{display:inline-flex;align-items:center;justify-content:center;flex:0 0 18px;width:18px;height:18px;box-sizing:border-box;border:1.5px solid var(--color-svv-line-strong);border-radius:4px;font-size:.72rem;font-weight:800}
.trx-case--cochee{background:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink);color:var(--color-svv-surface)}
.trx-filtre-negos-max{margin:2px 8px 4px;font-size:.78rem}
/* LOT CS — le tri des cartes de l'onglet Compromis : un petit menu texte, gris, sans cadre ; au téléphone, sous le titre, à gauche. */
.trx-tri-compromis{display:inline-flex;align-items:center;gap:2px;color:var(--color-svv-muted);font-size:.85rem}
.trx-tri-compromis .lch{width:auto}
.trx-tri-compromis .lch-champ.trx-tri-champ{width:auto;min-height:36px;border:0;background:transparent;color:var(--color-svv-muted);font-size:.85rem;font-weight:600;padding:0 6px;gap:6px;border-radius:8px}
.trx-tri-compromis .lch-champ.trx-tri-champ:hover{color:var(--color-svv-ink)}
.trx-tri-compromis .lch-liste{right:auto;min-width:340px;font-size:.9rem}
@media (max-width:720px){ .trx-tri-compromis{flex-basis:100%} .trx-tri-compromis .lch-liste{min-width:280px} }
.trx-compteur{font-weight:700;color:var(--color-svv-muted)}
.trx-listes-mois{display:contents}
/* LOT CN — Apporteurs du mois : « Apporteur non nommé » en gris italique ; le négociateur en taille normale, à gauche, sa source dessous. */
.trx-apporteur-non-nomme{font-style:italic;font-weight:400}
[data-table-retrocessions] .trx-retro-negociateur{text-align:left;font-weight:400}
.trx-retro-nego-pile{display:inline-flex;flex-direction:column;gap:2px}
@media (max-width:1024px){ .trx-retro-nego-pile{align-items:flex-end;text-align:right} }
/* LOT CP — « Mensuel | Période » à droite de la ligne des mois (au téléphone : au-dessus, à droite) ; en Période, les mois choisis soulignés
   comme le mois du Mensuel. */
.trx-rangee-mois{display:flex;align-items:stretch;gap:12px;border-bottom:1px solid var(--color-svv-line)}
.trx-rangee-mois .tdb-onglets{flex:1 1 auto;min-width:0;border-bottom:0;align-items:flex-end}
/* LOT CQ — le bouton centré dans la ligne, même marge en haut et en bas, sans toucher le trait ; la hauteur des onglets de mois (44 px). */
.trx-rangee-mois .trx-choix-periode{flex:0 0 auto;align-self:center;margin:6px 0}
.trx-rangee-mois .trx-choix-periode .trx-unite{min-height:42px}
.trx-onglets-periode .tdb-onglet[aria-pressed="true"]{color:var(--color-svv-ink);border-bottom-color:var(--color-svv-red)}
.trx-periode-refus{margin:0}
@media (max-width:720px){
  .trx-rangee-mois{flex-direction:column-reverse;align-items:stretch;gap:0}
  .trx-rangee-mois .trx-choix-periode{align-self:flex-end}
}
/* LOT CO — tri de l'Espace par négociateur : l'intitulé est un bouton, deux flèches grises, celle du tri en cours en vert ; sur téléphone
   (en-tête replié en cartes) les deux tris passent au-dessus du tableau. */
.trx-tri{appearance:none;border:0;background:transparent;padding:4px 2px;margin:0;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border-radius:6px;min-height:32px}
.trx-tri:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-tri-fleches{display:inline-flex;flex-direction:column;line-height:1;font-size:.62rem;color:var(--color-svv-muted)}
.trx-tri-fleches .trx-tri-on{color:var(--color-svv-green-ink)}
.trx-tri-mobile{display:none}
@media (max-width:1024px){
  .trx-tri-mobile{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
  .trx-tri-mobile .trx-tri{border:1px solid var(--color-svv-line);padding:6px 12px;min-height:44px;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
  .trx-tri-mobile .trx-tri[aria-pressed="true"]{border-color:var(--color-svv-green-ink)}
  .trx-tri-mobile .trx-tri-fleches{font-size:.75rem}
}
/* LOT CM — un coût nul : gris (le grand et le petit), comme une com à 0. */
.trx-cout-nul,.trx-cout-nul .trx-mt-petit,.trx-cout-nul .trx-montant-autre{color:var(--color-svv-muted)}
/* LOT CL — Espace par négociateur : une Com non comptabilisée en gris ; la ligne de total sur la trame. */
.trx-espace-gris .trx-mt-liste{color:var(--color-svv-muted)}
.trx-espace-total > th,.trx-espace-total > td{background:var(--trx-trame);font-weight:700}
/* LOT CH — sous le Résultat : les rétrocessions saisies sans vente affichée, en ORANGE (jeton d'alerte), dépliables. */
.trx-hors-resultat{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding:8px 10px;border:1px solid var(--color-svv-orange);border-radius:10px;background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}
.trx-hors-tete{appearance:none;display:flex;align-items:center;gap:6px;min-height:44px;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.trx-hors-tete:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-hors-mention{margin:0;font-size:.82rem}
.trx-hors-liste{list-style:none;margin:0;padding:0 0 0 22px;display:flex;flex-direction:column;gap:6px;font-size:.88rem}
.trx-hors-liste li{display:flex;flex-direction:column}
.trx-liste-affaires > .trx-entete-gauche{margin-bottom:12px}
/* LOT GE1 — Gestion : la ligne de total du tableau (trame grise) ; le mois choisi, legerement surligne. */
.trx-ligne-total th,.trx-ligne-total td{background:var(--color-svv-field)}
/* LOT DM — FUSION : le choix de la societe porteuse d'un nouveau compromis ; l'etiquette de societe sur les cartes. */
.trx-choix-societe{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;flex-basis:100%}
.trx-choix-societe .svv-btn{width:auto;min-height:40px}
.trx-pastille-societe{font-size:.72rem;letter-spacing:.02em;vertical-align:middle}
.trx-ligne-choisie th,.trx-ligne-choisie td{background:color-mix(in srgb, var(--color-svv-red) 7%, transparent)}
/* LOT GE4 — les six onglets du graphique de la Gestion : une grille de 3 colonnes de meme largeur, 2 lignes (CA, CA net, Lots / ADHOC, MONGA,
   Salaires), chaque onglet sous celui du dessus ; un petit ecart entre les lignes ; jamais de retour a la ligne dans un onglet. */
[data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:4px;row-gap:4px}
[data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesure{width:100%;min-width:0;padding-left:4px;padding-right:4px;white-space:nowrap;text-align:center}
@media (max-width:420px){ [data-ecran-gestion] .tdb-histo-entete-detail .tdb-mesure{font-size:.9rem} }
/* LOT GE3 — la Gestion : CINQ tuiles alignees (honoraires, ADHOC, MONGA, salaries, CA net) ; tablette 3 par ligne, telephone 2 par ligne. */
.tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(5,minmax(0,1fr))}
@media (max-width:1100px){ .tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(3,minmax(0,1fr))} }
@media (max-width:760px){ .tdb-tuiles.trx-tuiles-gestion{grid-template-columns:repeat(2,minmax(0,1fr))} }
.trx-tuiles-gestion .trx-tuile-autre{white-space:normal;overflow-wrap:anywhere}
/* LOT DJ — la recherche d'une liste de cartes : discrete, a droite de la ligne du titre ; au telephone, sous le titre, pleine largeur. */
.trx-recherche-liste{margin-left:auto;position:relative;display:inline-flex;align-items:center}
.trx-recherche-champ{height:36px;width:min(260px,100%);padding:0 30px 0 12px;border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.9rem}
.trx-recherche-champ::placeholder{color:var(--color-svv-muted)}
.trx-recherche-champ::-webkit-search-cancel-button{display:none}
.trx-recherche-effacer{position:absolute;right:4px;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--color-svv-muted);font-size:1.1rem;cursor:pointer}
.trx-recherche-effacer:hover{color:var(--color-svv-ink)}
@media (max-width:720px){ .trx-recherche-liste{flex-basis:100%;margin-left:0} .trx-recherche-champ{width:100%} }
.trx-btn-large{width:100%;min-height:44px}
.trx-negociateur-carte{display:flex;flex-direction:column;gap:8px;width:100%}
.trx-choix-negociateur{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface)}
.trx-choix-negociateur label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:700;color:var(--color-svv-muted)}
.trx-btn-annulation{appearance:none;margin-left:auto;min-height:44px;padding:0 18px;border:2px solid var(--color-svv-red);border-radius:12px;background:transparent;color:var(--color-svv-red);font:inherit;font-weight:800;cursor:pointer}
.trx-btn-annulation:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-btn-annulation:disabled{opacity:.55;cursor:not-allowed}
.trx-annulation-note{flex-basis:100%;text-align:right}
.trx-annule{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-field)}
.trx-annule p{margin:0}
.trx-annule-tete{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px}
.trx-carte .tdb-replie-ligne{align-items:flex-start;gap:6px 16px}
.trx-carte .tdb-h-chevron--gauche{padding-top:3px}
.trx-carte .tdb-replie-mot{flex:1 1 16rem;min-width:0;font-size:inherit;font-weight:400}
.trx-carte .tdb-replie-resume{margin-left:auto;text-align:right;font-weight:400;color:inherit}
.trx-carte-gauche{display:flex;flex-direction:column;gap:4px;min-width:0}
.trx-carte-titre{font-size:1.02rem;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.trx-carte-infos{display:flex;flex-wrap:wrap;gap:2px 0;font-size:.86rem;color:var(--color-svv-muted)}
.trx-carte-droite{display:flex;flex-direction:column;align-items:flex-end;gap:2px;white-space:nowrap}
.trx-commission{color:var(--color-svv-green-ink);font-weight:800}
.trx-commission small{font-weight:600;color:var(--color-svv-muted)}
.trx-commission--ttc{font-size:1.15rem}
.trx-carte-ht{font-size:.88rem;font-weight:700;color:var(--color-svv-ink)}
.trx-carte-pct{font-size:.8rem;color:var(--color-svv-muted)}
.trx-carte-detail{display:flex;flex-direction:column;gap:14px;padding-top:6px;border-top:1px solid var(--color-svv-line)}
.trx-carte-detail h4{margin:0 0 8px;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}
.trx-colonnes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.trx-colonne{display:flex;flex-direction:column;gap:8px;align-items:flex-start;border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;min-width:0}
.trx-personnes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;width:100%}
/* LOT BJ — un bouton par vendeur / acquéreur (le style de « + Ajouter un vendeur »), sa fenêtre de détail, les représentants du formulaire. */
.trx-personnes-boutons{display:flex;flex-direction:column;gap:8px;width:100%}
.trx-btn-personne{width:100%;min-height:44px;white-space:normal;text-align:center}
/* LOT BL (Arno) — une personne ou une société déjà créée : liseré GRIS FONCÉ un peu plus épais (la variable du cadre des honoraires, lot BD, clair
   et sombre), même fond, taille et police ; « + Ajouter … » garde son liseré clair. Survol et focus clavier visibles sur les deux. */
.trx-colonne .svv-btn-outline.trx-btn-personne,.trx-communes .svv-btn-outline.trx-btn-personne{border:2px solid var(--trx-lisere-base)}
.trx-colonne .svv-btn-outline.trx-btn-personne:hover,.trx-communes .svv-btn-outline.trx-btn-personne:hover{border-color:var(--color-svv-ink)}
.trx-colonne .svv-btn-outline:focus-visible,.trx-communes .svv-btn-outline.trx-btn-personne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-fp-tete{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.trx-fp-sous-titre{margin:0;font-weight:700}
.trx-fp-representant{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--color-svv-line);padding-top:8px}
.trx-representants{display:flex;flex-direction:column;gap:8px}
.trx-representant{border:1px dashed var(--color-svv-line-strong);border-radius:10px;padding:8px}
.trx-personnes li{display:flex;flex-direction:column;gap:2px;font-size:.9rem;overflow-wrap:anywhere}
.trx-personnes li{gap:0}
.trx-personnes a{color:var(--color-svv-red);display:inline-flex;align-items:center;min-height:44px}
.trx-sep{white-space:pre}
.trx-communes{border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;min-width:0}
.trx-grille{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px;margin:0 0 12px}
/* LOT BN — avec le libellé du fichier et le prix de vente : 4 rubriques sur la première ligne (« Dates » y reste). */
.trx-grille.trx-grille--quatre{grid-template-columns:repeat(4,minmax(0,1fr))}
.trx-info{min-width:0}
.trx-info dt{font-size:.78rem;color:var(--color-svv-muted)}
.trx-info dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.trx-repartition-titre{margin:0 0 6px}
.trx-barre-actions{border-top:1px solid var(--color-svv-line);padding-top:10px}
@media (max-width:900px){ .trx-grille,.trx-grille.trx-grille--quatre{grid-template-columns:repeat(2,minmax(0,1fr))} }
.trx-depassee{color:var(--color-svv-red);font-weight:800}
.trx-lien{color:var(--color-svv-red);font-weight:700;display:inline-flex;align-items:center;min-height:44px}
/* LOT I (Arno) — LES 4 TUILES de l'onglet Compromis : 4 de front, 2×2 en dessous de 1100 px (règle des tuiles), 1 colonne sur téléphone.
   Le CA en vert (« TTC » écrit), les commissions versées en rouge (« TTC versées » écrit), le HT en gris dessous : jamais la couleur seule. */
.trx-tuiles4 .tdb-tuile{gap:4px;cursor:default}
.trx-tuiles4 .tdb-tuile-valeur{font-size:1.4rem}
.trx-tuiles4 button.tdb-tuile{cursor:pointer}
.trx-tuile-ht{font-size:.9rem;font-weight:700;color:var(--color-svv-muted)}
.trx-vert{color:var(--color-svv-green-ink)}
.trx-rouge{color:var(--color-svv-red)}
.trx-tuile-detail{display:flex;flex-direction:column;gap:2px;font-size:.85rem;color:var(--color-svv-ink);border-top:1px solid var(--color-svv-line);padding-top:6px;width:100%}
.trx-tuile-detail-a-part{border-top:1px dashed var(--color-svv-line);margin-top:2px;padding-top:2px;color:var(--color-svv-muted)}
.trx-tuile-detail-a-part.trx-alerte{color:var(--color-svv-red)}
.trx-tuile-detail-n{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
/* 🔴 LOT AL — « Voir le détail » : la tuile « Commissions versées » ouvre sa fenêtre. */
.trx-tuile-voir{color:var(--color-svv-red);font-weight:700;text-decoration:underline}
@media (max-width:560px){ .trx-tuiles4{grid-template-columns:minmax(0,1fr)} }
/* LOT I — un montant et son unité « HT / TTC » (deux boutons de 44 px, le choisi enfoncé). */
.trx-montant-unite{display:flex;flex-direction:column;gap:4px;min-width:0}
.trx-montant-unite label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:700;color:var(--color-svv-muted)}
.trx-montant-unite input{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%;box-sizing:border-box}
${CSS_BOUTON_AFFICHAGE}
.trx-negociateur-commission{font-size:.88rem}
/* LOT K — « Pour cette vente, il travaille pour : CRITERIMMO / MACJ » (collaborateur des deux sociétés). */
.trx-societe-vente{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.trx-societe-vente-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
/* LOT K — la case « Dates » : les deux dates l'une au-dessus de l'autre. */
.trx-dates{display:flex;flex-direction:column;gap:2px}
/* LOT J — l'apporteur et le montant de sa rétrocession sur la même ligne (le montant à droite du nom ; il passe dessous si la place manque). */
.trx-apporteur{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 16px}
.trx-apporteur-montant{font-variant-numeric:tabular-nums}
.trx-a-renseigner{font-style:italic}
/* LOT AC (Arno) — « + Ajouter un nouvel apporteur » : la petite fenêtre sous le choix de l'apporteur ; les homonymes proposés. */
.trx-nouvel-apporteur{display:flex;flex-direction:column;gap:10px;padding:10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface)}
.trx-nouvel-apporteur-intro{margin:0}
.trx-homonymes{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.trx-homonymes .svv-btn{width:auto;min-height:44px}
/* LOT AF (Arno) — la carte d'une ligne miroir : le bloc « Inter-cabinet reçu » en couples libellé / valeur (une information par ligne, alignée ;
   une colonne sur téléphone : le libellé au-dessus) ; la note d'une ligne ; le bloc du négociateur, titre puis lignes distinctes. */
.trx-couples{display:grid;grid-template-columns:minmax(10rem,max-content) minmax(0,1fr);gap:8px 16px;margin:0}
.trx-couple{display:contents}
.trx-couple dt{font-size:.78rem;color:var(--color-svv-muted);align-self:baseline}
.trx-couple dd{margin:0;font-weight:600;overflow-wrap:anywhere;align-self:baseline}
.trx-ht-ttc-pile{display:flex;flex-direction:column;align-items:flex-start}
.trx-miroir-note{margin:0;font-size:.85rem}
.trx-remuneration{display:flex;flex-direction:column;gap:8px}
.trx-remuneration-titre{margin:0;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}
.trx-remuneration-ligne{margin:0}
@media (max-width:640px){
  .trx-couples{grid-template-columns:minmax(0,1fr);gap:2px}
  .trx-couple dd{margin-bottom:8px}
}
/* LOT T (Arno) — la première ligne d'une colonne : le titre à gauche, la société et la part de ce côté à droite (sous le titre sur téléphone) ;
   sous le négociateur, les lignes de calcul (le mot en gras, le résultat en gras, l'équivalent HT en gris). */
.trx-colonne-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;width:100%}
.trx-carte-detail .trx-colonne-tete h4{margin:0}
.trx-colonne .trx-btn-societe-cote{width:auto;max-width:100%;min-height:44px;white-space:normal;text-align:center}
.trx-reglage-repartition{width:100%;box-sizing:border-box}
.trx-partie-nego{font-weight:700;align-self:center;overflow-wrap:anywhere}
.trx-calcul-cote{margin:0;font-size:.88rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.trx-calcul-mot{font-weight:700}
.trx-calcul-ht{color:var(--color-svv-muted)}
.trx-calcul-cote.trx-ecart-calcul{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
/* LOT W (Arno) — une ligne de calcul sur deux lignes : à droite, une colonne de LARGEUR FIXE (12 em, de quoi loger « (1 234 567,89 € TTC) »)
   alignée à droite, le HT en gras puis le TTC en vert dessous ; les montants ne se coupent jamais. Colonne étroite : le libellé au-dessus. */
.trx-negociateur-carte,.trx-remuneration,.trx-exterieures{container-type:inline-size}
/* LOT AB — les parties extérieures sous les colonnes : leurs honoraires versés, encadrés. */
.trx-exterieures{display:flex;flex-direction:column;gap:8px}
.trx-calcul-grille{display:grid;grid-template-columns:minmax(0,1fr) 12em;column-gap:10px;align-items:baseline;width:100%;overflow-wrap:normal}
.trx-calcul-libelle{grid-column:1;grid-row:1 / span 2;min-width:0;overflow-wrap:break-word}
.trx-calcul-resultat,.trx-calcul-ttc{grid-column:2;text-align:right;white-space:nowrap}
.trx-calcul-resultat{grid-row:1}
.trx-calcul-ttc{grid-row:2}
/* l'opération (« 2 468 302,45 € HT × 50 % = ») ne se coupe pas : la seule coupure possible est après le libellé (jamais un « = » seul). */
.trx-calcul-operation{white-space:nowrap}
/* LOT X (Arno) — « Commission du négociateur » entourée d'un liseré rouge fin (jeton d'alerte), coins arrondis comme les autres blocs, petit
   retrait intérieur ; jamais pour un non commissionné (la ligne n'existe pas). */
.trx-calcul-encadre{border:1.5px solid var(--color-svv-red);border-radius:10px;padding:6px 8px;box-sizing:border-box}
/* LOT Y (Arno) — la couleur suit la règle du cumul « Commissions versées » : ROUGE (alerte) si elle y entre (indépendant), VERT (succès) sinon ;
   la mention écrite (« déduite — dans les commissions versées » / « interne — non déduite ») accompagne toujours la couleur. */
.trx-calcul-encadre--deduite{border-color:var(--color-svv-red)}
.trx-calcul-encadre--interne{border-color:var(--color-svv-green-ink)}
.trx-calcul-mention{grid-column:1 / -1;font-size:.78rem;font-weight:700}
.trx-calcul-encadre--deduite .trx-calcul-mention{color:var(--color-svv-red)}
.trx-calcul-encadre--interne .trx-calcul-mention{color:var(--color-svv-green-ink)}
/* LOT AY (Arno) — « Part de l'agence » : le même cadre que « Commission du négociateur », liseré VERT, montant et mention en vert. */
.trx-calcul-encadre--agence{border-color:var(--color-svv-green-ink)}
/* LOT AY — une opération à plusieurs termes (part de l'agence) se coupe ENTRE les termes, jamais dans un montant. */
.trx-calcul-operation--suite{white-space:normal}
.trx-calcul-terme{white-space:nowrap}
.trx-calcul-encadre--agence .trx-calcul-mention{color:var(--color-svv-green-ink)}
/* LOT BA — les lignes « dont » d'un cadre (information, hors total de la carte) : en petit, sous la mention ; l'alerte « Ventilation incomplète ». */
.trx-calcul-dont{grid-column:1 / -1;display:flex;flex-direction:column;gap:2px;margin-top:2px;font-size:.78rem;color:var(--color-svv-muted)}
.trx-ventilation-alerte{margin:0 0 8px;font-size:.82rem}
/* LOT BD (Arno) — l'en-tête de la carte (la base : commission, − apporteur, = honoraires de la partie ; ligne miroir : honoraires reçus) dans UN cadre
   à liseré GRIS (--trx-lisere-base, clair et sombre, distinct du vert et du rouge), même forme que les autres cadres ; puis les verts, puis les
   rouges, au même espacement (8 px) qu'entre les blocs de la carte. */
.svv-adm-root{--trx-lisere-base:#7b8594}
.svv-adm-root[data-theme='dark']{--trx-lisere-base:#a3adbb}
@media (prefers-color-scheme: dark){ .svv-adm-root[data-theme='system']{--trx-lisere-base:#a3adbb} }
.trx-ventilation{display:flex;flex-direction:column;gap:8px}
.trx-cadre-base{border:1.5px solid var(--trx-lisere-base);border-radius:10px;padding:6px 8px;box-sizing:border-box;gap:4px}
/* LOT BG (Arno) — la ligne résultat du cadre gris : trame des sommes (lot AP) sur toute la largeur intérieure, coins du bas assortis au cadre
   (10 px − 1,5 px de liseré) ; seule (sans apporteur, ligne miroir) : tout le cadre ; filet au-dessus quand un apporteur la précède ; libellé en gras,
   montant principal un cran au-dessus (le petit reste petit) ; « base des calculs ci-dessous » en petit, en gris. */
.trx-calcul-base-resultat{display:flex;flex-direction:column;gap:2px;background:var(--trx-trame);margin:0 -8px -6px;padding:6px 8px;border-radius:0 0 8.5px 8.5px}
.trx-calcul-base-resultat--seule{margin:-6px -8px;border-radius:8.5px}
.trx-calcul-base-resultat--filet{border-top:1px solid var(--color-svv-line)}
.trx-calcul-base-resultat .trx-calcul-libelle{font-weight:700}
.trx-calcul-base-resultat .trx-calcul-resultat{font-size:1.15rem;font-weight:800}
.trx-calcul-base-note{font-size:.75rem;color:var(--color-svv-muted)}
/* LOT BH — l'apporteur d'une affaire : les boutons de la ligne et sa petite fenêtre (au-dessus de la page ; une colonne ; 44 px au toucher). */
.trx-apporteur-affaire{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.trx-ap-voile{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.trx-ap-fenetre{box-sizing:border-box;width:min(520px, 100%);max-height:calc(100dvh - 32px);overflow:auto;display:flex;flex-direction:column;gap:12px;padding:18px;
  background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:14px;box-shadow:0 12px 40px color-mix(in srgb, var(--color-svv-ink) 28%, transparent);font-size:.92rem}
.trx-ap-titre{margin:0;font-size:1.05rem;font-weight:800}
.trx-ap-fenetre p{margin:0}
.trx-ap-champ{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:700;color:var(--color-svv-muted)}
.trx-ap-fenetre .trx-actions{display:flex;flex-wrap:wrap;gap:8px}
.trx-ap-fenetre .svv-btn{min-height:44px}
/* LOT BM — une fiche de personne (formulaire complet et fenêtre des personnes) : tous les champs d'une ligne alignés à la même hauteur ; « fiche de
   l'annuaire n° … » sous son champ, sans décaler les autres. */
.trx-part.trx-fiche{align-items:start}
.trx-part.trx-fiche > .trx-bouton-lien{align-self:end}
.trx-fiche-annuaire{font-size:.75rem;font-weight:400}
/* LOT BM — la fenêtre « Vendeurs — … » / « Acquéreurs — … » : une fiche dépliée encadrée, une fiche repliée sur une ligne, « Fermer » en bas. */
.trx-fenetre-personnes .trx-part.trx-fiche:not(.trx-representant){border:1px solid var(--color-svv-line-strong);border-radius:12px;padding:10px}
.trx-fiche-actions{align-items:center}
.trx-fiche-repliee{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;border:1px solid var(--color-svv-line);border-radius:12px;padding:0 4px 0 12px}
.trx-fiche-libelle{display:flex;align-items:center;gap:4px;appearance:none;border:0;background:transparent;font:inherit;font-weight:700;color:var(--color-svv-ink);min-height:44px;cursor:pointer;text-align:left;flex:1 1 12rem;padding:0}
.trx-fiche-libelle:hover{text-decoration:underline}
.trx-fiche-libelle:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-fiche-repliee > .loc-alerte,.trx-fiche-repliee > .trx-erreur{flex-basis:100%;margin-bottom:8px}
.trx-fenetre-pied{display:flex;flex-direction:column;align-items:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--color-svv-line)}
.trx-fenetre-pied .loc-alerte{align-self:stretch;margin:0}
.trx-fenetre-pied .svv-btn{width:auto;min-height:44px}
/* LOT BS — « Le mois » : le choix du mode (Vendu | Compromis | Vendu + compromis), la barre empilee (compromis plus clairs au-dessus du vendu),
   le detail vendu / compromis de l'encart, la mention des compromis sans date. */
.trx-champ-mode{display:flex;flex-direction:column;gap:4px;min-width:max-content}
.trx-modes{flex-wrap:nowrap}
.trx-modes .trx-unite{white-space:nowrap}
.trx-mode-regle{display:block;max-width:34rem;font-size:.75rem;font-weight:400;white-space:normal}
/* LOT BW — « Compter » prend trois colonnes de la grille des filtres (ses trois boutons tiennent), « Montants » (HT | TTC) la suivante, à sa droite. */
.trx-champ-mode{grid-column:span 3}
/* LOT DI (Arno) — « Montants » (HT | TTC) alignes a DROITE de la ligne des filtres (derniere colonne, bord droit = bord interieur du cadre),
   son libelle aligne a droite au-dessus ; au telephone, sur sa propre ligne, a droite. */
.trx-champ-unite{display:flex;flex-direction:column;align-items:flex-end;text-align:right;gap:4px;min-width:max-content;grid-column:-2/-1;justify-self:end}
@media (max-width:1100px){ .trx-champ-mode{grid-column:span 2} }
@media (max-width:760px){ .trx-champ-mode{grid-column:1/-1} .trx-champ-unite{grid-column:1/-1} }
@media (max-width:420px){ .trx-champ-mode{min-width:0} .trx-modes .trx-unite{padding:0 8px;min-width:0} }
.tdb-barre.tdb-barre--haut{opacity:.42}
.tdb-barre-n1.tdb-barre--haut{opacity:.5}
.tdb-bulle-part{font-size:.85em;opacity:.85}
.trx-sans-date{margin:4px 0 0}
.trx-legende-empile{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:6px 0 0;font-size:.85rem}
.trx-pastille-empile{display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--color-svv-red)}
.trx-pastille-empile--haut{opacity:.42}
/* LOT BU — « Le mois » : une vente se deplie sur la fiche de l'onglet Compromis (toute la ligne, ou le triangle rouge partage ; Entree, Espace) ;
   la fiche occupe toute la largeur du tableau, sous sa ligne. */
.trx-ligne-depliable{cursor:pointer}
.trx-mt-liste{display:inline-flex;flex-direction:column;align-items:flex-end}
.trx-mt-liste-grand{font-weight:700;white-space:nowrap}
.trx-montant-autre{font-size:.82em;font-weight:600;opacity:.78;white-space:nowrap}
/* LOT BZ — les lignes repliées de « Le mois » : compactes (hauteur au minimum lisible), un montant par case sur une ligne, la sortie collée à l'entrée. */
.trx-table-compacte > tbody > tr > th,.trx-table-compacte > tbody > tr > td{padding-top:5px;padding-bottom:5px}
.trx-table-compacte > tbody > tr.trx-ligne-nego--sortie > th,.trx-table-compacte > tbody > tr.trx-ligne-nego--sortie > td{padding-top:1px}
.trx-table-compacte > tbody > tr.trx-ligne-nego--entree > th,.trx-table-compacte > tbody > tr.trx-ligne-nego--entree > td{padding-bottom:2px}
.trx-table-compacte .trx-deplier-vente{min-height:32px}
@media (max-width:1024px){ .trx-table-compacte .trx-deplier-vente{min-height:44px} }
.trx-mt-seul{white-space:nowrap;font-weight:600}
.trx-table-compacte > tbody > tr:not(.trx-ligne-fiche) > th,.trx-table-compacte > tbody > tr:not(.trx-ligne-fiche) > td{vertical-align:middle}
[data-source-fiche]{margin:2px 0 6px}
.trx-pile-droite{display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px}
.trx-ligne-nego-tete{font-weight:500}
/* LOT BW — une vente en deux lignes (entrée, sortie) : un même bloc ; un trait fin pointillé entre les deux. En cartes (téléphone, tablette) : les
   deux cartes collées, le pointillé entre elles ; la case « Action » vide de la sortie n'est pas montrée. */
@media (min-width:1025px){ .trx-ligne-nego--entree > th,.trx-ligne-nego--entree > td{border-bottom:1px dashed var(--color-svv-line)} .trx-ligne-nego--sortie > th,.trx-ligne-nego--sortie > td{padding-top:4px} }
@media (max-width:1024px){
  .tdb-table--large tr.trx-ligne-nego--entree{margin-bottom:0;border-bottom:1px dashed var(--color-svv-line);border-bottom-left-radius:0;border-bottom-right-radius:0}
  .tdb-table--large tr.trx-ligne-nego--sortie{border-top:0;border-top-left-radius:0;border-top-right-radius:0}
  .tdb-table--large tr.trx-ligne-nego--sortie td[data-mot="Action"]:empty{display:none}
}
/* LOT BW — l'encart des graphiques de la tuile : « CA TTC » sur une ligne (l'autre unité entre parenthèses allonge le montant). */
[data-transaction] .tdb-bulle-ligne > span:first-child{white-space:nowrap}
/* 🔴 LOT DO — FUSION : les intitulés « consolidés » sont plus longs — les onglets de mesure passent à la ligne au lieu de déborder, le mot de
   l'encadré peut s'enrouler (le montant reste entier, à droite). CRITERIMMO, MACJ : inchangés. */
[data-transaction="tous"] .tdb-histo-entete-detail .tdb-mesures{flex-wrap:wrap;row-gap:4px}
[data-transaction="tous"] .tdb-bulle-ligne > span:first-child{white-space:normal;min-width:0}
[data-transaction="tous"] .tdb-bulle-ligne > .tdb-bulle-montant{flex:0 0 auto;text-align:right}
.trx-ligne-depliable--ouverte > th,.trx-ligne-depliable--ouverte > td{border-bottom-color:transparent}
.trx-deplier-vente{appearance:none;border:0;background:transparent;font:inherit;font-weight:inherit;color:inherit;display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0;text-align:left;cursor:pointer;border-radius:8px}
.trx-deplier-vente:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-ligne-fiche > td{padding:4px 0 18px;text-align:left;white-space:normal}
.trx-ligne-fiche .trx-carte-detail{display:flex;flex-direction:column;gap:12px}
@media (max-width:760px){ .trx-ligne-fiche > td{display:block;padding:4px 0 14px} .trx-ligne-fiche > td::before{content:none} }
/* LOT BB — « = Honoraires nets partie … » (avec apporteur) : la ligne de total de l'en-tête, en gras. */
.trx-calcul-total .trx-calcul-libelle{font-weight:700}
@container (max-width:30rem){
  .trx-calcul-libelle{grid-column:1 / -1;grid-row:1}
  .trx-calcul-resultat{grid-row:2}
  .trx-calcul-ttc{grid-row:3}
}
/* LOT U (Arno) — la base de répartition en tête du panneau : TTC et HT en colonnes alignées à droite, l'apporteur en rouge (signe et mot avec). */
.trx-resume-base{width:100%;border-collapse:collapse;font-size:.88rem;font-variant-numeric:tabular-nums}
.trx-resume-base th,.trx-resume-base td{padding:4px 0 4px 10px;text-align:right;white-space:nowrap;vertical-align:top}
.trx-resume-base th[scope='row']{padding-left:0;text-align:left;white-space:normal;font-weight:600;color:var(--color-svv-ink);overflow-wrap:break-word}
.trx-resume-base thead th{font-size:.78rem;font-weight:700;color:var(--color-svv-muted)}
.trx-resume-base th.loc-muet{color:var(--color-svv-muted)}
.trx-resume-base .trx-resume-base-total th,.trx-resume-base .trx-resume-base-total td{border-top:1px solid var(--color-svv-line-strong);font-weight:800}
.trx-resume-base-note{display:block;font-size:.78rem;font-weight:400;color:var(--color-svv-muted)}
.trx-resume-base td.trx-resume-montants{width:12em}
.trx-resume-montants > span{display:block;white-space:nowrap}
@media (max-width:640px){
  .trx-form{grid-template-columns:minmax(0,1fr)}
  .trx-colonnes,.trx-grille,.trx-grille.trx-grille--quatre{grid-template-columns:minmax(0,1fr)}
  .trx-part{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  /* LOT BM — sur téléphone, une fiche de personne : un champ par ligne. */
  .trx-part.trx-fiche{grid-template-columns:minmax(0,1fr)}
  .trx-part.trx-fiche > .trx-bouton-lien{justify-self:start}
  .trx-colonne-tete{flex-direction:column;align-items:flex-start}
  /* LOT U — sur téléphone, le libellé sur sa ligne, TTC et HT dessous (toujours alignés à droite, en colonnes). */
  .trx-resume-base tr{display:grid;grid-template-columns:minmax(0,1fr) 12em;column-gap:10px}
  .trx-resume-base tr > td,.trx-resume-base thead th{grid-column:2}
  .trx-resume-base th[scope='row']{grid-column:1/-1;padding-bottom:0}
  .trx-resume-base td:empty{display:none}
  .trx-resume-base .trx-resume-base-total th,.trx-resume-base .trx-resume-base-total td{border-top:0}
  .trx-resume-base .trx-resume-base-total{border-top:1px solid var(--color-svv-line-strong);padding-top:2px}
}
`;

/**
 * ══ 🔴 LOT DO (Arno, 31/10/2026) — LA PAGE FUSION : LES INTITULÉS « CONSOLIDÉS » ═══════════════════════════════════════════════════════════════════
 * Sur la page FUSION CRITERIMMO & MACJ seulement (le fournisseur est posé par `EcranSociete` « tous ») : « Chiffre d’affaires » → « Chiffre
 * d’affaires consolidé », « CA TTC — … » → « CA consolidé TTC — … », « CA net » → « CA net consolidé », « Solde net » → « Solde net consolidé »,
 * « Reste à l’agence » → « Reste consolidé du groupe ». CRITERIMMO, MACJ et le CA global (hors de ce fournisseur) gardent leurs intitulés.
 */
const ConsolideContexte = createContext(false);
export const FournisseurConsolide = ConsolideContexte.Provider;
/** Un intitulé en version consolidée (idempotent). PUR. */
export const consolider = (t: string): string => t
  .replace(/Chiffre d’affaires(?! consolidé)/g, 'Chiffre d’affaires consolidé')
  .replace(/Solde net(?! consolidé)/g, 'Solde net consolidé')
  .replace(/Reste à l’agence/g, 'Reste consolidé du groupe')
  .replace(/\bCA net(?! consolidé)/g, 'CA net consolidé')
  .replace(/\bCA (?=HT\b|TTC\b)/g, 'CA consolidé ')
  .replace(/^CA$/, 'CA consolidé');
const identite = (t: string): string => t;
/** L'intitulé tel que la page l'affiche : consolidé sur la page FUSION, inchangé ailleurs. */
/** 🔴 LOT DP — la page FUSION (les étiquettes de société sur les lignes de négociateur). */
export const usePageFusion = (): boolean => useContext(ConsolideContexte);
export function useConsolide(): (t: string) => string {
  return useContext(ConsolideContexte) ? consolider : identite;
}
