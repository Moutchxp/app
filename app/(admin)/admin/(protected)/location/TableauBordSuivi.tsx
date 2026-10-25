'use client';

import { regleAnnexesDe, stockGestion } from '../../../../lib/location/suivi/annexesGestion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  type ActiviteLue, caLigne, commissionApporteurDe, type ContexteCalcul, type DonneesTableau, filtrer, type Filtre, filtreVersParams,
  cumulDepuisJanvier, entreesGestionParMois, lignesDePeriode, NOMS_MOIS, soldeGestionParMois, type Periode, primeDe, sectionApporteurs, sectionCumul, sectionGestion, sectionIndicateurs, sectionMois,
  sectionNegociateurs, totauxPeriode, type TotauxPeriode, tuilesAnnee, variation,
  type AnneeHistorique, type AnneeGestionRecurrente, gestionRecurrenteParAnnee,
} from '../../../../lib/location/suivi/tableauBord';
import { aujourdhuiParis, LIBELLE_TYPE_ACTIVITE } from '../../../../lib/location/suivi/suivi';
import { CSS_FEUILLE_MOIS, FeuilleDuMois } from './FeuilleDuMois';
import { ListeChoix } from './ListeChoix';

/** L'année et le mois de l'adresse de la page (?annee=2025&mois=9), sinon ceux du jour. */
export function anneeMoisDeLAdresse(jour: string, recherche: string = typeof window === 'undefined' ? '' : window.location.search): { annee: number; mois: number } {
  const p = new URLSearchParams(recherche);
  const a = Number(p.get('annee'));
  const m = Number(p.get('mois'));
  return { annee: Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : Number(jour.slice(0, 4)), mois: Number.isInteger(m) && m >= 1 && m <= 12 ? m : Number(jour.slice(5, 7)) };
}

/**
 * 🔴 Arno (24/10/2026) — LE MOIS DE COMPARAISON de la carte « Le mois » : choisi librement (tout mois de toute année, même un mois de
 * l'année en cours ou un mois futur), gardé dans l'adresse (?comparer=2024-03) ; absent ou illisible → le même mois de N−1 (le
 * comportement d'avant). `choisi` : vient-il de l'adresse ? PUR.
 */
export function moisCompare(annee: number, mois: number, comparer: string | null | undefined): { annee: number; mois: number; choisi: boolean } {
  const m = /^(\d{4})-(\d{2})$/.exec(comparer ?? '');
  if (m !== null) {
    const a = Number(m[1]);
    const mm = Number(m[2]);
    if (a >= 2000 && a <= 2100 && mm >= 1 && mm <= 12) return { annee: a, mois: mm, choisi: true };
  }
  return { annee: annee - 1, mois, choisi: false };
}
export function comparerDeLAdresse(recherche: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const v = new URLSearchParams(recherche).get('comparer');
  return v !== null && moisCompare(2000, 1, v).choisi ? v : null;
}
/** Les années proposées pour la comparaison : de la plus ancienne année présente dans les données à l'année en cours. PUR. */
export function anneesComparables(annees: readonly number[], anneeEnCours: number, choisie?: number): number[] {
  const premiere = Math.min(anneeEnCours, ...annees, ...(choisie === undefined ? [] : [choisie]));
  const derniere = Math.max(anneeEnCours, ...(choisie === undefined ? [] : [choisie]));
  return Array.from({ length: derniere - premiere + 1 }, (_, i) => derniere - i);
}

/**
 * Arno (23/10/2026) — « Mois par mois » : la MESURE affichée — CA HT (par défaut), baux signés, nouvelles gestions. Gardée dans
 * l'adresse (?mesure=baux | gestion ; absente = CA).
 */
export type MesureMois = 'ca' | 'baux' | 'gestion';
export const MESURES_MOIS: readonly { cle: MesureMois; mot: string; titre: string }[] = [
  { cle: 'ca', mot: 'CA', titre: 'CA HT' }, { cle: 'baux', mot: 'Baux', titre: 'baux signés' }, { cle: 'gestion', mot: 'Gestion', titre: 'nouvelles gestions' },
];
export function mesureDeLAdresse(recherche: string = typeof window === 'undefined' ? '' : window.location.search): MesureMois {
  // 🔴 Arno (25/10/2026) — la mesure se lit dans « vue » (?vue=ca|baux|gestion) ; une ancienne adresse « ?mesure= » s'ouvre encore.
  const q = new URLSearchParams(recherche);
  const m = q.get('vue') ?? q.get('mesure');
  return m === 'baux' || m === 'gestion' ? m : 'ca';
}
/** 🔴 Arno (25/10/2026) — le mode CUMUL de « Mois par mois » (?cumul=1) ; absent : les barres. */
export function cumulDeLAdresse(recherche: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(recherche).get('cumul') === '1';
}

/**
 * ══ 🔴 LOCATION — « OUTILS DE SUIVI » : LE TABLEAU DE BORD DE L'ACTIVITÉ (Arno, 22/10/2026) ═══════════════════════════════════
 * Le suivi mensuel d'Arno (CA_JBP_2026.xlsx), tenu par l'outil :
 *   · filtres : année, mois, négociateur, apporteur, avec / sans gestion, nouveau / déjà client ;
 *   · 4 grosses tuiles : CA du mois, baux signés, CA cumulé de l'année (chacun face à N−1), portefeuille en gestion ;
 *   · A le mois (et N−1) · B le cumul de l'année, en courbes · C les apporteurs · D la gestion récurrente sur 12 mois ·
 *     E les indicateurs (vacance, préavis, GLI / Visale, parkings) · F les négociateurs (droit « Voir les commissions ») ·
 *     G l'export .xlsx, un onglet par mois ;
 *   · 🔴 TOUT CHIFFRE S'OUVRE : la liste des baux (ou des biens) qui le font.
 * Les calculs sont ceux de `tableauBord.ts` (reproduction exacte des formules du fichier), sur les lignes de la base.
 */
const API = '/api/admin/location/suivi';
const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const eurRond = (x: number): string => `${Math.round(x).toLocaleString('fr-FR')} €`;
const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const signe = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x))}`);
const moisCourt = (m: string): string => `${NOMS_MOIS[Number(m.slice(5, 7)) - 1].slice(0, 4).replace(/\.$/, '')}. ${m.slice(0, 4)}`;
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
const ecartEur = (x: number): string => `${x >= 0 ? '+' : '−'}${eur(Math.abs(x))}`;
/** 🔴 Arno (25/10/2026) — un écart et son pourcentage : « +9 004,81 € (+139,2 %) » ; sans base (comparé à 0) : « +x € (—) ». */
export const ecartEtPct = (ecart: string, part: number | null): string => `${ecart} (${signe(part)})`;
const ecartNb = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x)}`;
const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** A — les lignes du tableau du mois ; `commission` : seulement avec « Voir les commissions ». */
const LIGNES_A: { k: 'nb' | 'caProprietaire' | 'caLocataire' | 'ca' | 'apporteurs' | 'caNet' | 'avecGestion' | 'sansGestion' | 'primes' | 'retrocessions' | 'commission'; mot: string; commission?: boolean }[] = [
  { k: 'nb', mot: 'Baux signés (avenants compris)' },
  { k: 'caProprietaire', mot: 'Honoraires propriétaires HT' },
  { k: 'caLocataire', mot: 'Honoraires locataires HT' },
  { k: 'ca', mot: 'TOTAL CA HT' },
  { k: 'apporteurs', mot: 'Commissions des apporteurs' },
  { k: 'caNet', mot: 'CA HT − apporteurs' },
  { k: 'avecGestion', mot: 'Location avec gestion' },
  { k: 'sansGestion', mot: 'Location sans gestion' },
  { k: 'primes', mot: 'Primes de nouvelle gestion', commission: true },
  { k: 'retrocessions', mot: 'Rétrocessions', commission: true },
  { k: 'commission', mot: 'Commission brute du négociateur', commission: true },
];

/**
 * 🔴 Arno (24/10/2026) — les largeurs FIXES (px) des colonnes de la carte « Le mois » : deux montants (« 1 234 567,89 € », « SEPTEMBRE
 * 2026 »), l'écart (« −123 456,78 € · −100,0 % » sur une ligne) et le chevron ; l'intitulé prend le reste. Elles ne dépendent
 * jamais des données (ni du mois, ni des montants).
 */
export const LARGEURS_A = { montant: 145, ecart: 215, chevron: 52 } as const;
/** 🔴 Arno (25/10/2026) — « Année par année » déplié : au plus HUIT années visibles (la hauteur de 2019 → 2026), défilement au-delà. */
export const HUIT_ANNEES = 8;

type Detail = { titre: string; ids?: (number | string)[]; lots?: { titre: string; ids: number[] }[] } | null;

/**
 * Arno (23/10/2026) — DEUX BRIQUES : `vue="mois"` (« Suivi du mois » : onglets des mois, section A et la feuille du mois) et
 * `vue="annee"` (« Suivi annuel » : sections B à G). Les filtres, les 4 tuiles et la liste qui s'ouvre sont dans les deux.
 */
