'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { autreUnite, LIBELLE_UNITE, type MontantSaisi } from '../../../../lib/transaction/commissions';
import { ESPACE, eur, nombreFr } from '../../../../lib/transaction/format';
import { TVA } from '../../../../lib/transaction/modele';

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
  const couleur = CLASSE_SENS[sens];
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

/** Les classes propres à la tuile (les autres viennent du Suivi de la Location : `tdb-*`, `loc-*`). Jetons de couleur seulement. */
export const CSS_TRANSACTION = `
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
.trx-onglet-compromis .trx-carte-detail{padding-bottom:6px}
.trx-onglet-compromis .trx-carte.tdb-replie--ouvert{padding-bottom:14px}
.trx-espace-annules{height:16px}
/* LOT H — le champ d'adresse partagé (ChampAdresseBan) dans les formulaires de la tuile : pleine largeur, propositions ≥ 44 px. */
.trx-form .cab-enveloppe input{width:100%;box-sizing:border-box}
.trx-form .cab-prop{min-height:44px;font-size:.92rem}
.trx-carte{border:1px solid var(--color-svv-line-strong);border-radius:14px;padding:10px 14px;background:var(--color-svv-surface)}
/* LOT G (Arno) — CONTRASTE ET RELIEF, en Clair comme en Sombre (jetons seulement) : la page en « field », les cartes et les tuiles plus
   claires (« surface-raised » : blanc en Clair, un cran plus clair que la page en Sombre), bordure marquée, ombre légère (teinte
   « tip-bg », sombre dans les deux thèmes) ; dans une carte dépliée, les sous-blocs reviennent au fond « field », bordés. */
.trx-onglet-compromis{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.trx-onglet-compromis .trx-carte,.trx-onglet-compromis .tdb-tuile,.trx-onglet-compromis .trx-annules{background:var(--color-svv-surface-raised);border:1px solid var(--color-svv-line-strong);
  box-shadow:0 1px 2px color-mix(in srgb, var(--color-svv-tip-bg) 18%, transparent),0 4px 12px color-mix(in srgb, var(--color-svv-tip-bg) 10%, transparent)}
.trx-onglet-compromis .trx-colonne,.trx-onglet-compromis .trx-communes{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.trx-onglet-compromis .trx-carte-detail{border-top-color:var(--color-svv-line-strong)}
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
.trx-personnes li{display:flex;flex-direction:column;gap:2px;font-size:.9rem;overflow-wrap:anywhere}
.trx-personnes li{gap:0}
.trx-personnes a{color:var(--color-svv-red);display:inline-flex;align-items:center;min-height:44px}
.trx-sep{white-space:pre}
.trx-communes{border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px;min-width:0}
.trx-grille{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px;margin:0 0 12px}
.trx-info{min-width:0}
.trx-info dt{font-size:.78rem;color:var(--color-svv-muted)}
.trx-info dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.trx-repartition-titre{margin:0 0 6px}
.trx-barre-actions{border-top:1px solid var(--color-svv-line);padding-top:10px}
@media (max-width:900px){ .trx-grille{grid-template-columns:repeat(2,minmax(0,1fr))} }
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
.trx-unites{display:inline-flex;gap:0;align-self:flex-start;border:1px solid var(--color-svv-line-strong);border-radius:10px;overflow:hidden}
.trx-unite{appearance:none;min-width:56px;min-height:44px;border:0;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer;padding:0 12px}
.trx-unite + .trx-unite{border-left:1px solid var(--color-svv-line-strong)}
.trx-unite[aria-pressed='true']{background:var(--color-svv-ink);color:var(--color-svv-surface)}
.trx-unite:disabled{opacity:.5;cursor:not-allowed}
.trx-unite:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
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
.trx-remuneration{display:flex;flex-direction:column;gap:6px}
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
  .trx-colonnes,.trx-grille{grid-template-columns:minmax(0,1fr)}
  .trx-part{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
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