// `administrateur` : reçu de la page ; le lien « Gérer les apporteurs → » qu'il ouvrait est retiré (Arno, 23/10/2026 : la brique
// « Annuaire des apporteurs » de l'accueil des Outils de suivi le remplace).
export function TableauBordSuivi({ vue = 'annee' }: { vue?: 'mois' | 'annee'; administrateur?: boolean }) {
  const jour = aujourdhuiParis();
  const [n, setN] = useState(0);
  // Arno (23/10/2026) — l'année et le mois se gardent dans l'adresse (?annee=2025&mois=9) : un rechargement ou un lien garde la
  // sélection. Par défaut : l'année et le mois EN COURS (jamais une valeur écrite en dur). Rien ne s'affiche avant la lecture des
  // données, quelle que soit l'année : pas d'écart entre le rendu du serveur et celui du navigateur.
  const [annee, setAnnee] = useState(() => anneeMoisDeLAdresse(jour).annee);
  const [mois, setMois] = useState(() => anneeMoisDeLAdresse(jour).mois);
  const [mesure, setMesure] = useState<MesureMois>(() => mesureDeLAdresse());
  const [cumulMois, setCumulMois] = useState<boolean>(() => cumulDeLAdresse());
  // 🔴 Arno (24/10/2026) — le mois de comparaison de la carte « Le mois » (?comparer=AAAA-MM ; absent : même mois N−1), et la carte
  // repliée par défaut (non gardé : un rechargement la replie).
  const [comparer, setComparer] = useState<string | null>(() => comparerDeLAdresse());
  const [carteMoisOuverte, setCarteMoisOuverte] = useState(false);
  // 🔴 Arno (25/10/2026) — « Année par année » REPLIÉ à chaque chargement (l'année en cours seule) ; déplié, une hauteur bornée à
  // l'en-tête + HUIT années, MESURÉE sur le rendu (tableau ou cartes du téléphone), défilement interne au-delà, ouvert sur l'année en cours.
  const [histoOuvert, setHistoOuvert] = useState(false);
  const cadreHisto = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    const mesureVoulue = vue === 'mois' && mesure !== 'ca' ? mesure : null;
    const cumulVoulu = vue === 'mois' && cumulMois ? '1' : null;
    const comparerVoulu = vue === 'mois' ? comparer : null;
    if (u.searchParams.get('annee') === String(annee) && u.searchParams.get('mois') === String(mois) && u.searchParams.get('vue') === mesureVoulue
      && u.searchParams.get('mesure') === null && u.searchParams.get('cumul') === cumulVoulu && u.searchParams.get('comparer') === comparerVoulu) return;
    u.searchParams.set('annee', String(annee));
    u.searchParams.set('mois', String(mois));
    // Arno (23/10/2026) — la mesure de « Mois par mois » (Suivi du mois) : ?vue=baux | gestion (25/10/2026 : « vue », plus « mesure ») ;
    // CA (le défaut) n'écrit rien ; le mode cumul : &cumul=1.
    u.searchParams.delete('mesure');
    if (mesureVoulue === null) u.searchParams.delete('vue'); else u.searchParams.set('vue', mesureVoulue);
    if (cumulVoulu === null) u.searchParams.delete('cumul'); else u.searchParams.set('cumul', cumulVoulu);
    if (comparerVoulu === null) u.searchParams.delete('comparer'); else u.searchParams.set('comparer', comparerVoulu);
    window.history.replaceState(window.history.state, '', `${u.pathname}?${u.searchParams.toString()}${u.hash}`);
  }, [annee, mois, mesure, cumulMois, vue, comparer]);
  const cmp = moisCompare(annee, mois, comparer);
  // Une comparaison hors des deux années lues (l'année et N−1) : ses lignes se lisent à part, par la même route (lecture seule).
  const horsFenetre = vue === 'mois' && cmp.annee !== annee && cmp.annee !== annee - 1;
  const [luCmp, setLuCmp] = useState<{ annee: number; activites: ActiviteLue[] } | { annee: number; erreur: true } | null>(null);
  useEffect(() => {
    if (!horsFenetre) return;
    let vivant = true;
    fetch(`${API}?vue=tableau&annee=${cmp.annee}`, { cache: 'no-store' }).then((r) => r.json())
      .then((x: { etat?: string; data?: DonneesTableau }) => {
        if (vivant) setLuCmp(x.etat === 'ok' && x.data && Array.isArray(x.data.activites) ? { annee: cmp.annee, activites: x.data.activites } : { annee: cmp.annee, erreur: true });
      }).catch(() => { if (vivant) setLuCmp({ annee: cmp.annee, erreur: true }); });
    return () => { vivant = false; };
  }, [horsFenetre, cmp.annee, n]);
  const [portee, setPortee] = useState<'mois' | 'annee'>('mois');
  const [filtre, setFiltre] = useState<Filtre>({});
  const [lu, setLu] = useState<{ annee: number; d: DonneesTableau } | { annee: number; erreur: string } | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?vue=tableau&annee=${annee}`, { cache: 'no-store' }).then((r) => (r.status === 403 ? { etat: 'refus' } : r.json()))
      .then((x: { etat?: string; data?: DonneesTableau; message?: string }) => {
        if (!vivant) return;
        if (x.etat === 'ok' && x.data && Array.isArray(x.data.activites)) setLu({ annee, d: x.data });
        else setLu({ annee, erreur: x.etat === 'refus' ? 'Accès refusé : droit « Location » requis.' : x.message ?? 'Lecture impossible.' });
      }).catch(() => { if (vivant) setLu({ annee, erreur: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [annee, n]);
  useEffect(() => {
    if (detail === null) return;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [detail]);

  const d = lu !== null && lu.annee === annee && 'd' in lu ? lu.d : null;
  // 413 — les affaires « Récurrent » de toutes les années (mêmes filtres) : leur part gestion est due chaque mois en gestion.
  const ctx: ContexteCalcul = useMemo(() => ({ regles: d?.regles ?? [], apporteurs: d?.apporteurs ?? [], retrocessions: d?.retrocessions ?? [],
    recurrents: filtrer(d?.recurrents ?? [], filtre), aujourdhui: d?.aujourdhui }), [d, filtre]);
  const lignes = useMemo(() => (d === null ? [] : filtrer(d.activites, filtre)), [d, filtre]);
  const activitesCmp = luCmp !== null && 'activites' in luCmp && luCmp.annee === cmp.annee ? luCmp.activites : null;
  const parId = useMemo(() => new Map([...(activitesCmp ?? []), ...(d?.activites ?? [])].map((a) => [String(a.id), a])), [d, activitesCmp]);
  // La hauteur se remesure à chaque rendu des données (une autre année ouverte, une fenêtre redimensionnée).
  useLayoutEffect(() => {
    const cadre = cadreHisto.current;
    if (cadre === null) return;
    if (!histoOuvert) { cadre.style.maxHeight = ''; return; }
    // Un redimensionnement remesure la borne sans toucher au défilement choisi ; l'ouverture se place sur l'année en cours.
    const mesurer = (): void => {
      const garde = cadre.scrollTop;
      cadre.style.maxHeight = '';
      const rangees = [...cadre.querySelectorAll<HTMLElement>('tr[data-annee-historique]')];
      if (rangees.length === 0) return;
      const huitieme = rangees[Math.min(HUIT_ANNEES, rangees.length) - 1];
      const marge = parseFloat(getComputedStyle(huitieme).marginBottom) || 0;
      cadre.style.maxHeight = `${huitieme.getBoundingClientRect().bottom + marge - cadre.getBoundingClientRect().top}px`;
      cadre.scrollTop = garde;
    };
    mesurer();
    const enCours = cadre.querySelector<HTMLElement>('tr[data-annee-en-cours]');
    if (enCours !== null) cadre.scrollTop = enCours.offsetTop + enCours.offsetHeight - cadre.clientHeight;
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [histoOuvert, d, vue]);

  if (lu === null || (lu.annee !== annee)) return <p className="gst-info" role="status">Chargement du tableau de bord…</p>;
  if ('erreur' in lu) return <p className="gst-erreur" role="alert">{lu.erreur}</p>;
  if (d === null) return null;

  const anneeEnCoursH = Number(jour.slice(0, 4));
  const periodeMois: Periode = { annee, mois };
  const periode: Periode = portee === 'mois' ? periodeMois : { annee, mois: null };
  const libellePeriode = portee === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : `l’année ${annee}`;
  const A = sectionMois(lignes, ctx, periodeMois, filtre.negociateur);
  const B = sectionCumul(lignes, ctx, annee);
  const cumul = B[mois - 1];
  const varCumul = cumul.caCumuleN1 === 0 ? null : (cumul.caCumule - cumul.caCumuleN1) / cumul.caCumuleN1;
  const idsCumul = B.slice(0, mois).flatMap((p) => p.ids);
  const moisEcoules = Array.from({ length: portee === 'mois' ? 1 : (annee === Number(jour.slice(0, 4)) ? Number(jour.slice(5, 7)) : 12) },
    (_, i) => `${annee}-${String(portee === 'mois' ? mois : i + 1).padStart(2, '0')}`);
  const C = sectionApporteurs(lignes, ctx, periode, moisEcoules);
  const moisFinGestion = `${annee}-${String(mois).padStart(2, '0')}`;
  // 🔴 Arno (25/10/2026, 426) — la règle des annexes : à partir de la bascule, une annexe ne compte ni en entrée, ni en sortie, ni dans le stock.
  const regleA = regleAnnexesDe(d);
  const stockA = stockGestion(d.gestion.stock, d.gestion.transitions, regleA);
  const D = sectionGestion(d.gestion.transitions, stockA, annee === Number(jour.slice(0, 4)) && mois > Number(jour.slice(5, 7)) ? jour.slice(0, 7) : moisFinGestion, regleA);
  const Dm = D.at(-1)!;
  const lignesPeriode = lignesDePeriode(lignes, periode);
  const preavis = portee === 'mois' ? d.preavis[moisFinGestion] ?? 0 : Object.entries(d.preavis).filter(([k]) => k.startsWith(`${annee}-`)).reduce((s, [, v]) => s + v, 0);
  const E = sectionIndicateurs(lignesPeriode, preavis);
  // 🔴 Arno (25/10/2026) — un administrateur calcule tous les négociateurs ; un négociateur non administrateur reçoit SES lignes (serveur).
  const propre = d.voirCommissions ? undefined : d.negociateurPropre;
  const F = d.voirCommissions ? sectionNegociateurs(lignes, ctx, periode)
    : (propre?.lignes ?? []).filter((l) => periode.mois === null || l.mois === `${periode.annee}-${String(periode.mois).padStart(2, '0')}`);
  const sansN1 = !d.activites.some((a) => a.dateSignature.startsWith(`${annee - 1}-`));
  // Arno (23/10/2026) — Suivi annuel : les tuiles montrent l'ANNÉE (en cours : du 1er janvier à la fin du mois choisi), face à N−1 sur la même période.
  const T = tuilesAnnee(lignes, ctx, annee, jour, mois, d.gestionLignes ?? [], regleA);
  const periodeT = T.complete ? String(annee) : `${COURT[0]} → ${COURT[T.moisFin - 1]}`;
  const periodeN1 = T.complete ? String(annee - 1) : `${COURT[0]} → ${COURT[T.moisFin - 1]} ${annee - 1}`;
  const reprises = d.activites.filter((a) => a.source === 'import' && a.dateSignature.startsWith(`${annee}-`));
  const nonRattachees = reprises.filter((a) => a.rattachement !== 'rattache').length;
  const ouvrir = (titre: string, ids: (number | string)[]) => () => setDetail({ titre, ids });
  const chiffre = (valeur: string, titre: string, ids: (number | string)[], attr?: string) => (
    <button type="button" className="tdb-chiffre" onClick={ouvrir(titre, ids)} disabled={ids.length === 0} data-chiffre={attr}
      title={ids.length === 0 ? 'Aucun bail' : `Voir les ${ids.length} ligne(s)`}>{valeur}</button>
  );
  const exportHref = `${API}/export?annee=${annee}${filtreVersParams(filtre) ? `&${filtreVersParams(filtre)}` : ''}`;
  const poser = (p: Partial<Filtre>): void => setFiltre((f) => ({ ...f, ...p }));

  return (
    <div className="tdb" data-tableau-de-bord>
      <style>{CSS_TABLEAU_BORD + CSS_FEUILLE_MOIS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-tdb-sans-migration>Mise à jour de la base à appliquer (migration 406) : le tableau de bord se remplira dès qu’elle le sera.</p>}

      {vue === 'mois' && (
        <div className="tdb-rangee-mois" data-rangee-mois>
          <div className="tdb-onglets" role="tablist" aria-label={`Mois de ${annee}`} data-onglets-mois>
            {NOMS_MOIS.map((m, i) => (
              <button key={m} type="button" role="tab" aria-selected={mois === i + 1} className="tdb-onglet" onClick={() => setMois(i + 1)} data-onglet-mois={i + 1}>
                {/* Le point gris (mois sans affaire) ne vaut que pour l'année en cours ; une année passée a ses 12 mois actifs. */}
                {m}{annee !== Number(jour.slice(0, 4)) || lignes.some((a) => a.dateSignature.startsWith(`${annee}-${String(i + 1).padStart(2, '0')}`)) ? '' : <span className="tdb-onglet-vide" aria-hidden="true"> ·</span>}</button>
            ))}
          </div>
          {/* Arno (23/10/2026) — l'année, au bout de la rangée (collée à droite : sur téléphone, la rangée défile, l'année reste visible).
              Toujours synchronisée avec le filtre « Année » du bloc des filtres (le même état). */}
          <div className="tdb-onglet-annee" data-selecteur-annee>
            <ListeChoix options={[...d.annees].sort((x, y) => y - x).map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
              classe="tdb-onglet tdb-onglet-annee-champ" onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-annee-onglets': '' }} />
          </div>
        </div>
      )}
      <form className="tdb-filtres" aria-label="Filtres du tableau de bord" onSubmit={(e) => e.preventDefault()} data-filtres>
        {/* 🔴 Arno (24/10/2026) — plus de <select> natif en Location : les listes vertes, menu juste sous le champ (mêmes options). */}
        <label className="tdb-champ">Année
          <ListeChoix options={d.annees.map((a) => ({ id: a, libelle: String(a) }))} valeur={String(annee)} vide={null} libelle="Année"
            onChange={(v) => setAnnee(Number(v))} donnees={{ 'data-filtre': 'annee' }} /></label>
        {vue === 'annee' && (
          <label className="tdb-champ">Mois
            <ListeChoix options={NOMS_MOIS.map((m, i) => ({ id: i + 1, libelle: m }))} valeur={String(mois)} vide={null} libelle="Mois"
              onChange={(v) => setMois(Number(v))} donnees={{ 'data-filtre': 'mois' }} /></label>
        )}
        <label className="tdb-champ">Négociateur
          <ListeChoix options={d.negociateurs.map((n) => ({ id: n.cle, libelle: n.libelle }))} valeur={filtre.negociateur ?? ''} vide="Tous" libelle="Négociateur"
            onChange={(v) => poser({ negociateur: v || null })} donnees={{ 'data-filtre': 'negociateur' }} /></label>
        <label className="tdb-champ">Apporteur
          <ListeChoix options={[{ id: 'aucun', libelle: 'Sans apporteur' }, ...d.apporteurs.filter((a) => !a.archive).map((a) => ({ id: a.id, libelle: a.nom }))]}
            valeur={filtre.apporteur === null || filtre.apporteur === undefined ? '' : String(filtre.apporteur)} vide="Tous" libelle="Apporteur"
            onChange={(v) => poser({ apporteur: v === '' ? null : v === 'aucun' ? 'aucun' : Number(v) })} donnees={{ 'data-filtre': 'apporteur' }} /></label>
        <label className="tdb-champ">Gestion
          <ListeChoix options={[{ id: 'avec', libelle: 'Avec gestion' }, { id: 'sans', libelle: 'Sans gestion' }]} valeur={filtre.gestion ?? ''} vide="Avec et sans" libelle="Gestion"
            onChange={(v) => poser({ gestion: v === 'avec' || v === 'sans' ? v : null })} donnees={{ 'data-filtre': 'gestion' }} /></label>
        <label className="tdb-champ">Client
          <ListeChoix options={[{ id: 'nouveau', libelle: 'Nouveaux clients' }, { id: 'deja', libelle: 'Déjà clients' }]} valeur={filtre.origine ?? ''} vide="Nouveaux et déjà clients" libelle="Client"
            onChange={(v) => poser({ origine: v === 'nouveau' || v === 'deja' ? v : null })} donnees={{ 'data-filtre': 'origine' }} /></label>
      </form>

      {vue === 'annee' ? (
        <ul className="tdb-tuiles" aria-label={`L’essentiel de ${annee}`} data-tuiles-annee>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA HT ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="ca-annee">
            <span className="tdb-tuile-mot">CA HT {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{eur(T.courant.ca)}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : <>{periodeN1} : {eur(T.precedent.ca)} · <span className="tdb-ecart-insecable">{ecartEtPct(ecartEur(T.ecartCa), T.variationCa)}</span></>}</span></button></li>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`Baux signés en ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="baux-annee">
            <span className="tdb-tuile-mot">Baux signés en {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{T.courant.nbBaux}{T.courant.nbAvenants + T.courant.nbGestionSeule > 0 && <small> + {T.courant.nbAvenants + T.courant.nbGestionSeule} autre(s)</small>}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : <>{periodeN1} : {T.precedent.nbBaux} · <span className="tdb-ecart-insecable">{ecartEtPct(ecartNb(T.ecartNb), T.variationNb)}</span></>}</span></button></li>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA net d’apporteurs ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="ca-net-annee">
            <span className="tdb-tuile-mot">CA net d’apporteurs {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{eur(T.courant.caNet)}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : <>{periodeN1} : {eur(T.precedent.caNet)} · <span className="tdb-ecart-insecable">{ecartEtPct(ecartEur(T.ecartCaNet), T.variationCaNet)}</span></>}</span></button></li>
          <li><button type="button" className="tdb-tuile" data-tuile="gestion"
            onClick={() => setDetail({ titre: `Gestion — ${annee}${T.complete ? '' : ` (${periodeT})`}`, lots: [{ titre: 'Entrés en gestion', ids: T.gestion.lotsEntres }, { titre: 'Sortis de la gestion', ids: T.gestion.lotsSortis }] })}>
            <span className="tdb-tuile-mot">Biens en gestion</span>
            <strong className="tdb-tuile-valeur" data-biens-en-gestion>{d.gestion.disponible ? stockA : '—'}</strong>
            {d.gestion.disponible ? <>
              <MouvementsGestion periode={`${annee}${T.complete ? '' : ` (${periodeT})`}`} nouveaux={T.gestion.nouvelles} sortis={T.gestion.perdues} />
              <span className="tdb-tuile-n1 tdb-gestion-recurrent">récurrent {ecartEur(T.gestion.gagneMensuel)} / −{eur(T.gestion.perduMensuel)} par mois{T.gestion.sansLoyer > 0 ? ` (${T.gestion.sansLoyer} sans loyer saisi, non comptés)` : ''}</span>
            </> : <span className="tdb-tuile-n1">statut du bien : migration 403</span>}</button></li>
        </ul>
      ) : (
      <ul className="tdb-tuiles" aria-label="L’essentiel">
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA HT — ${NOMS_MOIS[mois - 1]} ${annee}`, A.courant.ids)} data-tuile="ca-mois">
          <span className="tdb-tuile-mot">CA HT — {NOMS_MOIS[mois - 1].toLowerCase()}</span>
          <strong className="tdb-tuile-valeur">{eur(A.courant.ca)}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${eur(A.precedent.ca)} en ${annee - 1} (${signe(A.variationCa)})`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`Baux signés — ${NOMS_MOIS[mois - 1]} ${annee}`, A.courant.ids)} data-tuile="baux-mois">
          <span className="tdb-tuile-mot">Baux signés — {NOMS_MOIS[mois - 1].toLowerCase()}</span>
          <strong className="tdb-tuile-valeur">{A.courant.nbBaux}{A.courant.nbAvenants + A.courant.nbGestionSeule > 0 && <small> + {A.courant.nbAvenants + A.courant.nbGestionSeule} autre(s)</small>}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${A.precedent.nbBaux} en ${annee - 1} (${signe(A.variationNb)})`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA cumulé — janvier à ${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`, idsCumul)} data-tuile="ca-cumul">
          <span className="tdb-tuile-mot">CA cumulé {annee} (à fin {NOMS_MOIS[mois - 1].toLowerCase()})</span>
          <strong className="tdb-tuile-valeur">{eur(cumul.caCumule)}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${eur(cumul.caCumuleN1)} en ${annee - 1} (${signe(varCumul)})`}</span></button></li>
        <li><button type="button" className="tdb-tuile" data-tuile="gestion"
          onClick={() => setDetail({ titre: `Gestion — ${NOMS_MOIS[Number(Dm.mois.slice(5)) - 1].toLowerCase()} ${Dm.mois.slice(0, 4)}`, lots: [{ titre: 'Entrés en gestion', ids: Dm.lotsEntres }, { titre: 'Sortis de la gestion', ids: Dm.lotsSortis }] })}>
          <span className="tdb-tuile-mot">Biens en gestion</span>
          <strong className="tdb-tuile-valeur">{d.gestion.disponible ? Dm.stock : '—'}</strong>
          {d.gestion.disponible ? <MouvementsGestion periode={moisCourt(Dm.mois)} nouveaux={Dm.entrees} sortis={Dm.sorties} />
            : <span className="tdb-tuile-n1">statut du bien : migration 403</span>}</button></li>
      </ul>
      )}

      {(sansN1 || reprises.length > 0) && (
        <p className="loc-muet tdb-note" data-tdb-note>
          {sansN1 && <>Aucune donnée pour {annee - 1} : les comparaisons N−1 apparaîtront une fois le suivi {annee - 1} importé. </>}
          {reprises.length > 0 && <>{reprises.length} ligne(s) de {annee} reprises du suivi mensuel (date de signature supposée au 1<sup>er</sup> du mois){nonRattachees > 0 ? `, dont ${nonRattachees} non rattachée(s) à un bail de l’outil` : ''}.</>}
        </p>
      )}

      {vue === 'mois' && (() => {
        /* Arno (23/10/2026) — trois mesures, mois par mois : CA HT (comme avant), baux signés (`nb` : la ligne « Baux signés (avenants
           compris) » du tableau du mois), nouvelles gestions (passages au statut « En gestion », sans soustraire les sorties). */
        const mm = MESURES_MOIS.find((x) => x.cle === mesure) ?? MESURES_MOIS[0];
        const gestionN = entreesGestionParMois(d.gestion.transitions, annee, regleA);
        const gestionN1 = entreesGestionParMois(d.gestion.transitions, annee - 1, regleA);
        const sansN1Gestion = !d.gestion.disponible || !d.gestion.transitions.some((t) => t.effetLe.startsWith(`${annee - 1}-`));
        const sansN1Mesure = mesure === 'gestion' ? sansN1Gestion : sansN1;
        const motDetail = mesure === 'baux' ? 'Baux signés' : 'Nouvelles gestions';
        /* 🔴 Arno (25/10/2026) — le MODE CUMUL : la courbe du cumul depuis janvier de la mesure choisie, l'année face à N−1, sur le modèle de
           « Le cumul de <année> » (le même composant `CourbeCumul`) : CA → CA HT cumulé ; Baux → baux cumulés ; Gestion → SOLDE de gestions
           cumulé (entrées − sorties, la source de la section Gestion). L'année en cours s'arrête au mois courant (pas de plat à venir). */
        const motCumul = mesure === 'ca' ? 'CA HT' : mesure === 'baux' ? 'baux signés' : 'solde de gestions';
        const parMoisN = mesure === 'ca' ? B.map((p) => p.ca) : mesure === 'baux' ? B.map((p) => p.nb) : soldeGestionParMois(d.gestion.transitions, annee, regleA);
        const parMoisN1 = mesure === 'ca' ? B.map((p) => p.caN1) : mesure === 'baux' ? B.map((p) => p.nbN1) : soldeGestionParMois(d.gestion.transitions, annee - 1, regleA);
        const cumulN = cumulDepuisJanvier(parMoisN);
        const cumulN1 = cumulDepuisJanvier(parMoisN1);
        const bauxN = cumulDepuisJanvier(B.map((p) => p.nb));
        const bauxN1 = cumulDepuisJanvier(B.map((p) => p.nbN1));
        const moisCourbe = moisDeLaCourbe(annee, jour);
        const indisponible = mesure === 'gestion' && !d.gestion.disponible;
        const motCompte = mesure === 'baux' ? 'Baux signés (cumul)' : 'Solde de gestions (cumul)';
        const bulleCumul = (k: number): InfoBarre => {
          const aVenir = k > moisCourbe || indisponible;
          const titre = `Cumul à fin ${NOMS_MOIS[k - 1].toLowerCase()}`;
          if (mesure === 'ca') return { titre, courant: { libelle: String(annee), ca: aVenir ? null : cumulN[k - 1], nb: aVenir ? null : bauxN[k - 1] },
            precedent: sansN1 ? null : { libelle: String(annee - 1), ca: cumulN1[k - 1], nb: bauxN1[k - 1] } };
          return { titre, compte: motCompte, courant: { libelle: String(annee), ca: aVenir ? null : cumulN[k - 1], nb: null },
            precedent: sansN1Mesure ? null : { libelle: String(annee - 1), ca: cumulN1[k - 1], nb: null } };
        };
        return (
        <section className="tdb-section" aria-labelledby="tdb-histo" data-bloc="histogramme-mois" data-mesure={mesure}>
          {/* 🔴 Arno (25/10/2026) — l'EN-TÊTE suit les deux colonnes du bloc (la même grille que le graphique et son encart) : à gauche, le
              titre et la bascule « Mensuel / Cumul », son bord droit sur celui de la zone tracée (« déc. ») ; à droite, CA · Baux · Gestion
              sur les bords de l'encart. Un titre trop long passe à la ligne, jamais le bouton. Encart sous le graphique (≤ 760 px) : le titre,
              puis bouton et mesures sur une ligne, à droite. */}
          <div className="tdb-titre-mesures tdb-histo-entete" data-histo-entete>
            <div className="tdb-histo-entete-graphe" data-entete-graphe>
              <h3 id="tdb-histo">{cumulMois ? <>Mois par mois — {annee} <small className="loc-muet">({motCumul}, cumulé depuis janvier ; un mois s’ouvre d’un clic)</small></>
                : mesure === 'ca' ? <>Mois par mois — {annee} <small className="loc-muet">(CA HT ; un mois s’ouvre d’un clic)</small></>
                : <>Mois par mois — {annee} <small className="loc-muet">({mm.titre} ; un mois s’ouvre d’un clic)</small></>}</h3>
              <button type="button" className="tdb-bascule-cumul" data-cumul-bouton data-cumul-etat={cumulMois ? 'cumul' : 'mensuel'}
                title={cumulMois ? 'Afficher le mensuel' : 'Afficher le cumul'} aria-label={cumulMois ? 'Cumul — afficher le mensuel' : 'Mensuel — afficher le cumul'}
                onClick={() => setCumulMois((c) => !c)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCumulMois((c) => !c); } }}>
                <span className="tdb-bascule-cumul-icone" aria-hidden="true">⇄</span><span data-cumul-libelle>{cumulMois ? 'Cumul' : 'Mensuel'}</span>
              </button>
            </div>
            <div className="tdb-histo-entete-detail" data-entete-detail>
              <div className="tdb-mesures" role="group" aria-label="Mesure affichée" data-mesures>
                {MESURES_MOIS.map((x) => (
                  <button key={x.cle} type="button" className="tdb-onglet tdb-mesure" aria-pressed={mesure === x.cle} data-mesure-bouton={x.cle}
                    onClick={() => setMesure(x.cle)}>{x.mot}</button>
                ))}
              </div>
            </div>
          </div>
          {mesure === 'gestion' && !d.gestion.disponible && <p className="loc-muet tdb-note">Statut du bien : migration 403 non appliquée — pas encore de nouvelles gestions à compter.</p>}
          {cumulMois ? (
            <CourbeCumul courant={indisponible ? [] : cumulN.slice(0, moisCourbe)} n1={sansN1Mesure ? null : cumulN1} annee={annee} moisSelectionne={mois}
              entier={mesure !== 'ca'} aria={`${motCumul} cumulé ${annee}${sansN1Mesure ? '' : ` et ${annee - 1}`}, de janvier à décembre`}
              bulle={bulleCumul} onChoisir={setMois} />
          ) : (
          <Histogramme attribut="data-barre-mois" courante={mois} onChoisir={setMois} entier={mesure !== 'ca'}
            aria={`${mesure === 'ca' ? 'CA HT' : motDetail} par mois, ${annee}${sansN1Mesure ? '' : ` et ${annee - 1}`}`}
            legende={{ courant: String(annee), n1: sansN1Mesure ? null : String(annee - 1) }}
            barres={B.map((p, i) => {
              // Un mois à venir de l'année en cours : pas de barre (pas de 0 trompeur) ; un mois passé sans activité : 0.
              const aVenir = annee === Number(jour.slice(0, 4)) && i + 1 > Number(jour.slice(5, 7));
              if (mesure === 'ca') {
                return { cle: i + 1, libelle: COURT[i], valeur: aVenir ? null : p.ca, n1: sansN1 ? null : p.caN1,
                  info: { titre: NOMS_MOIS[i], courant: { libelle: String(annee), ca: aVenir ? null : p.ca, nb: aVenir ? null : p.nb },
                    precedent: sansN1 ? null : { libelle: String(annee - 1), ca: p.caN1, nb: p.nbN1 } } };
              }
              const v = mesure === 'baux' ? p.nb : gestionN[i];
              const v1 = mesure === 'baux' ? p.nbN1 : gestionN1[i];
              return { cle: i + 1, libelle: COURT[i], valeur: aVenir || (mesure === 'gestion' && !d.gestion.disponible) ? null : v, n1: sansN1Mesure ? null : v1,
                info: { titre: NOMS_MOIS[i], compte: motDetail, courant: { libelle: String(annee), ca: aVenir ? null : v, nb: null },
                  precedent: sansN1Mesure ? null : { libelle: String(annee - 1), ca: v1, nb: null } } };
            })} />
          )}
        </section>
        );
      })()}

      {vue === 'mois' && (() => {
        /* 🔴 Arno (24/10/2026) — la carte « Le mois » REPLIÉE par défaut sur 2 lignes (en-têtes avec le mois comparé, TOTAL CA HT) ;
           la ligne TOTAL CA HT ou le chevron la déplie : les autres indicateurs, face au mois choisi, dans la même grille. */
        const libCourant = `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`;
        const libCmp = `${NOMS_MOIS[cmp.mois - 1].toLowerCase()} ${cmp.annee}`;
        const lignesCmp = !horsFenetre ? lignes : activitesCmp === null ? null : filtrer(activitesCmp, filtre);
        const sourceCmp = !horsFenetre ? d.activites : activitesCmp;
        const P = lignesCmp === null ? null : totauxPeriode(lignesCmp, ctx, { annee: cmp.annee, mois: cmp.mois }, filtre.negociateur);
        // Sans aucune donnée pour l'année comparée (non importée, ou lecture impossible) : « — » ; un mois sans affaire : 0.
        const sansCmp = P === null || sourceCmp === null || !sourceCmp.some((a) => a.dateSignature.startsWith(`${cmp.annee}-`));
        const ecartCa = sansCmp || P === null ? null : A.courant.ca - P.ca;
        const choisirCmp = (a: number, m: number): void => setComparer(`${a}-${String(m).padStart(2, '0')}`);
        const anneeEnCours = Number(jour.slice(0, 4));
        const ouvrirCarte = (): void => setCarteMoisOuverte((o) => !o);
        const lignesA = LIGNES_A.filter((l) => !l.commission || d.voirCommissions);
        // La ligne TOTAL CA HT d'abord (toujours visible), puis — dépliée — les autres indicateurs dans l'ordre du tableau.
        const ordre = [...lignesA.filter((l) => l.k === 'ca'), ...(carteMoisOuverte ? lignesA.filter((l) => l.k !== 'ca') : [])];
        return (
      <section className="tdb-section tdb-a" aria-labelledby="tdb-a" data-section="A" data-carte-mois={carteMoisOuverte ? 'ouverte' : 'repliee'}>
        {/* 🔴 Arno (24/10/2026, après 9f230251) — UNE grille, repliée ou dépliée : la ligne d'en-têtes (titre, mois comparé, colonnes)
            et la ligne TOTAL CA HT sont celles du tableau ; déplier ajoute les autres indicateurs dessous. Largeurs FIXES (`LARGEURS_A`,
            table-layout fixed) : rien ne bouge d'un mois à l'autre, ni selon les montants. */}
        <table className="tdb-table tdb-a-table" id="tdb-a-table">
          <colgroup>
            <col className="tdb-a-col-indicateur" />
            <col style={{ width: LARGEURS_A.montant }} /><col style={{ width: LARGEURS_A.montant }} />
            <col style={{ width: LARGEURS_A.ecart }} /><col style={{ width: LARGEURS_A.chevron }} />
          </colgroup>
          <tbody>
            <tr className="tdb-a-entetes" data-a-entetes>
              <th scope="col" className="tdb-a-intitule"><div className="tdb-a-intitule-corps">
                <span id="tdb-a" role="heading" aria-level={3} className="tdb-a-titre">Le mois — {libCourant}<span className="fdm-cache"> comparé à {libCmp}</span></span>
                <span className="tdb-a-compare" aria-hidden="true">comparé à</span>
                <span className="tdb-a-choix" data-a-selecteurs>
                  <ListeChoix options={NOMS_MOIS.map((m, i) => ({ id: i + 1, libelle: m.toLowerCase() }))} valeur={String(cmp.mois)} vide={null} libelle="Mois de comparaison"
                    classe="tdb-a-champ tdb-a-champ--mois" onChange={(v) => choisirCmp(cmp.annee, Number(v))} donnees={{ 'data-comparer-mois': '' }} />
                  <ListeChoix options={anneesComparables(d.annees, anneeEnCours, cmp.annee).map((a) => ({ id: a, libelle: String(a) }))} valeur={String(cmp.annee)} vide={null}
                    libelle="Année de comparaison" classe="tdb-a-champ tdb-a-champ--annee" onChange={(v) => choisirCmp(Number(v), cmp.mois)} donnees={{ 'data-comparer-annee': '' }} />
                </span>
              </div></th>
              <th scope="col">{NOMS_MOIS[mois - 1]} {annee}</th><th scope="col">{NOMS_MOIS[cmp.mois - 1]} {cmp.annee}</th><th scope="col">Écart</th>
              <td rowSpan={2} className="tdb-a-chevron-case">
                <button type="button" className="tdb-a-chevron" aria-expanded={carteMoisOuverte} aria-controls="tdb-a-table" data-carte-mois-chevron onClick={ouvrirCarte}
                  aria-label={carteMoisOuverte ? 'Replier le détail du mois' : 'Déplier le détail du mois'}><span aria-hidden="true">{carteMoisOuverte ? '▾' : '▸'}</span></button>
              </td>
            </tr>
            {ordre.map((l) => {
              const c = A.courant[l.k];
              const p = P === null ? 0 : P[l.k];
              const ids = (t: TotauxPeriode): (number | string)[] => (l.k === 'retrocessions' ? [] : t.ids.filter((i) => {
                const a = parId.get(String(i));
                if (a === undefined) return false;
                if (l.k === 'apporteurs') return a.apporteurNom !== null || a.apporteurId !== null;
                if (l.k === 'avecGestion') return a.avecGestion;
                if (l.k === 'sansGestion') return !a.avecGestion;
                if (l.k === 'primes') return primeDe(a, ctx.regles) > 0;
                return true;
              }));
              const valeur = (x: number): string => (l.k === 'nb' ? String(x) : eur(x));
              const total = l.k === 'ca';
              return (
                <tr key={l.k} className={total ? 'tdb-fort tdb-a-total' : undefined} data-ligne-a={l.k}
                  onClick={total ? (e) => { if ((e.target as Element).closest('.tdb-chiffre') === null) ouvrirCarte(); } : undefined}>
                  <th scope="row">{l.mot}</th>
                  <td data-mot={`${NOMS_MOIS[mois - 1]} ${annee}`} data-a-total={total ? 'courant' : undefined}>{chiffre(valeur(c), `${l.mot} — ${NOMS_MOIS[mois - 1]} ${annee}`, ids(A.courant), `a-${l.k}`)}</td>
                  <td data-mot={`${NOMS_MOIS[cmp.mois - 1]} ${cmp.annee}`} data-a-total={total ? 'compare' : undefined}>{P === null ? <span className="loc-muet">…</span> : sansCmp ? <span className="loc-muet">—</span> : chiffre(valeur(p), `${l.mot} — ${NOMS_MOIS[cmp.mois - 1]} ${cmp.annee}`, ids(P))}</td>
                  {total ? (
                    <td data-mot="Écart" className={`tdb-a-ecart tdb-signe tdb-signe--${ecartCa === null ? 'nul' : sensDe(ecartCa)}`} data-a-ecart={ecartCa === null ? 'nul' : sensDe(ecartCa)}>
                      {ecartCa === null ? '—' : ecartEtPct(ecartEur(ecartCa), variation(A.courant.ca, P!.ca))}</td>
                  ) : <td data-mot="Écart" className="tdb-a-ecart-ligne">{sansCmp ? '—' : ecartEtPct(l.k === 'nb' ? ecartNb(c - p) : ecartEur(c - p), variation(c, p))}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
        );
      })()}

      {vue === 'mois' && (
        <FeuilleDuMois d={d} lignes={lignes} ctx={ctx} annee={annee} mois={mois} negociateur={filtre.negociateur ?? null}
          onDetail={(titre, ids) => setDetail({ titre, ids })} onRelire={() => setN((x) => x + 1)} />
      )}

      {vue === 'annee' && <>
      {(d.historique ?? []).length > 1 && (
        <section className="tdb-section" aria-labelledby="tdb-h" data-section="H">
          <h3 id="tdb-h">Année par année <small className="loc-muet">(toutes les affaires, sans filtre — une année s’ouvre d’un clic)</small></h3>
          <CourbeAnnees lignes={d.historique ?? []} annee={annee} onAnnee={setAnnee} />
          {(() => {
            const toutes = d.historique ?? [];
            const enCours = toutes.some((h) => h.annee === anneeEnCoursH) ? anneeEnCoursH : toutes[toutes.length - 1].annee;
            const basculer = (): void => setHistoOuvert((o) => !o);
            return <>
          <div className={`tdb-h-cadre${histoOuvert ? ' tdb-h-cadre--ouvert' : ''}`} ref={cadreHisto} id="tdb-h-cadre" data-historique-cadre={histoOuvert ? 'ouvert' : 'replie'}>
          <table className="tdb-table tdb-table--mois" data-historique-annees>
            <thead><tr><th scope="col">Année</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Apporteurs</th><th scope="col">CA net</th>
              {d.voirCommissions && <th scope="col">Commission brute</th>}
              {propre !== undefined && <th scope="col">Commission brute — {propre.libelle}</th>}<th scope="col">Évolution du CA</th></tr></thead>
            <tbody>
              {toutes.map((h, i, t) => {
                if (!histoOuvert && h.annee !== enCours) return null;
                const avant = i > 0 ? t[i - 1] : null;
                const evol = avant === null || avant.ca === 0 ? null : (h.ca - avant.ca) / avant.ca;
                const courante = h.annee === enCours;
                return (
                  <tr key={h.annee} className={[h.annee === annee ? 'tdb-fort' : '', courante ? 'tdb-h-en-cours' : ''].filter(Boolean).join(' ') || undefined}
                    data-annee-historique={h.annee} data-annee-en-cours={courante ? '' : undefined}
                    tabIndex={courante ? 0 : undefined} aria-label={courante ? `${h.annee} — ${histoOuvert ? 'replier les années' : `${toutes.length} années, déplier`}` : undefined}
                    onClick={courante ? (e) => { if ((e.target as Element).closest('.tdb-chiffre') === null) basculer(); } : undefined}
                    onKeyDown={courante ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); basculer(); } } : undefined}>
                    <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => setAnnee(h.annee)} aria-current={h.annee === annee ? 'true' : undefined}>{h.annee}</button></th>
                    <td data-mot="Baux">{h.nbBaux}</td><td data-mot="CA HT">{eur(h.ca)}</td><td data-mot="Apporteurs">{eur(h.apporteurs)}</td><td data-mot="CA net">{eur(h.caNet)}</td>
                    {d.voirCommissions && <td data-mot="Commission brute">{h.commission === null ? '—' : eur(h.commission)}</td>}
                    {propre !== undefined && (() => { const x = propre.historique.find((y) => y.annee === h.annee);
                      return <td data-mot={`Commission brute — ${propre.libelle}`} data-commission-propre={h.annee}>{x === undefined ? '—' : eur(x.commission)}</td>; })()}
                    <td data-mot="Évolution du CA">{evol === null ? '—' : signe(evol)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="tdb-h-bascule">
            <button type="button" className="tdb-h-bouton" aria-expanded={histoOuvert} aria-controls="tdb-h-cadre" onClick={basculer} data-deplier-historique>
              <span className="tdb-h-mention">{toutes.length} années — {histoOuvert ? 'cliquer pour replier' : 'cliquer pour tout afficher'}</span>
              <span className="tdb-h-chevron" aria-hidden="true">{histoOuvert ? '▾' : '▸'}</span>
            </button>
          </p>
            </>;
          })()}
        </section>
      )}
      <section className="tdb-section" aria-labelledby="tdb-b" data-section="B">
        <h3 id="tdb-b">Le cumul de {annee}, mois par mois</h3>
        <CourbeCumul courant={B.slice(0, Math.max(mois, B.reduce((k, p, i) => (p.nb > 0 ? i + 1 : k), 0))).map((p) => p.caCumule)}
          n1={sansN1 ? null : B.map((p) => p.caCumuleN1)} annee={annee} moisSelectionne={mois}
          aria={`CA HT cumulé ${annee}${sansN1 ? '' : ` et ${annee - 1}`}, de janvier à décembre`} />
        <table className="tdb-table tdb-table--mois">
          <thead><tr><th scope="col">Mois</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Cumul {annee}</th><th scope="col">Cumul {annee - 1}</th></tr></thead>
          <tbody>
            {B.filter((p, i) => i < mois || p.nb > 0).map((p) => (
              <tr key={p.mois} className={p.mois === moisFinGestion ? 'tdb-fort' : undefined}>
                <th scope="row">{NOMS_MOIS[Number(p.mois.slice(5)) - 1]}</th>
                <td data-mot="Baux">{chiffre(String(p.nb), `Baux — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${annee}`, p.ids)}</td>
                <td data-mot="CA HT">{chiffre(eur(p.ca), `CA HT — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${annee}`, p.ids)}</td>
                <td data-mot={`Cumul ${annee}`}>{eur(p.caCumule)}</td>
                <td data-mot={`Cumul ${annee - 1}`}>{sansN1 ? '—' : eur(p.caCumuleN1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="tdb-portee" role="group" aria-label="Période des sections suivantes">
        <span className="loc-muet">Apporteurs, indicateurs{d.voirCommissions ? ', négociateurs' : ''} :</span>
        {(['mois', 'annee'] as const).map((p) => (
          <button key={p} type="button" className="tdb-pilule" aria-pressed={portee === p} onClick={() => setPortee(p)} data-portee={p}>
            {p === 'mois' ? `${NOMS_MOIS[mois - 1]} ${annee}` : `Année ${annee}`}</button>
        ))}
      </div>

      <section className="tdb-section" aria-labelledby="tdb-c" data-section="C">
        <h3 id="tdb-c">Les apporteurs — {libellePeriode}</h3>
        {C.length === 0 ? <p className="loc-muet">Aucun bail apporté sur la période.</p> : (
          <table className="tdb-table tdb-table--large">
            <thead><tr><th scope="col">Apporteur</th><th scope="col">Baux</th><th scope="col">CA apporté HT</th><th scope="col">Commissions</th><th scope="col">Reste à l’agence</th><th scope="col">Coût pour 1 € de CA</th></tr></thead>
            <tbody>
              {C.map((l) => (
                <tr key={`${l.apporteurId ?? l.nom}`} data-apporteur-ligne={l.apporteurId ?? l.nom}>
                  <th scope="row">{l.nom}{l.type && <small className="loc-muet"> · {l.type}</small>}</th>
                  <td data-mot="Baux">{chiffre(String(l.nb), `Baux apportés — ${l.nom}`, l.ids)}</td>
                  <td data-mot="CA apporté HT">{chiffre(eur(l.ca), `CA apporté — ${l.nom}`, l.ids)}</td>
                  <td data-mot="Commissions">{eur(l.commissions)}</td>
                  <td data-mot="Reste à l’agence">{eur(l.net)}</td>
                  <td data-mot="Coût pour 1 € de CA">{l.coutParEuro === null ? '—' : `${l.coutParEuro.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tdb-section" aria-labelledby="tdb-d" data-section="D">
        <h3 id="tdb-d">La gestion récurrente — 12 mois</h3>
        {!d.gestion.disponible ? <p className="loc-muet">Le statut du bien (migration 403) n’est pas encore en base.</p> : (
          <>
            <p className="tdb-ligne-chiffres">
              <span>Entrées : <strong>{Dm.entrees}</strong></span><span>Sorties : <strong>{Dm.sorties}</strong></span>
              <span>Solde : <strong>{Dm.solde >= 0 ? '+' : '−'}{Math.abs(Dm.solde)}</strong></span><span>Portefeuille : <strong>{Dm.stock}</strong> biens</span>
            </p>
            <CourbeGestion points={D} onMois={(p) => setDetail({ titre: `Gestion — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1].toLowerCase()} ${p.mois.slice(0, 4)}`, lots: [{ titre: 'Entrés en gestion', ids: p.lotsEntres }, { titre: 'Sortis de la gestion', ids: p.lotsSortis }] })} />
          </>
        )}
        <GestionRecurrenteAnnees annees={gestionRecurrenteParAnnee(d.recurrents ?? [], d.apporteurs, d.aujourdhui ?? aujourdhuiParis())} />
      </section>

      <section className="tdb-section" aria-labelledby="tdb-e" data-section="E">
        <h3 id="tdb-e">Indicateurs — {libellePeriode}</h3>
        <ul className="tdb-indicateurs">
          <li><span className="tdb-tuile-mot">Vacance moyenne avant l’entrée</span>
            {chiffre(E.vacanceMoyenneJours === null ? '—' : `${Math.round(E.vacanceMoyenneJours)} j`, 'Baux dont la vacance est connue', E.vacanceIds, 'vacance')}
            <small className="loc-muet">{E.vacanceIds.length} bail(aux) dont la sortie précédente est connue</small></li>
          <li><span className="tdb-tuile-mot">Préavis reçus</span><strong className="tdb-indic">{E.preavis}</strong>
            <small className="loc-muet">{portee === 'mois' ? 'dans le mois' : 'dans l’année'}</small></li>
          <li><span className="tdb-tuile-mot">Part GLI / Visale</span>
            {chiffre(pct(E.partGaranties), 'Baux avec GLI ou Visale', E.garantiesIds, 'garanties')}
            <small className="loc-muet">parmi {E.assuranceConnue} bail(aux) renseigné(s)</small></li>
          <li><span className="tdb-tuile-mot">Part des parkings</span>
            {chiffre(pct(E.partParkingNb), 'Parkings et box', E.parkingIds, 'parkings')}
            <small className="loc-muet">{pct(E.partParkingCa)} du CA</small></li>
        </ul>
      </section>

      {(d.voirCommissions || propre !== undefined) && (
        <section className="tdb-section" aria-labelledby="tdb-f" data-section="F">
          <h3 id="tdb-f">{propre !== undefined ? `Négociateur — ${propre.libelle}` : 'Les négociateurs'} — {libellePeriode}</h3>
          <p className="loc-muet tdb-note">Commission brute = taux × (CA HT − commissions des apporteurs) + primes de nouvelle gestion − rétrocessions — la formule du suivi mensuel.</p>
          {F.length === 0 ? <p className="loc-muet">Aucune activité sur la période.</p> : (
            <table className="tdb-table tdb-table--large">
              <thead><tr><th scope="col">Négociateur</th><th scope="col">Mois</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Apporteurs</th><th scope="col">CA − apporteurs</th><th scope="col">Primes</th><th scope="col">Rétrocessions</th><th scope="col">Commission brute</th></tr></thead>
              <tbody>
                {F.map((l) => (
                  <tr key={`${l.cle}-${l.mois}`} data-negociateur-ligne={`${l.libelle}|${l.mois}`}>
                    <th scope="row">{l.libelle}</th>
                    <td data-mot="Mois">{NOMS_MOIS[Number(l.mois.slice(5)) - 1]}</td>
                    <td data-mot="Baux">{chiffre(String(l.totaux.nb), `${l.libelle} — ${NOMS_MOIS[Number(l.mois.slice(5)) - 1]} ${annee}`, l.totaux.ids)}</td>
                    <td data-mot="CA HT">{eur(l.totaux.ca)}</td>
                    <td data-mot="Apporteurs">{eur(l.totaux.apporteurs)}</td>
                    <td data-mot="CA − apporteurs">{eur(l.totaux.caNet)}</td>
                    <td data-mot="Primes">{eur(l.totaux.primes)}</td>
                    <td data-mot="Rétrocessions">{eur(l.totaux.retrocessions)}</td>
                    <td data-mot="Commission brute" className="tdb-fort">{eur(l.totaux.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="tdb-section tdb-export" aria-labelledby="tdb-g" data-section="G">
        <h3 id="tdb-g">Export</h3>
        <p className="loc-muet">Le suivi {annee}, un onglet par mois, avec les filtres ci-dessus : la mise en page du suivi mensuel (totaux et ventilation en formules).</p>
        <a className="svv-btn svv-btn-outline gst-btn tdb-bouton-export" href={exportHref} download data-export>Exporter en .xlsx</a>
      </section>
      </>}

      {detail !== null && <ListeDetail detail={detail} parId={parId} ctx={ctx} voirCommissions={d.voirCommissions} onFermer={() => setDetail(null)} />}
    </div>
  );
}

/** La liste des baux (ou des biens) derrière un chiffre. */
function ListeDetail({ detail, parId, ctx, voirCommissions, onFermer }: {
  detail: NonNullable<Detail>; parId: Map<string, ActiviteLue>; ctx: ContexteCalcul; voirCommissions: boolean; onFermer: () => void;
}) {
  const lignes = (detail.ids ?? []).map((i) => parId.get(String(i))).filter((x): x is ActiviteLue => x !== undefined);
  const total = lignes.reduce((s, a) => s + caLigne(a), 0);
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={detail.titre} data-detail>
        <header className="tdb-fenetre-tete">
          <h3>{detail.titre}</h3>
          <button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer} autoFocus>×</button>
        </header>
        <div className="tdb-fenetre-corps">
          {detail.lots !== undefined ? detail.lots.map((g) => (
            <div key={g.titre}>
              <h4>{g.titre} ({g.ids.length})</h4>
              {g.ids.length === 0 ? <p className="loc-muet">Aucun.</p> : (
                <ul className="tdb-lots">{g.ids.map((id) => <li key={id}><a href={`/admin/location/bien/${id}`}>Bien n° {id}</a></li>)}</ul>
              )}
            </div>
          )) : (
            <>
              <p className="loc-muet">{lignes.length} ligne(s) · CA HT {eur(total)}</p>
              <ul className="tdb-baux">
                {lignes.map((a) => (
                  <li key={String(a.id)} data-ligne-detail={String(a.id)}>
                    <p className="tdb-bail-titre"><strong>{a.libelleProprietaire || '—'}</strong> → {a.libelleLocataire || '—'}
                      <span className="loc-pastille">{LIBELLE_TYPE_ACTIVITE[a.type]}</span>
                      {a.rattachement !== 'rattache' && <span className="loc-pastille" title="Ligne reprise du suivi mensuel, sans bail de l’outil">{a.rattachement === 'douteux' ? 'rapprochement douteux' : 'historique non rattaché'}</span>}</p>
                    <p className="tdb-bail-chiffres">
                      <span>{dateFr(a.dateSignature)}{a.dateSupposee ? ' (supposée)' : ''}</span>
                      <span>Propriétaire {eur(a.honoProprietaireHt)}</span><span>Locataire {eur(a.honoLocataireHt)}</span><span><strong>CA {eur(caLigne(a))}</strong></span>
                      {a.apporteurNom && <span>Apporteur {a.apporteurNom} ({eur(commissionApporteurDe(a, ctx.apporteurs))})</span>}
                      {voirCommissions && primeDe(a, ctx.regles) > 0 && <span>Prime {eur(primeDe(a, ctx.regles))}</span>}
                      <span>{a.avecGestion ? 'avec gestion' : 'sans gestion'}</span>
                      {a.negociateurLibelle && <span>{a.negociateurLibelle}</span>}
                    </p>
                    {a.lotId !== null && <a className="tdb-lien" href={`/admin/location/bien/${a.lotId}`}>Ouvrir la fiche du bien</a>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * B — le CA cumulé de l'année (trait plein) et de N−1 (pointillé), 12 mois. 🔴 Arno (25/10/2026) — le MÊME composant trace le mode
 * « Cumul » de « Mois par mois » (CA, baux, solde de gestions) : `courant` = les valeurs cumulées de janvier au dernier mois tracé,
 * `n1` = les 12 de l'année précédente (null : non importée) ; `entier` : axe en nombres entiers (négatifs permis : un solde de gestions) ;
 * `bulle` : chaque mois se survole et s'ouvre, le détail s'écrit À DROITE (comme l'histogramme). Sans `bulle` : la courbe d'avant, telle quelle.
 */
function CourbeCumul({ courant, n1, annee, moisSelectionne, aria, entier = false, bulle, onChoisir }: {
  courant: readonly number[]; n1: readonly number[] | null; annee: number; moisSelectionne: number; aria: string; entier?: boolean;
  bulle?: (mois: number) => InfoBarre; onChoisir?: (mois: number) => void;
}) {
  const L = 640; const H = 220; const m = { g: 56, d: 12, h: 12, b: 28 };
  const [survol, setSurvol] = useState<number | null>(null);
  const valeurs = [...courant, ...(n1 ?? [])];
  const haut = Math.max(1, ...valeurs);
  const bas = Math.min(0, ...valeurs);
  const pasEntier = Math.max(1, Math.ceil((haut - bas) / 4));
  const min = entier ? Math.floor(bas / pasEntier) * pasEntier : bas;
  const max = entier ? min + pasEntier * 4 : haut;
  const x = (i: number): number => m.g + (i * (L - m.g - m.d)) / 11;
  const y = (v: number): number => H - m.b - ((v - min) * (H - m.h - m.b)) / (max - min);
  const trace = (vals: readonly number[]): string => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const etiquette = (v: number): string => (entier ? Math.round(v).toLocaleString('fr-FR') : eurRond(v));
  const pas = (L - m.g - m.d) / 11;
  const dessin = (
    <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={aria}>
      {graduations.map((g) => (
        <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
          <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{etiquette(g)}</text></g>
      ))}
      {COURT.map((c, i) => <text key={c} x={x(i)} y={H - 8} textAnchor="middle" className="tdb-axe">{c}</text>)}
      {n1 !== null && <path d={trace(n1)} className="tdb-trait-n1" data-trait-cumul="n1" />}
      {courant.length > 0 && <path d={trace(courant)} className="tdb-trait" data-trait-cumul="courant" />}
      {courant.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === moisSelectionne - 1 ? 5 : 3} className="tdb-point" data-point-cumul={i + 1} data-valeur={v} />)}
      {bulle !== undefined && COURT.map((c, i) => (
        <rect key={`z-${c}`} x={x(i) - pas / 2} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-barre-zone tdb-zone-cumul" data-mois-cumul={i + 1}
          onMouseEnter={() => setSurvol(i + 1)} onClick={() => onChoisir?.(i + 1)} />
      ))}
    </svg>
  );
  const legende = <><span className="tdb-legende tdb-legende--courant" /> {annee}{n1 !== null && <> · <span className="tdb-legende tdb-legende--n1" /> {annee - 1}</>}</>;
  if (bulle === undefined) {
    return (
      <figure className="tdb-courbe" data-courbe="cumul">
        {dessin}
        <figcaption className="loc-muet">{legende}</figcaption>
      </figure>
    );
  }
  const detail = bulle(survol ?? moisSelectionne);
  return (
    <figure className="tdb-courbe tdb-histo" data-courbe="mois-cumul">
      <div className="tdb-histo-rangee" data-histo-rangee>
        <div className="tdb-histo-graphe"><div className="tdb-histo-zone" onMouseLeave={() => setSurvol(null)}>{dessin}</div></div>
        <div className="tdb-histo-detail" data-histo-detail aria-live="polite"><BulleBarre info={detail} sous /></div>
        <figcaption className="loc-muet tdb-histo-legende">{legende}</figcaption>
      </div>
    </figure>
  );
}

/** 🔴 Arno (25/10/2026) — le dernier mois tracé d'un cumul : le mois courant pour l'année en cours, 12 pour une année passée, 0 à venir. PUR. */
export function moisDeLaCourbe(annee: number, jour: string): number {
  const a = Number(jour.slice(0, 4));
  return annee < a ? 12 : annee > a ? 0 : Number(jour.slice(5, 7));
}

/**
 * L'HISTOGRAMME du suivi (Arno, 23/10/2026) — une barre par période (année du Suivi annuel, mois du Suivi du mois) ; la période
 * affichée en rouge, les autres en gris ; à côté, une barre claire hachurée pour N−1 quand elle existe ; une période sans valeur
 * (un mois à venir) n'a PAS de barre. Au survol, le BLOC DE DÉTAIL se met à jour (la période ; en rouge l'année affichée ; en gris N−1 ;
 * l'écart en pied) ; un clic (ou un toucher) ouvre la période. Arno (23/10/2026) : le DÉTAIL s'écrit À DROITE du graphique, dans la
 * même carte, centré verticalement sur le graphique (largeur fixe ; le graphique prend le reste) — la période choisie, ou la barre
 * survolée ; au téléphone, sous le graphique, pleine largeur. La bulle flottante du survol est RETIRÉE (accord d'Arno du 23/10/2026 :
 * elle faisait doublon avec ce bloc).
 */
interface ChiffresBulle { libelle: string; ca: number | null; nb: number | null }
export interface InfoBarre { titre: string; courant: ChiffresBulle; precedent: ChiffresBulle | null;
  /** Arno (23/10/2026) — une mesure en NOMBRE (« Baux signés », « Nouvelles gestions ») : `ca` porte alors ce nombre ; absent : le CA HT. */
  compte?: string }
interface Barre { cle: number; libelle: string; valeur: number | null; n1?: number | null; info: InfoBarre }

/** Le sens d'un nombre, pour sa couleur : positif (vert), négatif (rouge), nul (gris). PUR. */
export const sensDe = (x: number): 'positif' | 'negatif' | 'nul' => (x > 0 ? 'positif' : x < 0 ? 'negatif' : 'nul');

/** La bulle d'une barre : l'en-tête, l'année affichée (rouge), N−1 (gris), l'écart (coloré par son signe) — ou « N−1 non importée ». */
/**
 * 🔴 Arno (25/10/2026) — LA COMMISSION RÉCURRENTE SUR LA GESTION, TOUS BIENS, ANNÉE PAR ANNÉE : honoraires de gestion perçus HT et
 * commissions à reverser HT, par apporteur et au total (sans filtre : toutes les affaires « Récurrent »). Recalculé à chaque lecture.
 */
export function GestionRecurrenteAnnees({ annees }: { annees: readonly AnneeGestionRecurrente[] }) {
  if (annees.length === 0) return null;
  const avecCollegue = annees.some((a) => a.total.collegue !== 0);
  const eu = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return (
    <div data-gestion-recurrente-annees>
      <h4 className="tdb-h4">Commission récurrente sur la gestion — année par année <small className="loc-muet">(tous biens)</small></h4>
      <table className="tdb-table tdb-table--large">
        <thead><tr><th scope="col">Année · apporteur</th><th scope="col">Honoraires de gestion perçus HT</th><th scope="col">Commissions à reverser HT</th>
          {avecCollegue && <th scope="col">dont collègue HT</th>}</tr></thead>
        <tbody>
          {annees.flatMap((a) => [
            ...a.lignes.map((l) => (
              <tr key={`${a.annee}-${l.apporteurId}`} data-gestion-annee={a.annee} data-gestion-apporteur={l.apporteurId}>
                <th scope="row">{a.annee} · {l.nom}</th>
                <td data-mot="Honoraires de gestion perçus HT">{eu(l.honoraires)}</td>
                <td data-mot="Commissions à reverser HT">{eu(l.commission + l.collegue)}</td>
                {avecCollegue && <td data-mot="dont collègue HT">{eu(l.collegue)}</td>}
              </tr>
            )),
            <tr key={`${a.annee}-total`} className="tdb-fort" data-gestion-total={a.annee}>
              <th scope="row">Total {a.annee}</th>
              <td data-mot="Honoraires de gestion perçus HT">{eu(a.total.honoraires)}</td>
              <td data-mot="Commissions à reverser HT">{eu(a.total.commission + a.total.collegue)}</td>
              {avecCollegue && <td data-mot="dont collègue HT">{eu(a.total.collegue)}</td>}
            </tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}

export function BulleBarre({ info, sous = false }: { info: InfoBarre; sous?: boolean }) {
  if (info.compte !== undefined) return <BulleCompte info={info} sous={sous} />;
  const { courant: c, precedent: p } = info;
  const ecart = c.ca !== null && p !== null && p.ca !== null ? c.ca - p.ca : null;
  const bloc = (x: ChiffresBulle, sorte: 'courant' | 'n1') => (
    <div className={`tdb-bulle-bloc tdb-bulle-bloc--${sorte}`} data-bulle-bloc={sorte}>
      <p className="tdb-bulle-annee">{x.libelle}</p>
      {x.ca === null ? <p className="tdb-bulle-ligne"><span>À venir</span></p> : (
        <>
          <p className="tdb-bulle-ligne"><span>CA HT</span><span className="tdb-bulle-montant">{eur(x.ca)}</span></p>
          <p className="tdb-bulle-ligne"><span>Baux</span><span className="tdb-bulle-montant">{x.nb}</span></p>
        </>
      )}
    </div>
  );
  return (
    <div className={sous ? 'tdb-bulle tdb-bulle--sous' : 'tdb-bulle'} data-bulle={sous ? 'sous' : 'survol'}>
      <p className="tdb-bulle-titre">{info.titre}</p>
      {bloc(c, 'courant')}
      {p !== null && bloc(p, 'n1')}
      <p className="tdb-bulle-pied" data-bulle-pied>{p === null ? 'N−1 non importée'
        : ecart === null ? 'Écart : —' : <><span>Écart</span>
          {/* Arno (23/10/2026) : l'écart positif en vert, négatif en rouge, nul en gris (montant et pourcentage) ; « Écart » reste neutre. */}
          <span className={`tdb-bulle-montant tdb-signe tdb-signe--${sensDe(ecart)}`} data-ecart={sensDe(ecart)}>{ecartEur(ecart)} ({signe(variation(c.ca as number, p.ca as number))})</span></>}</p>
    </div>
  );
}

/**
 * Arno (23/10/2026) — LA TUILE « BIENS EN GESTION » : les nouveaux mandats de la période en VERT (« +N »), les sortis en ROUGE
 * (« −N »), et le SOLDE (nouveaux − sortis) en gros sur la place restante : vert s'il est positif, rouge s'il est négatif, gris s'il
 * est nul. Aucun calcul ne change : ce sont les mêmes comptes, colorés.
 */
export function MouvementsGestion({ periode, nouveaux, sortis }: { periode: string; nouveaux: number; sortis: number }) {
  const solde = nouveaux - sortis;
  return (
    <span className="tdb-gestion" data-gestion-mouvements>
      {/* 🔴 Arno (25/10/2026) — le SOLDE d'abord (en grand), puis la petite ligne de la période (« Sept. 2026 : +1 −0 ») ; tout centré. */}
      <span className="tdb-gestion-solde"><span className="tdb-gestion-solde-mot">Solde</span>
        <strong className={`tdb-gestion-solde-valeur tdb-signe tdb-signe--${sensDe(solde)}`} data-gestion-solde={sensDe(solde)}>
          {solde > 0 ? '+' : solde < 0 ? '−' : ''}{Math.abs(solde)}</strong></span>
      <span className="tdb-gestion-comptes"><span className="tdb-gestion-periode">{periode} :</span>
        <span className="tdb-signe tdb-signe--positif" data-gestion-nouveaux>+{nouveaux}</span>
        <span className="tdb-signe tdb-signe--negatif" data-gestion-sortis>−{sortis}</span></span>
    </span>
  );
}

/**
 * Arno (23/10/2026) — « Année par année » DÉFILE quand les années ne tiennent plus : la largeur d'une année est FIXE (celle d'aujourd'hui,
 * avec 8 années : (640 − 56 − 12) / 8 unités du dessin) — on n'écrase jamais les barres. Tant que tout tient, rien ne change.
 */
export const PAS_ANNEE_FIXE = (640 - 56 - 12) / 8;
/** Le graphique défile-t-il ? Oui dès que les barres, à leur largeur fixe, dépassent le dessin. PUR. */
export const histogrammeDefile = (nbBarres: number, pasFixe: number | undefined): boolean => pasFixe !== undefined && 56 + 12 + nbBarres * pasFixe > 640 + 1e-9;

/** Le bloc de détail d'une mesure en NOMBRE : N (rouge), N−1 (gris), l'écart en nombre et en %, coloré par son signe. */
function BulleCompte({ info, sous }: { info: InfoBarre; sous: boolean }) {
  const { courant: c, precedent: p } = info;
  const mot = info.compte as string;
  const ecart = c.ca !== null && p !== null && p.ca !== null ? c.ca - p.ca : null;
  const bloc = (x: ChiffresBulle, sorte: 'courant' | 'n1') => (
    <div className={`tdb-bulle-bloc tdb-bulle-bloc--${sorte}`} data-bulle-bloc={sorte}>
      <p className="tdb-bulle-annee">{x.libelle}</p>
      {x.ca === null ? <p className="tdb-bulle-ligne"><span>À venir</span></p>
        : <p className="tdb-bulle-ligne"><span>{mot}</span><span className="tdb-bulle-montant">{x.ca}</span></p>}
    </div>
  );
  return (
    <div className={sous ? 'tdb-bulle tdb-bulle--sous' : 'tdb-bulle'} data-bulle={sous ? 'sous' : 'survol'} data-bulle-compte>
      <p className="tdb-bulle-titre">{info.titre}</p>
      {bloc(c, 'courant')}
      {p !== null && bloc(p, 'n1')}
      <p className="tdb-bulle-pied" data-bulle-pied>{p === null ? 'N−1 non importée'
        : ecart === null ? 'Écart : —' : <><span>Écart</span>
          <span className={`tdb-bulle-montant tdb-signe tdb-signe--${sensDe(ecart)}`} data-ecart={sensDe(ecart)}>
            {ecart > 0 ? '+' : ecart < 0 ? '−' : ''}{Math.abs(ecart)} ({signe(variation(c.ca as number, p.ca as number))})</span></>}</p>
    </div>
  );
}

export function Histogramme({ barres, courante, onChoisir, attribut, legende, aria, pasFixe, entier = false }: {
  barres: readonly Barre[]; courante: number; onChoisir: (cle: number) => void; attribut: string; legende?: { courant: string; n1: string | null }; aria: string;
  /** La largeur FIXE d'une barre (unités du dessin) : au-delà de ce qui tient, le graphique défile (« Année par année »). */
  pasFixe?: number;
  /** Arno (23/10/2026) — une mesure en NOMBRE (baux, gestions) : axe en nombres entiers, graduations entières. */
  entier?: boolean;
}) {
  const L = 640; const H = 220; const m = { g: 56, d: 12, h: 18, b: 28 };
  const [survol, setSurvol] = useState<number | null>(null);
  const avecN1 = barres.some((b) => b.n1 !== undefined && b.n1 !== null);
  // L'échelle est calculée sur TOUTES les barres, défilement ou non.
  const plusHaut = Math.max(1, ...barres.map((b) => Math.max(b.valeur ?? 0, avecN1 ? b.n1 ?? 0 : 0)));
  // Un nombre : quatre pas ENTIERS (0, 1, 2… jamais 0,75 bail) ; un montant : l'échelle d'avant.
  const pasEntier = Math.max(1, Math.ceil(plusHaut / 4));
  const max = entier ? pasEntier * 4 : plusHaut;
  const etiquette = (v: number): string => (entier ? Math.round(v).toLocaleString('fr-FR') : eurRond(v));
  const defile = histogrammeDefile(barres.length, pasFixe);
  const pas = defile ? (pasFixe as number) : (L - m.g - m.d) / barres.length;
  /* ── LE DÉFILEMENT (Arno, 23/10/2026) : glisser à la souris, molette / pavé horizontal et doigt (natifs), flèches ‹ ›, clavier. */
  const piste = useRef<HTMLDivElement | null>(null);
  const [bords, setBords] = useState({ g: false, d: false });
  const mesurer = useCallback((): void => {
    const el = piste.current;
    if (el === null) return;
    setBords({ g: el.scrollLeft > 1, d: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);
  const allerA = useCallback((gauche: number): void => {
    const el = piste.current;
    if (el === null) return;
    const x = Math.max(0, Math.min(gauche, el.scrollWidth - el.clientWidth));
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: x }); else el.scrollLeft = x;
    mesurer();
  }, [mesurer]);
  const iCourante = barres.findIndex((b) => b.cle === courante);
  const largeurDessin = barres.length * pas + m.d;
  // À l'ouverture, et chaque fois que la période choisie change (filtre, tableau, barre) : le graphique se pose sur elle.
  useEffect(() => {
    if (!defile || piste.current === null || iCourante < 0) return;
    const el = piste.current;
    allerA(((iCourante * pas + pas / 2) / largeurDessin) * el.scrollWidth - el.clientWidth / 2);
  }, [defile, iCourante, pas, largeurDessin, allerA]);
  useEffect(() => {
    if (!defile) return undefined;
    const surTaille = (): void => mesurer();
    window.addEventListener('resize', surTaille);
    return () => window.removeEventListener('resize', surTaille);
  }, [defile, mesurer]);
  const tire = useRef<{ x: number; depart: number; bouge: boolean } | null>(null);
  const [enTirage, setEnTirage] = useState(false);
  const commencerTirage = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || piste.current === null) return;
    tire.current = { x: e.clientX, depart: piste.current.scrollLeft, bouge: false };
    const bouger = (ev: PointerEvent): void => {
      const t = tire.current; const el = piste.current;
      if (t === null || el === null) return;
      if (Math.abs(ev.clientX - t.x) > 4) { t.bouge = true; setEnTirage(true); }
      if (t.bouge) { el.scrollLeft = t.depart - (ev.clientX - t.x); mesurer(); }
    };
    const lacher = (): void => {
      window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher);
      setEnTirage(false);
      // Le clic qui suit un glisser n'ouvre pas la barre sous la souris.
      setTimeout(() => { tire.current = null; }, 0);
    };
    window.addEventListener('pointermove', bouger); window.addEventListener('pointerup', lacher);
  };
  const pasPx = (): number => (piste.current === null ? 0 : piste.current.scrollWidth / Math.max(1, barres.length));
  const y = (v: number): number => H - m.b - (v * (H - m.h - m.b)) / max;
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const largeur = pas * (avecN1 ? 0.36 : 0.64);
  const choisie = barres.find((b) => b.cle === courante);
  const iSurvol = survol === null ? -1 : barres.findIndex((b) => b.cle === survol);
  // Arno (23/10/2026) — le détail À DROITE du graphique : la période choisie par défaut, la barre survolée tant qu'on la survole.
  const detail = iSurvol >= 0 ? barres[iSurvol] : choisie;
  if (defile) {
    // Le dessin des barres commence à 0 : l'axe des montants est dessiné À PART, fixe à gauche, à la même échelle.
    const yD = y;
    return (
      <figure className="tdb-courbe tdb-histo" data-courbe={attribut.replace(/^data-barre-/, '')} data-histo-defile="oui">
        <div className="tdb-histo-rangee" data-histo-rangee>
        <div className="tdb-histo-graphe">
          <div className="tdb-histo-defile" style={{ gridTemplateColumns: `${(m.g / L) * 100}% minmax(0,1fr)` }}>
            <svg className="tdb-histo-axe" viewBox={`0 0 ${m.g} ${H}`} aria-hidden="true" data-histo-axe>
              {graduations.map((g) => <text key={g} x={m.g - 6} y={yD(g) + 4} textAnchor="end" className="tdb-axe">{etiquette(g)}</text>)}
            </svg>
            <div className="tdb-histo-cadre">
              <button type="button" className="tdb-fleche-histo tdb-fleche-histo--g" aria-label="Années précédentes" disabled={!bords.g} data-histo-fleche="g"
                onClick={() => allerA((piste.current?.scrollLeft ?? 0) - pasPx() * 3)}>‹</button>
              <div className={`tdb-histo-piste${enTirage ? ' tdb-histo-piste--tire' : ''}`} ref={piste} tabIndex={0} role="group" data-histo-piste
                aria-label={`${aria} — faire défiler avec les flèches`} onScroll={mesurer} onPointerDown={commencerTirage}
                onClickCapture={(e) => { if (tire.current?.bouge) { e.stopPropagation(); e.preventDefault(); } }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); allerA((piste.current?.scrollLeft ?? 0) + (e.key === 'ArrowLeft' ? -1 : 1) * pasPx()); }
                }}>
                <div className="tdb-histo-zone" style={{ width: `${(largeurDessin / (L - m.g)) * 100}%` }} onMouseLeave={() => setSurvol(null)}>
                  <svg viewBox={`0 0 ${largeurDessin} ${H}`} role="img" aria-label={aria}>
                    <defs><pattern id={`hachures-${attribut}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" className="tdb-barre-n1-fond" /><line x1="0" y1="0" x2="0" y2="6" className="tdb-barre-n1-trait" /></pattern></defs>
                    {graduations.map((g) => <line key={g} x1={0} x2={largeurDessin - m.d} y1={yD(g)} y2={yD(g)} className="tdb-grille" />)}
                    {barres.map((b, i) => {
                      const x0 = i * pas + pas * (avecN1 ? 0.12 : 0.18);
                      return (
                        <g key={b.cle} className="tdb-barre-annee" onClick={() => onChoisir(b.cle)} onMouseEnter={() => setSurvol(b.cle)} {...{ [attribut]: b.cle }}>
                          <rect x={i * pas} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-barre-zone" />
                          {avecN1 && b.n1 !== undefined && b.n1 !== null && (
                            <rect x={x0 + largeur} y={yD(b.n1)} width={largeur} height={Math.max(0, H - m.b - yD(b.n1))} fill={`url(#hachures-${attribut})`} className="tdb-barre-n1" data-barre-n1={b.cle} />
                          )}
                          {b.valeur !== null && <rect x={x0} y={yD(b.valeur)} width={largeur} height={Math.max(0, H - m.b - yD(b.valeur))}
                            className={b.cle === courante ? 'tdb-barre tdb-barre--courante' : 'tdb-barre'} data-valeur={b.valeur} />}
                          <text x={i * pas + pas / 2} y={H - 8} textAnchor="middle" className="tdb-axe">{b.libelle}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
              <button type="button" className="tdb-fleche-histo tdb-fleche-histo--d" aria-label="Années suivantes" disabled={!bords.d} data-histo-fleche="d"
                onClick={() => allerA((piste.current?.scrollLeft ?? 0) + pasPx() * 3)}>›</button>
            </div>
          </div>
        </div>
        {detail && <div className="tdb-histo-detail" data-histo-detail aria-live="polite"><BulleBarre info={detail.info} sous /></div>}
        {legende && <figcaption className="loc-muet tdb-histo-legende"><span className="tdb-legende tdb-legende--barre" /> {legende.courant}
          {legende.n1 !== null && <> · <span className="tdb-legende tdb-legende--barre-n1" /> {legende.n1}</>}</figcaption>}
        </div>
      </figure>
    );
  }
  return (
    <figure className="tdb-courbe tdb-histo" data-courbe={attribut.replace(/^data-barre-/, '')}>
      <div className="tdb-histo-rangee" data-histo-rangee>
      <div className="tdb-histo-graphe">
      <div className="tdb-histo-zone" onMouseLeave={() => setSurvol(null)}>
        <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={aria}>
          <defs><pattern id={`hachures-${attribut}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="tdb-barre-n1-fond" /><line x1="0" y1="0" x2="0" y2="6" className="tdb-barre-n1-trait" /></pattern></defs>
          {graduations.map((g) => (
            <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
              <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{etiquette(g)}</text></g>
          ))}
          {barres.map((b, i) => {
            const x0 = m.g + i * pas + pas * (avecN1 ? 0.12 : 0.18);
            return (
              <g key={b.cle} className="tdb-barre-annee" onClick={() => onChoisir(b.cle)} onMouseEnter={() => setSurvol(b.cle)} {...{ [attribut]: b.cle }}>
                <rect x={m.g + i * pas} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-barre-zone" />
                {avecN1 && b.n1 !== undefined && b.n1 !== null && (
                  <rect x={x0 + largeur} y={y(b.n1)} width={largeur} height={Math.max(0, H - m.b - y(b.n1))} fill={`url(#hachures-${attribut})`} className="tdb-barre-n1" data-barre-n1={b.cle} />
                )}
                {b.valeur !== null && <rect x={x0} y={y(b.valeur)} width={largeur} height={Math.max(0, H - m.b - y(b.valeur))}
                  className={b.cle === courante ? 'tdb-barre tdb-barre--courante' : 'tdb-barre'} data-valeur={b.valeur} />}
                <text x={m.g + i * pas + pas / 2} y={H - 8} textAnchor="middle" className="tdb-axe">{b.libelle}</text>
              </g>
            );
          })}
        </svg>
      </div>
      </div>
      {detail && <div className="tdb-histo-detail" data-histo-detail aria-live="polite"><BulleBarre info={detail.info} sous /></div>}
      {legende && <figcaption className="loc-muet tdb-histo-legende"><span className="tdb-legende tdb-legende--barre" /> {legende.courant}
        {legende.n1 !== null && <> · <span className="tdb-legende tdb-legende--barre-n1" /> {legende.n1}</>}</figcaption>}
      </div>
    </figure>
  );
}

/** H — le CA HT de chaque année d'activité (barres) ; l'année affichée est en couleur ; une barre ouvre son année. */
export function CourbeAnnees({ lignes, annee, onAnnee }: { lignes: readonly AnneeHistorique[]; annee: number; onAnnee: (a: number) => void }) {
  // Arno (23/10/2026) : une largeur d'année FIXE — chaque nouvelle année ajoute une barre, et le graphique défile quand elles ne tiennent plus.
  return <Histogramme attribut="data-barre-annee" courante={annee} onChoisir={onAnnee} pasFixe={PAS_ANNEE_FIXE} aria={`CA HT par année, de ${lignes[0]?.annee} à ${lignes.at(-1)?.annee}`}
    barres={lignes.map((l, i) => {
      const p = i > 0 && lignes[i - 1].annee === l.annee - 1 ? lignes[i - 1] : null;
      return { cle: l.annee, libelle: String(l.annee), valeur: l.ca, info: { titre: `Année ${l.annee}`, courant: { libelle: String(l.annee), ca: l.ca, nb: l.nbBaux },
        precedent: p === null ? null : { libelle: String(p.annee), ca: p.ca, nb: p.nbBaux } } };
    })} />;
}

/** D — le portefeuille en gestion (trait) et les entrées / sorties de chaque mois (barres), 12 mois ; un mois s'ouvre. */
function CourbeGestion({ points, onMois }: { points: ReturnType<typeof sectionGestion>; onMois: (p: ReturnType<typeof sectionGestion>[number]) => void }) {
  const L = 640; const H = 220; const m = { g: 40, d: 40, h: 26, b: 28 };
  const maxStock = Math.max(1, ...points.map((p) => p.stock));
  const minStock = Math.min(...points.map((p) => p.stock));
  const bas = Math.max(0, minStock - Math.ceil((maxStock - minStock) * 0.2) - 1);
  const maxMvt = Math.max(1, ...points.map((p) => Math.max(p.entrees, p.sorties)));
  const pas = (L - m.g - m.d) / 12;
  const xc = (i: number): number => m.g + pas * (i + 0.5);
  const yS = (v: number): number => H - m.b - ((v - bas) * (H - m.h - m.b)) / Math.max(1, maxStock - bas);
  const hB = (v: number): number => (v * (H - m.h - m.b) * 0.45) / maxMvt;
  return (
    <figure className="tdb-courbe" data-courbe="gestion">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Biens en gestion sur 12 mois, entrées et sorties">
        <line x1={m.g} x2={L - m.d} y1={H - m.b} y2={H - m.b} className="tdb-grille" />
        {points.map((p, i) => (
          <g key={p.mois} className="tdb-mois-gestion" role="button" tabIndex={0} aria-label={`${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${p.mois.slice(0, 4)} : ${p.entrees} entrée(s), ${p.sorties} sortie(s), ${p.stock} biens`}
            onClick={() => onMois(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMois(p); } }}>
            <rect x={xc(i) - pas / 2} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-cible" />
            <rect x={xc(i) - 9} y={H - m.b - hB(p.entrees)} width={8} height={hB(p.entrees)} className="tdb-barre-entree" />
            <rect x={xc(i) + 1} y={H - m.b - hB(p.sorties)} width={8} height={hB(p.sorties)} className="tdb-barre-sortie" />
            <text x={xc(i)} y={H - 8} textAnchor="middle" className="tdb-axe">{COURT[Number(p.mois.slice(5)) - 1]}</text>
          </g>
        ))}
        <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xc(i).toFixed(1)},${yS(p.stock).toFixed(1)}`).join(' ')} className="tdb-trait" />
        {points.map((p, i) => <text key={`s${p.mois}`} x={xc(i)} y={yS(p.stock) - 8} textAnchor="middle" className="tdb-axe tdb-axe--fort">{p.stock}</text>)}
      </svg>
      <figcaption className="loc-muet"><span className="tdb-legende tdb-legende--courant" /> biens en gestion · <span className="tdb-legende tdb-legende--entree" /> entrées · <span className="tdb-legende tdb-legende--sortie" /> sorties</figcaption>
    </figure>
  );
}

/** Un tableau en cartes (une ligne = une carte, chaque valeur précédée de son intitulé) : au téléphone, et dès 1024 px pour les larges. */
const cartes = (t: string): string => `
  ${t} thead{display:none}
  ${t},${t} tbody,${t} tr,${t} th,${t} td{display:block;width:100%;box-sizing:border-box}
  ${t} tr{border:1px solid var(--color-svv-line);border-radius:12px;padding:6px 10px;margin-bottom:8px}
  ${t} th[scope=row]{border-bottom:0;padding:4px 0}
  ${t} td{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:0;padding:2px 0}
  ${t} td::before{content:attr(data-mot);color:var(--color-svv-muted);font-size:.8rem;font-weight:700;text-align:left}`;

export const CSS_TABLEAU_BORD = `
.tdb{display:flex;flex-direction:column;gap:18px}
.tdb-rangee-mois{display:flex;align-items:stretch;border-bottom:1px solid var(--color-svv-line)}
.tdb-rangee-mois .tdb-onglets{flex:1 1 auto;min-width:0;border-bottom:0}
.tdb-onglet-annee{flex:0 0 auto;width:104px;position:sticky;right:0;background:var(--color-svv-surface);padding-left:6px;box-shadow:-10px 0 10px -10px var(--color-svv-line-strong)}
.tdb-onglet-annee .lch-champ.tdb-onglet-annee-champ{border:0;border-radius:0;border-bottom:3px solid var(--color-svv-red);background:transparent;color:var(--color-svv-ink);font-weight:800;padding:10px 8px;min-height:47px}
.tdb-onglets{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--color-svv-line);padding-bottom:0;scrollbar-width:thin}
.tdb-onglet{appearance:none;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--color-svv-muted);font:inherit;font-weight:800;padding:10px 12px;min-height:44px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.tdb-onglet[aria-selected="true"]{color:var(--color-svv-ink);border-bottom-color:var(--color-svv-red)}
.tdb-onglet:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.tdb-onglet-vide{color:var(--color-svv-line-strong)}
/* Arno (23/10/2026) — « CA · Baux · Gestion » sur la ligne du titre de « Mois par mois » : le style des onglets de mois, selection en VERT. */
.tdb-titre-mesures h3{margin:0}
.tdb-mesures{display:flex;gap:4px;border-bottom:1px solid var(--color-svv-line)}
/* 🔴 Arno (25/10/2026) — l'en-tête de « Mois par mois » : la grille de .tdb-histo-rangee (graphique | encart de 270 px, 20 px d'écart) ;
   la colonne du graphique s'arrête au bord droit de la zone tracée (12 / 640 du dessin, la marge droite du SVG) ; le bouton remonte du
   filet (1 px) qui souligne les mesures : même bas, même hauteur, même ligne de base. */
.tdb-histo-entete{display:grid;grid-template-columns:minmax(0,1fr) 270px;column-gap:20px;row-gap:6px;align-items:end;margin:0 0 10px}
.tdb-histo-entete-graphe{display:flex;align-items:flex-end;justify-content:space-between;gap:6px 14px;min-width:0;padding-right:calc(100% * 12 / 640)}
.tdb-histo-entete-graphe h3{flex:1 1 auto;min-width:0;align-self:center}
.tdb-histo-entete-graphe .tdb-bascule-cumul{flex:0 0 auto;margin-bottom:1px}
.tdb-histo-entete-detail{min-width:0}
.tdb-histo-entete-detail .tdb-mesures{justify-content:space-between}
@media (max-width:760px){
  .tdb-histo-entete{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:flex-end;gap:8px 16px}
  .tdb-histo-entete-graphe{display:contents}
  .tdb-histo-entete-graphe h3{flex:1 1 100%}
}
.tdb-bascule-cumul{appearance:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}
.tdb-bascule-cumul-icone{color:var(--color-svv-muted);font-size:1.05em}
.tdb-bascule-cumul:hover{border-color:var(--color-svv-ink);background:var(--color-svv-surface)}
.tdb-bascule-cumul:hover .tdb-bascule-cumul-icone{color:var(--color-svv-ink)}
.tdb-bascule-cumul:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tdb-zone-cumul{cursor:pointer}
.tdb-mesure[aria-pressed="true"]{color:var(--color-svv-green-ink);border-bottom-color:var(--color-svv-green-ink)}
.tdb-filtres{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:12px 14px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.tdb-champ{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:700;color:var(--color-svv-muted);min-width:0}
.tdb-champ select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 8px;font:inherit;font-size:.92rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%}
.tdb-tuiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.tdb-tuile{appearance:none;width:100%;height:100%;min-height:9rem;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;font:inherit;cursor:pointer;background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line);border-radius:18px;padding:18px 20px;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.tdb-tuile:hover,.tdb-tuile:focus-visible{transform:translateY(-4px);border-color:var(--color-svv-line-strong-hover);box-shadow:0 18px 36px -14px color-mix(in srgb, var(--color-svv-ink) 35%, transparent)}
.tdb-tuile:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tdb-tuile-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-muted);text-transform:none}
.tdb-tuile-valeur{font-size:1.65rem;font-weight:800;line-height:1.15;overflow-wrap:anywhere}
.tdb-tuile-valeur small{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.tdb-tuile-n1{font-size:.85rem;color:var(--color-svv-muted)}
.tdb-ecart-insecable{white-space:nowrap}
.tdb-note{margin:0}
.tdb-section{border:1px solid var(--color-svv-line);border-radius:14px;padding:14px 16px;background:var(--color-svv-surface);min-width:0}
.tdb-section h3{margin:0 0 10px;font-size:1.05rem}
.tdb-table{width:100%;border-collapse:collapse;font-size:.92rem}
.tdb-table th,.tdb-table td{padding:6px 8px;border-bottom:1px solid var(--color-svv-line);text-align:right;vertical-align:middle}
.tdb-table th[scope=row],.tdb-table thead th:first-child{text-align:left}
.tdb-table thead th{font-size:.78rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.tdb-fort th,.tdb-fort td,td.tdb-fort{font-weight:800}
.tdb-h4{margin:14px 0 6px;font-size:.98rem}
.tdb-h-cadre--ouvert{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.tdb-h-cadre--ouvert .tdb-table thead th{position:sticky;top:0;z-index:1;background:var(--color-svv-surface);border-bottom:0;box-shadow:inset 0 -1px 0 var(--color-svv-line)}
.tdb-h-en-cours{cursor:pointer}
.tdb-h-en-cours:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.tdb-h-bascule{margin:4px 0 0;display:flex;justify-content:flex-end}
.tdb-h-bouton{appearance:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 6px 0 10px;border:0;border-radius:10px;background:transparent;color:var(--color-svv-muted);font:inherit;font-size:.82rem;cursor:pointer}
.tdb-h-chevron{display:inline-flex;align-items:center;justify-content:center;min-width:32px;font-size:1rem}
.tdb-h-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
@media (hover:hover){ .tdb-h-bouton:hover{color:var(--color-svv-ink)} }
.tdb-chiffre{appearance:none;border:0;background:none;padding:6px 4px;min-height:36px;font:inherit;color:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:var(--color-svv-line-strong);text-underline-offset:3px;border-radius:6px}
.tdb-chiffre:hover{color:var(--color-svv-red);text-decoration-color:currentColor}
.tdb-chiffre:focus-visible{outline:2px solid var(--color-svv-red)}
.tdb-chiffre:disabled{cursor:default;text-decoration:none;color:inherit}
.tdb-portee{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tdb-pilule{appearance:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.tdb-pilule[aria-pressed=true]{background:var(--color-svv-ink);color:var(--color-svv-surface);border-color:var(--color-svv-ink)}
.tdb-ligne-chiffres{display:flex;flex-wrap:wrap;gap:8px 22px;margin:0 0 8px}
.tdb-indicateurs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.tdb-indicateurs li{display:flex;flex-direction:column;gap:4px;align-items:flex-start;padding:12px 14px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field)}
.tdb-indicateurs .tdb-chiffre,.tdb-indic{font-size:1.4rem;font-weight:800;padding:2px 0}
.tdb-courbe{margin:0 0 10px}
.tdb-courbe{max-width:860px}
/* Arno (23/10/2026) — l'histogramme et son detail cote a cote dans la carte : detail a largeur fixe a droite, aligne en haut ;
   au telephone, dessous, pleine largeur. */
.tdb-histo{max-width:none}
.tdb-histo-rangee{display:grid;grid-template-columns:minmax(0,1fr) 270px;grid-template-areas:"graphe detail" "legende .";gap:4px 20px;align-items:start}
.tdb-histo-graphe{grid-area:graphe}
/* Arno (23/10/2026) : le detail CENTRE verticalement sur la hauteur du graphique (axe compris) ; la legende a sa propre rangee. */
.tdb-histo-detail{grid-area:detail;align-self:center}
.tdb-histo-legende{grid-area:legende;margin:0}
.tdb-histo-graphe{min-width:0}
.tdb-histo-defile{display:grid;align-items:start;min-width:0}
.tdb-histo-axe{width:100%;height:auto;display:block}
.tdb-histo-cadre{position:relative;min-width:0}
.tdb-histo-piste{overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;cursor:grab;overscroll-behavior-x:contain}
.tdb-histo-piste:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tdb-histo-piste--tire{cursor:grabbing;user-select:none}
.tdb-histo-piste .tdb-histo-zone{position:relative}
.tdb-fleche-histo{position:absolute;top:38%;z-index:3;width:36px;height:44px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.3rem;font-weight:800;cursor:pointer;box-shadow:0 6px 16px -8px color-mix(in srgb, var(--color-svv-ink) 40%, transparent)}
.tdb-fleche-histo--g{left:4px}
.tdb-fleche-histo--d{right:4px}
.tdb-fleche-histo:disabled{opacity:.35;cursor:default;box-shadow:none}
.tdb-fleche-histo:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (max-width:640px){ .tdb-fleche-histo{width:30px;height:40px;top:22%;font-size:1.1rem;background:color-mix(in srgb, var(--color-svv-surface) 85%, transparent)} .tdb-fleche-histo:disabled{opacity:.25} }
.tdb-histo-detail .tdb-bulle--sous{display:block;margin-top:0;width:100%;box-sizing:border-box;font-size:.88rem}
@media (max-width:760px){ .tdb-histo-rangee{grid-template-columns:minmax(0,1fr);grid-template-areas:"graphe" "legende" "detail";gap:8px} .tdb-histo-detail{align-self:auto} }
/* Les signes : les memes vert / rouge / gris que le reste de l'interface (jetons du theme). */
.tdb-signe--positif{color:var(--color-svv-green-ink)}
.tdb-signe--negatif{color:var(--color-svv-red)}
.tdb-signe--nul{color:var(--color-svv-muted)}
/* 🔴 Arno (24/10/2026, après 9f230251) — la carte « Le mois » : UNE grille à largeurs fixes, repliée (2 lignes) ou dépliée. */
.tdb-a-table{table-layout:fixed}
.tdb-a-table td,.tdb-a-table th{font-variant-numeric:tabular-nums}
.tdb-a-table .tdb-a-entetes>th{font-size:.78rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}
.tdb-a-table .tdb-a-entetes>th.tdb-a-intitule{text-transform:none;letter-spacing:0;color:var(--color-svv-ink);font-size:1rem;white-space:normal;text-align:left}
/* Le titre a la largeur du plus long (« Le mois — septembre 2026 ») : les sélecteurs ne bougent jamais d'un mois à l'autre. */
.tdb-a-intitule-corps{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.tdb-a-titre{flex:0 0 13.6em;font-size:1rem;font-weight:800;white-space:nowrap}
.tdb-a-compare{flex:0 0 auto;color:var(--color-svv-muted);font-weight:700;font-size:.82rem;white-space:nowrap}
.tdb-a-choix{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;cursor:auto}
/* Une carte trop étroite pour l'intitulé sur une ligne (menu de gauche, petit écran) : les sélecteurs passent sous le titre —
   décidé par la largeur de la CARTE, jamais par le mois ni les montants. */
.tdb-a{container-type:inline-size}
@container (max-width:1125px){ .tdb-a-intitule-corps{flex-wrap:wrap;row-gap:6px} }
.tdb-a-choix .lch-champ.tdb-a-champ{min-width:0;height:40px;min-height:40px;padding-top:0;padding-bottom:0;font-weight:700;box-sizing:border-box}
.tdb-a-choix>.lch{flex:0 0 auto}
.tdb-a-choix>.lch:first-child{width:148px}
.tdb-a-choix>.lch:last-child{width:96px}
.tdb-a-choix .lch-champ.tdb-a-champ--mois,.tdb-a-choix .lch-champ.tdb-a-champ--annee{width:100%}
.tdb-a-total{cursor:pointer}
.tdb-a-ecart{font-weight:800}
.tdb-a-ecart,.tdb-a-ecart-ligne{white-space:nowrap}
.tdb-a-chevron-case{padding:0 !important;text-align:center !important;vertical-align:middle !important;border-bottom:0 !important}
.tdb-a-chevron{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:0;border-radius:10px;background:transparent;color:var(--color-svv-muted);font-size:1rem;cursor:pointer}
.tdb-a-chevron:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
@media (hover:hover){ .tdb-a-total:hover>*,.tdb-a-table:hover .tdb-a-chevron{color:var(--color-svv-ink)} .tdb-a-total:hover>.tdb-signe--positif{color:var(--color-svv-green-ink)} .tdb-a-total:hover>.tdb-signe--negatif{color:var(--color-svv-red)} }

.tdb-tuile:has(.tdb-gestion){min-height:11rem}
/* 🔴 Arno (25/10/2026) — tuiles CENTRÉES (titre, chiffre, comparaison) ; « Biens en gestion » : le Solde, puis la ligne de la période. */
.tdb-gestion{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1 1 auto;width:100%}
.tdb-gestion-comptes{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:4px 10px;font-size:.9rem;font-weight:800}
.tdb-gestion-periode{color:var(--color-svv-muted);font-weight:700}
.tdb-gestion-solde{display:flex;justify-content:center;align-items:baseline;gap:8px}
.tdb-gestion-solde-mot{font-size:.8rem;font-weight:700;color:var(--color-svv-muted)}
.tdb-gestion-solde-valeur{font-size:2.4rem;font-weight:800;line-height:1}
.tdb-gestion-recurrent{font-size:.78rem}
.tdb-courbe svg{width:100%;height:auto;display:block}
.tdb-grille{stroke:var(--color-svv-line);stroke-width:1}
.tdb-axe{fill:var(--color-svv-muted);font-size:11px}
.tdb-axe--fort{fill:var(--color-svv-ink);font-weight:700}
.tdb-trait{fill:none;stroke:var(--color-svv-red);stroke-width:2.5}
.tdb-trait-n1{fill:none;stroke:var(--color-svv-muted);stroke-width:2;stroke-dasharray:6 5}
.tdb-point{fill:var(--color-svv-red)}
.tdb-barre{fill:var(--color-svv-line-strong)}
.tdb-barre--courante{fill:var(--color-svv-red)}
.tdb-barre-annee{cursor:pointer}
.tdb-barre-zone{fill:transparent}
.tdb-barre-n1-fond{fill:var(--color-svv-field)}
.tdb-barre-n1-trait{stroke:var(--color-svv-muted);stroke-width:2}
.tdb-barre-n1{stroke:var(--color-svv-muted);stroke-width:1}
.tdb-histo-zone{position:relative}
.tdb-bulle{min-width:190px;background:var(--color-svv-surface);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:8px 10px;box-shadow:0 18px 40px -16px color-mix(in srgb, var(--color-svv-ink) 30%, transparent);font-size:.82rem}
.tdb-bulle--sous{display:inline-block;margin-top:6px;box-shadow:none}
.tdb-bulle p{margin:0}
.tdb-bulle-titre{font-weight:800;margin-bottom:4px !important}
.tdb-bulle-bloc{padding:2px 0}
.tdb-bulle-annee{font-weight:800}
.tdb-bulle-bloc--courant{color:var(--color-svv-red)}
.tdb-bulle-bloc--n1{color:var(--color-svv-muted)}
.tdb-bulle-ligne,.tdb-bulle-pied{display:flex;justify-content:space-between;gap:14px}
.tdb-bulle-montant{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tdb-bulle-pied{border-top:1px solid var(--color-svv-line);margin-top:4px !important;padding-top:4px;color:var(--color-svv-ink)}
.tdb-barre-entree{fill:var(--color-svv-green-ink)}
.tdb-barre-sortie{fill:var(--color-svv-amber)}
.tdb-cible{fill:transparent;cursor:pointer}
.tdb-mois-gestion:hover .tdb-cible,.tdb-mois-gestion:focus-visible .tdb-cible{fill:color-mix(in srgb, var(--color-svv-ink) 6%, transparent)}
.tdb-mois-gestion:focus-visible{outline:none}
.tdb-legende{display:inline-block;width:18px;height:3px;vertical-align:middle;background:var(--color-svv-red)}
.tdb-legende--n1{background:repeating-linear-gradient(90deg,var(--color-svv-muted) 0 5px,transparent 5px 9px)}
.tdb-legende--entree{background:var(--color-svv-green-ink);height:8px;width:8px}
.tdb-legende--sortie{background:var(--color-svv-amber);height:8px;width:8px}
.tdb-legende--barre{background:var(--color-svv-red);height:10px;width:12px}
.tdb-legende--barre-n1{background:repeating-linear-gradient(45deg,var(--color-svv-muted) 0 2px,var(--color-svv-field) 2px 5px);border:1px solid var(--color-svv-muted);height:10px;width:12px;box-sizing:border-box}
.tdb-bouton-export{width:auto !important;display:inline-flex;align-items:center;min-height:44px}
.tdb-voile{position:fixed;inset:0;z-index:80;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.tdb-fenetre{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:18px;width:min(860px,100%);max-height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden}
.tdb-fenetre-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--color-svv-line)}
.tdb-fenetre-tete h3{margin:0;font-size:1.05rem}
.tdb-x{width:44px;height:44px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-size:1.4rem;cursor:pointer;flex:0 0 auto}
.tdb-fenetre-corps{padding:12px 18px 18px;overflow-y:auto}
.tdb-baux,.tdb-lots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tdb-baux li{padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px}
.tdb-bail-titre{margin:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tdb-bail-chiffres{margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.88rem;color:var(--color-svv-muted)}
.tdb-bail-chiffres strong{color:var(--color-svv-ink)}
.tdb-lien{display:inline-block;margin-top:6px;color:var(--color-svv-red);font-weight:700;min-height:32px}
@media (prefers-reduced-motion:reduce){ .tdb-tuile{transition:none} .tdb-tuile:hover,.tdb-tuile:focus-visible{transform:none} }
@media (max-width:1024px){ ${cartes('.tdb-table--large')} }
@media (max-width:1100px){ .tdb-filtres{grid-template-columns:repeat(3,minmax(0,1fr))} .tdb-tuiles,.tdb-indicateurs{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:640px){
  .tdb-filtres{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tdb-tuile{min-height:7rem;padding:14px 16px}
  .tdb-tuile-valeur{font-size:1.3rem}
  ${cartes('.tdb-table')}
  .tdb-a{position:relative}
  .tdb-a-table colgroup{display:none}
  .tdb-a-table tr.tdb-a-entetes{border:0;padding:0 48px 0 0;margin-bottom:6px}
  .tdb-a-table tr.tdb-a-entetes>th:not(.tdb-a-intitule){display:none}
  .tdb-a-table tr.tdb-a-entetes>th.tdb-a-intitule{border-bottom:0;padding:0}
  .tdb-a-intitule-corps{flex-wrap:wrap}
  .tdb-a-titre{flex-basis:100%}
  .tdb-a-table td.tdb-a-chevron-case{position:absolute;top:10px;right:8px;width:auto}
  .tdb-a-table td.tdb-a-chevron-case::before{content:none}
  .tdb-voile{padding:0;align-items:stretch}
  .tdb-fenetre{max-height:none;height:100%;border-radius:0}
}
@media (max-width:420px){ .tdb-tuiles,.tdb-indicateurs{grid-template-columns:minmax(0,1fr)} }
`;
