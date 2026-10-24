'use client';

import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ListeChoix } from './ListeChoix';
import {
  type Apporteur, aRattacher, collegueADate, LIBELLE_TYPE_APPORTEUR, pourcent, type RegleCommission, TYPES_APPORTEUR, type TypeApporteur, versionADate,
  type ModeApporteur, libelleApporteur, trierApporteurs,
  badgeApporteur, estInterne, lireDuree, MOT_DUREE, MOT_COLLEGUE_OBLIGATOIRE,
} from '../../../../lib/location/suivi/suivi';
import { API_SUIVI, aujourdhuiParis, posterSuivi } from './suiviApi';
import { ChampDuree, ChoixMode, CSS_REGLAGE_APPORTEUR, dureeEnvoyee } from './ReglageApporteur';
import { ecrireEtatModale } from './etatModaleParametres';
import { echelleTotaux, largeurDeuxRangees } from './miseEnPageTotaux';
import { CSS_PANNEAUX_APPORTEUR, LIBELLE_PANNEAU, type Panneau, PANNEAUX, PanneauFiche, PanneauRattachement, PanneauTaux } from './PanneauxApporteur';
import { BlocConditions, type Chiffres, CSS_CUMUL_CONDITIONS, CumulApporteur, netAgence } from './CumulEtConditions';

/**
 * ══ LOCATION — ROUE « PARAMÈTRES » : APPORTEURS ET COMMISSIONS (Arno, 22/10/2026, migration 406) ═══════════════════════════
 *   · « Apporteurs » : le référentiel (partenaire externe, agence, Internet, collaborateur) ; chaque taux
 *     est une VERSION DATÉE — « Nouveau taux » vaut pour les baux signés à partir de sa date, jamais en arrière ;
 *   · « Commissions » : la règle du négociateur (taux sur le CA net d'apporteurs, primes de nouvelle gestion logement /
 *     parking), datée elle aussi ; et les rétrocessions saisies à la main (annulables, jamais supprimées).
 * Chaque onglet enregistre par ses propres boutons (une ligne = un geste) ; le serveur exige un administrateur.
 */
interface Lu {
  disponible: boolean;
  apporteurs: Apporteur[];
  regles: RegleCommission[];
  retrocessions: { id: number; negociateurLibelle: string; negociateurId: number | null; mois: string; montant: number; libelle: string }[];
  negociateurs: { id: number; libelle: string; actif?: boolean }[];
  collegues: { id: number; libelle: string; actif?: boolean }[];
  /** 414 — le nom de famille et le prénom des apporteurs se corrigent dans la fiche. */
  nomPrenom?: boolean;
  annuaire: boolean;
  /** 419 — apporteurs internes, durée du récurrent et rémunération du collègue s'enregistrent-ils ? */
  interne?: boolean;
  /** 420 — « Depuis toujours » s'enregistre-t-il ? */
  toujours?: boolean;
  /** 421 — la fiche d'identité complète d'un externe (civilité, adresse, notes, autres téléphones et e-mails) ? */
  identite?: boolean;
  /** 422 — « Passer en interne » ? */
  passage?: boolean;
}
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const moisFr = (iso: string): string => new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function useSuiviParametres(): { lu: Lu | null; erreur: string | null; relire: () => void } {
  const [lu, setLu] = useState<Lu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(API_SUIVI, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: Partial<Lu>; message?: string }) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setErreur(d.message ?? 'Lecture impossible.'); return; }
      const x = d.data;
      setLu({ disponible: x.disponible === true, apporteurs: Array.isArray(x.apporteurs) ? x.apporteurs : [], regles: Array.isArray(x.regles) ? x.regles : [],
        retrocessions: Array.isArray(x.retrocessions) ? x.retrocessions : [], negociateurs: Array.isArray(x.negociateurs) ? x.negociateurs : [],
        collegues: Array.isArray(x.collegues) ? x.collegues : [], annuaire: x.annuaire === true, nomPrenom: x.nomPrenom === true, interne: x.interne === true, toujours: x.toujours === true, identite: x.identite === true, passage: x.passage === true });
    }).catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [n]);
  return { lu, erreur, relire: useCallback(() => setN((x) => x + 1), []) };
}

function Etat({ lu, erreur }: { lu: Lu | null; erreur: string | null }) {
  if (lu === null) return <p className="plo-muet" role="status">{erreur ?? 'Lecture…'}</p>;
  if (!lu.disponible) return <p className="plo-alerte" role="status" data-suivi-sans-migration>Mise à jour de la base à appliquer (migration 406) : rien ne se lit ni ne s’enregistre ici tant qu’elle n’est pas appliquée.</p>;
  return null;
}

/** Un geste : envoi, puis relecture ; le motif d'un refus est dit sous le bouton. */
function useGeste(relire: () => void) {
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const faire = async (corps: Record<string, unknown>, reussite: string): Promise<boolean> => {
    setEnvoi(true); setMotif(null); setInfo(null);
    // 🔴 Arno (24/10/2026) — rester sur place dans la modale : le message sous le bouton, pas la fenêtre verte de la tuile.
    const r = await posterSuivi(corps, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return false; }
    setInfo(reussite); relire();
    return true;
  };
  const retour = (
    <>
      {motif !== null && <p className="plo-erreur" role="alert" data-motif-suivi>{motif}</p>}
      {info !== null && <p className="plo-ok" role="status" data-info-suivi>{info}</p>}
    </>
  );
  return { envoi, faire, retour, effacer: () => { setMotif(null); setInfo(null); } };
}

/**
 * 🔴 Arno (23/10/2026) — une saisie ouverte dans une ligne (fiche, nouveau taux, nouvelle règle) se ferme QUAND ON VEUT, sans
 * condition : son bouton « Annuler » / « Fermer la fiche » ou Échap (qui ne ferme alors que la ligne, pas la roue).
 */
const echap = (fermer: () => void) => (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };

/** 419 — `sorte` : apporteur INTERNE (un compte de l'interface) ou partenaire EXTERNE ; `duree` / `indeterminee` : la durée du récurrent. */
const VIDE_APPORTEUR =(jour: string) => ({ sorte: 'externe' as 'externe' | 'interne', compteId: '', nom: '', type: 'partenaire' as TypeApporteur, mode: 'one_shot' as ModeApporteur, taux: '', tauxGestion: '',
  duree: '', indeterminee: true, depuis: jour, collegueId: '', toujours: false, societe: '', telephone: '', email: '' });

/** 419 — le badge « INTERNE » / « PARTENAIRE EXTERNE ». */
function BadgeApporteur({ a }: { a: Pick<Apporteur, 'compteId'> }) {
  return <span className={`plo-pastille plo-badge ${estInterne(a) ? 'plo-badge--interne' : 'plo-badge--externe'}`} data-badge-apporteur={estInterne(a) ? 'interne' : 'externe'}>{badgeApporteur(a)}</span>;
}

type Tri = 'ca' | 'commission' | 'nb' | 'nom';
const LIBELLE_TRI: Record<Tri, string> = { ca: 'Honoraires HT (décroissant)', commission: 'Dû à l’apporteur HT (décroissant)', nb: 'Dossiers (décroissant)', nom: 'Nom de famille (A → Z)' };

/**
 * `onChoisir` (Arno, 24/10/2026) — ouvert depuis « Nouveau locataire » (modale « Ouvrir l'annuaire ») : chaque apporteur porte
 * « Choisir cet apporteur », qui le pose sur le bail et ferme la modale. Absent ⇒ l'annuaire de la roue, à l'identique.
 */
export function OngletApporteurs({ onChoisir, url = false }: { onChoisir?: (a: Apporteur) => void;
  /** 🔴 Arno (24/10/2026) — la carte et le panneau ouverts suivent l'adresse (`?apporteur=…&panneau=…`) : un rechargement les rouvre. */
  url?: boolean } = {}) {
  const { lu, erreur, relire } = useSuiviParametres();
  const g = useGeste(relire);
  const jour = aujourdhuiParis();
  const [nouveau, setNouveau] = useState(VIDE_APPORTEUR(jour));
  /** 419 — un refus dit AVANT l'envoi (le serveur refuse pareil) : externe sans collègue, durée illisible (création). */
  const [refusLocal, setRefusLocal] = useState<string | null>(null);
  /** 🔴 Arno (24/10/2026) — le panneau ouvert de chaque carte (au plus un par carte). */
  const [panneaux, setPanneaux] = useState<Record<number, Panneau>>(() => {
    if (!url || typeof window === 'undefined') return {};
    const p = new URLSearchParams(window.location.search);
    const id = Number(p.get('apporteur')); const pan = p.get('panneau') as Panneau | null;
    return Number.isSafeInteger(id) && id > 0 && pan !== null && PANNEAUX.includes(pan) ? { [id]: pan } : {};
  });
  /** La carte rouverte par l'adresse : amenée sous les yeux une fois l'annuaire lu (une seule fois). */
  const aRetrouver = useRef<number | null>(url && typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('apporteur')) || null : null);
  /**
   * 🔴 Arno (24/10/2026) — RESTER SUR PLACE : un geste d'une carte se confirme SUR la carte (message près du bouton) — pas par la
   * fenêtre verte de la tuile, dont « Voir la fiche » rechargeait la page et faisait quitter l'annuaire. Les données se relisent sans
   * rien démonter : même carte, même panneau, même défilement, mêmes tri et filtre.
   */
  const [messages, setMessages] = useState<Record<number, { ok: string | null; motif: string | null }>>({});
  const [envoiCarte, setEnvoiCarte] = useState(false);
  /** Les cartes touchées sous le filtre « À rattacher » : si elles en sortent, un message tient leur place. */
  const [suivies, setSuivies] = useState<ReadonlySet<number>>(() => new Set());
  const faireCarte = (id: number) => async (corps: Record<string, unknown>, reussite: string): Promise<boolean> => {
    setEnvoiCarte(true); setMessages((m) => ({ ...m, [id]: { ok: null, motif: null } }));
    const r = await posterSuivi(corps, { propre: true });
    setEnvoiCarte(false);
    if (r.motif !== null) { setMessages((m) => ({ ...m, [id]: { ok: null, motif: r.motif } })); return false; }
    setMessages((m) => ({ ...m, [id]: { ok: reussite, motif: null } }));
    if (seulementARattacher) setSuivies((x) => new Set([...x, id]));
    relire();
    return true;
  };
  const enregistreCarte = (id: number) => (message?: string): void => {
    if (message !== undefined) setMessages((m) => ({ ...m, [id]: { ok: message, motif: null } }));
    if (seulementARattacher) setSuivies((x) => new Set([...x, id]));
    relire();
  };
  const messageCarte = (id: number) => {
    const m = messages[id];
    if (m === undefined || (m.ok === null && m.motif === null)) return null;
    return m.ok !== null ? <p className="plo-message-carte" role="status" data-message-carte={id}>✓ {m.ok}</p>
      : <p className="plo-erreur" role="alert" data-motif-carte={id}>{m.motif}</p>;
  };
  const basculer = (id: number, p: Panneau): void => {
    g.effacer(); setRefusLocal(null); setMessages((m) => { const n = { ...m }; delete n[id]; return n; });
    setPanneaux((x) => { const n = { ...x }; if (n[id] === p) delete n[id]; else n[id] = p; return n; });
    if (url) {
      const ouvre = panneaux[id] !== p;
      const enAdresse = Number(new URLSearchParams(window.location.search).get('apporteur'));
      if (ouvre) ecrireEtatModale({ apporteur: String(id), panneau: p });
      else if (enAdresse === id) ecrireEtatModale({ apporteur: null, panneau: null });
    }
  };
  /** Arno (23/10/2026) — « À rattacher (N) » : ne montrer que les apporteurs sans collègue. */
  const [seulementARattacher, setSeulementARattacher] = useState(false);
  /** Arno (23/10/2026) — les totaux de chaque apporteur (dossiers, honoraires HT, dû HT), et le tri de la liste. */
  const [totaux, setTotaux] = useState<Record<number, Chiffres> | null>(null);
  // Arno (24/10/2026) — par défaut, l'ordre ALPHABÉTIQUE par nom de famille (les autres tris restent au choix).
  const [tri, setTri] = useState<Tri>('nom');
  useEffect(() => {
    let vivant = true;
    fetch(`${API_SUIVI}?vue=totaux-apporteurs`, { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: Record<number, Chiffres> }) => { if (vivant && d.etat === 'ok' && d.data) setTotaux(d.data); })
      .catch(() => { /* les totaux manquent : la liste reste, sans eux */ });
    return () => { vivant = false; };
  }, [lu]);
  const annuaire = lu?.annuaire === true;
  useEffect(() => {
    if (lu === null || aRetrouver.current === null) return;
    const id = aRetrouver.current;
    aRetrouver.current = null;
    // Seul le corps de la modale défile : un scrollIntoView ferait aussi glisser la fenêtre (overflow: hidden) et cacherait les onglets.
    const carte = document.querySelector<HTMLElement>(`[data-apporteur="${id}"]`);
    const corps = carte?.closest<HTMLElement>('.plo-corps');
    if (carte && corps) corps.scrollTop += carte.getBoundingClientRect().top - corps.getBoundingClientRect().top;
    else carte?.scrollIntoView?.({ block: 'start' });
  }, [lu]);
  // 🔴 Arno (24/10/2026) — la ligne de totaux tient sur UNE ligne : une échelle de police commune à toutes les cartes (la carte la plus
  // longue la fixe), plancher 13 px ; sous le plancher, repli en deux lignes équilibrées. Remesuré quand la LARGEUR change (seulement).
  const listeRef = useRef<HTMLOListElement | null>(null);
  useLayoutEffect(() => {
    const ol = listeRef.current;
    if (ol === null) return;
    const ecart = (l: HTMLElement): number => parseFloat(getComputedStyle(l).columnGap) || 0;
    const elements = (l: HTMLElement): HTMLElement[] => [...l.children] as HTMLElement[];
    const besoinDe = (l: HTMLElement): number => elements(l).reduce((t, x) => t + x.getBoundingClientRect().width, 0) + ecart(l) * Math.max(0, elements(l).length - 1);
    const ajuster = (): void => {
      const lignes = [...ol.querySelectorAll<HTMLElement>('[data-totaux-ligne]')];
      ol.style.setProperty('--plo-echelle-totaux', '1');
      for (const l of lignes) { l.removeAttribute('data-replie'); l.style.maxWidth = ''; }
      let { echelle, replie } = echelleTotaux(lignes.map((l) => ({ besoin: besoinDe(l), dispo: l.clientWidth })));
      ol.style.setProperty('--plo-echelle-totaux', String(echelle));
      // Le texte ne rétrécit pas tout à fait en proportion (rendu des polices) : on remesure à l'échelle posée et on corrige (4 fois au plus).
      for (let i = 0; i < 4 && !replie; i++) {
        if (lignes.every((l) => besoinDe(l) <= l.clientWidth)) break;
        const r = echelleTotaux(lignes.map((l) => ({ besoin: besoinDe(l), dispo: l.clientWidth })));
        ({ echelle, replie } = echelleTotaux([{ besoin: 1, dispo: Math.max(echelle * r.echelle, 0) / 0.995 }]));
        ol.style.setProperty('--plo-echelle-totaux', String(echelle));
      }
      ol.dataset.echelleTotaux = String(Math.round(echelle * 1000) / 1000);
      if (!replie) return;
      for (const l of lignes) {
        const b = besoinDe(l);
        if (b <= l.clientWidth) continue;
        l.setAttribute('data-replie', '');
        l.style.maxWidth = `${largeurDeuxRangees(elements(l).map((x) => x.getBoundingClientRect().width), ecart(l))}px`;
      }
    };
    ajuster();
    if (typeof ResizeObserver === 'undefined') return;
    let largeur = ol.clientWidth;
    const ro = new ResizeObserver(() => { if (ol.clientWidth !== largeur) { largeur = ol.clientWidth; ajuster(); } });
    ro.observe(ol);
    return () => ro.disconnect();
  }, [totaux, lu, tri, seulementARattacher, suivies]);
  return (
    <section data-onglet-apporteurs>
      <p className="plo-note">L’annuaire des apporteurs d’affaires et leur commission : un taux sur la <strong>location</strong> (honoraires HT du bail) et un taux sur la <strong>gestion</strong>
        (honoraires de gestion du bail), « One shot » ou « Récurrent ». <strong>Un nouveau taux crée une nouvelle version</strong> :
        il vaut pour les baux signés à partir de sa date ; les baux déjà signés gardent le leur.{annuaire && <> Chaque <strong>partenaire externe</strong> est <strong>rattaché à un collègue</strong>
        (de qui vient ce contact) ; un changement de collègue est daté : les affaires passées restent au collègue de l’époque. Un apporteur <strong>interne</strong> (un compte de l’interface) n’est rattaché à personne.</>}</p>
      <Etat lu={lu} erreur={erreur} />
      {lu !== null && lu.disponible && (
        <>
          {annuaire && lu.apporteurs.some((a) => !a.archive && aRattacher(a)) && (
            <p className="plo-alerte" role="status" data-alerte-a-rattacher>
              {lu.apporteurs.filter((a) => !a.archive && aRattacher(a)).length} apporteur(s) « à rattacher » : tant qu’ils n’ont pas de collègue, ils ne peuvent pas être choisis pour une nouvelle location.</p>
          )}
          {/* 🔴 Arno (24/10/2026) — « Trier par » : la liste verte de Location (menu juste sous le champ), mêmes options, même tri. */}
          <label className="plo-champ plo-tri" data-tri-apporteurs><span>Trier par</span>
            <ListeChoix options={(Object.keys(LIBELLE_TRI) as Tri[]).map((k) => ({ id: k, libelle: LIBELLE_TRI[k] }))} valeur={tri} vide={null} libelle="Trier par"
              onChange={(v) => setTri(v as Tri)} donnees={{ 'data-tri': '' }} /></label>
          {annuaire && (
            <p className="plo-filtre-rattacher">
              <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" aria-pressed={seulementARattacher} onClick={() => { setSeulementARattacher((x) => !x); setSuivies(new Set()); }} data-filtre-a-rattacher>
                {seulementARattacher ? 'Tous les apporteurs' : `À rattacher (${lu.apporteurs.filter((a) => !a.archive && aRattacher(a)).length})`}</button>
            </p>
          )}
          <ol className="plo-versions" data-liste-apporteurs ref={listeRef}>
            {(() => {
              // 414 — « NOM Prénom », tri par nom de famille puis prénom (une structure par son nom) ; les autres tris départagent pareil.
              // Une carte rattachée sous le filtre « À rattacher » garde sa place, le temps de dire qu'elle en sort.
              const alpha = trierApporteurs(lu.apporteurs.filter((a) => !a.archive && (!seulementARattacher || aRattacher(a) || suivies.has(a.id))));
              const rang = new Map(alpha.map((a, i) => [a.id, i]));
              return tri === 'nom' ? alpha : [...alpha].sort((x, y) => (totaux?.[y.id]?.[tri] ?? 0) - (totaux?.[x.id]?.[tri] ?? 0) || (rang.get(x.id)! - rang.get(y.id)!));
            })().map((a) => {
              const orphelin = annuaire && aRattacher(a);
              // 419 — un INTERNE n'est rattaché à personne : ni pastille de collègue, ni « à rattacher », ni rémunération.
              const interne = estInterne(a);
              const collegue = interne ? null : collegueADate(a, jour);
              // 🔴 Arno (24/10/2026) — rattachée sous le filtre « À rattacher » : un message tient sa place (rien ne saute ailleurs).
              if (seulementARattacher && !aRattacher(a) && suivies.has(a.id)) {
                return (
                  <li key={a.id} data-apporteur-sorti-filtre={a.id} className="plo-sorti-filtre" role="status">
                    ✓ {libelleApporteur(a)} : {estInterne(a) ? 'passage en interne enregistré' : 'rattachement enregistré'} — n’apparaît plus dans ce filtre « À rattacher ».</li>
                );
              }
              return (
                <li key={a.id} data-apporteur={a.id} data-sorte-apporteur={interne ? 'interne' : 'externe'} className={orphelin ? 'plo-a-rattacher' : undefined}>
                  <p className="plo-version-titre"><strong data-nom-apporteur-liste>{libelleApporteur(a)}</strong><BadgeApporteur a={a} />
                    {/* 🔴 Arno (24/10/2026) — UN seul badge quand la pastille de type le répète (« Partenaire externe ») ; sinon les deux. */}
                    {LIBELLE_TYPE_APPORTEUR[a.type].toLocaleUpperCase('fr-FR') !== badgeApporteur(a) && <span className="plo-pastille" data-type-apporteur>{LIBELLE_TYPE_APPORTEUR[a.type]}</span>}
                    {annuaire && !interne && (orphelin
                      ? <span className="plo-pastille plo-pastille--orange" data-a-rattacher>à rattacher</span>
                      : <span className="plo-pastille plo-pastille--vigueur" data-collegue-apporteur>{collegue?.collegueLibelle}</span>)}</p>
                  {/* 🔴 Arno (24/10/2026) — CARTE ALLÉGÉE : nom + badges, la synthèse, puis les 4 boutons. « Rattaché à … », « Collègue : … —
                      rémunération » et « Lié à son compte » sont au panneau Rattachement / Fiche ; coordonnées → Fiche ; règle et historique → Taux. */}
                  {totaux !== null && (
                    // 🔴 Arno (24/10/2026) — « Dû à l'apporteur HT » (ex-« Dû HT ») ; « Dû au collègue HT » seulement s'il n'est pas nul (au
                    // centime ; accord d'Arno) ; « Net agence HT » TOUJOURS, en dernier = la ligne « Depuis le début » du Cumul.
                    <dl className="plo-totaux-ligne" data-totaux-ligne={a.id}>
                      <div><dt>Dossiers</dt><dd>{totaux[a.id]?.nb ?? 0}</dd></div>
                      <div><dt>Honoraires HT</dt><dd>{euros(totaux[a.id]?.ca ?? 0)}</dd></div>
                      <div data-du-apporteur={a.id}><dt>Dû à l’apporteur HT</dt><dd>{euros(totaux[a.id]?.commission ?? 0)}</dd></div>
                      {Math.round((totaux[a.id]?.collegue ?? 0) * 100) !== 0 && <div data-du-collegue={a.id}><dt>Dû au collègue HT</dt><dd>{euros(totaux[a.id]?.collegue ?? 0)}</dd></div>}
                      <div className="plo-total-net" data-net-agence={a.id}><dt>Net agence HT</dt><dd>{euros(netAgence({ ca: totaux[a.id]?.ca ?? 0, commission: totaux[a.id]?.commission ?? 0,
                        collegue: totaux[a.id]?.collegue ?? 0 }))}</dd></div>
                    </dl>
                  )}
                  {/* 🔴 Arno (24/10/2026) — le bloc « Conditions » remplace la cascade sur la carte (accord d'Arno) : les conditions en vigueur,
                      les dossiers calculés à d'autres conditions, le collègue et sa rémunération. La cascade reste par dossier dans « Cumul ». */}
                  <BlocConditions a={a} jour={jour} />
                  {/* 🔴 Arno (24/10/2026) — QUATRE boutons : Fiche · Rattachement · Taux · Cumul (ils remplacent « Nouveau taux » et « Fiche et
                      cumul », dont tout le contenu est redistribué) ; un seul panneau ouvert par carte ; un second clic le referme. */}
                  <span className="plo-gestes-ligne plo-boutons-carte" role="group" aria-label={`Panneaux — ${libelleApporteur(a)}`}>
                    {onChoisir !== undefined && (
                      <button type="button" className="svv-btn svv-btn-primary gst-btn plo-corriger" data-choisir-apporteur={a.id}
                        disabled={orphelin} title={orphelin ? 'À rattacher à un collègue avant d’être choisi' : undefined}
                        onClick={() => onChoisir(a)}>Choisir cet apporteur</button>
                    )}
                    {PANNEAUX.map((p) => (
                      <button key={p} type="button" aria-pressed={panneaux[a.id] === p} aria-controls={`plo-panneau-${a.id}`} data-panneau-bouton={p} data-apporteur-bouton={a.id}
                        className={`svv-btn svv-btn-outline gst-btn plo-corriger plo-bouton-panneau${p === 'rattachement' && orphelin ? ' plo-bouton-alerte' : ''}`}
                        onClick={() => basculer(a.id, p)}>{LIBELLE_PANNEAU[p]}</button>
                    ))}
                  </span>
                  {panneaux[a.id] !== undefined && (
                    <div id={`plo-panneau-${a.id}`} data-panneau-ouvert={panneaux[a.id]} onKeyDown={echap(() => basculer(a.id, panneaux[a.id] as Panneau))}>
                      {panneaux[a.id] === 'fiche' && (
                        <PanneauFiche key={`${a.id}-${a.version ?? ''}`} a={a} nomPrenom={lu.nomPrenom === true} identite={lu.identite === true} orphelin={orphelin}
                          comptes={lu.collegues} apporteurs={lu.apporteurs} passage={lu.passage === true}
                          onEnregistre={enregistreCarte(a.id)} message={messageCarte(a.id)} />
                      )}
                      {panneaux[a.id] === 'rattachement' && (
                        <PanneauRattachement a={a} apporteurs={lu.apporteurs} collegues={lu.collegues} jour={jour} faire={faireCarte(a.id)} envoi={envoiCarte} message={messageCarte(a.id)}
                          avec419={lu.interne === true} toujoursPossible={lu.toujours === true} cle={lu} />
                      )}
                      {panneaux[a.id] === 'taux' && (
                        <PanneauTaux a={a} apporteurs={lu.apporteurs} jour={jour} faire={faireCarte(a.id)} envoi={envoiCarte} orphelin={orphelin} autres={totaux?.[a.id]?.autres ?? []}
                          toujoursPossible={lu.toujours === true} cle={lu} onFermer={() => basculer(a.id, 'taux')} message={messageCarte(a.id)} />
                      )}
                      {panneaux[a.id] === 'cumul' && (
                        <div className="plo-panneau" data-panneau="cumul">
                          <CumulApporteur a={a} apporteurs={lu.apporteurs} cle={lu} />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {lu.apporteurs.length === 0 && <p className="plo-muet">Aucun apporteur pour l’instant.</p>}
          <h3 className="plo-h3">Ajouter un apporteur</h3>
          {/* 🔴 Arno (24/10/2026, 419) — INTERNE (un compte de l'interface, rattaché à personne) ou PARTENAIRE EXTERNE (collègue obligatoire). */}
          {annuaire && (
            <span className="plo-modes" role="group" aria-label="Sorte d’apporteur" data-sorte-nouveau>
              <button type="button" className="plo-mode" aria-pressed={nouveau.sorte === 'externe'} data-sorte="externe" onClick={() => setNouveau({ ...nouveau, sorte: 'externe' })}>Partenaire externe</button>
              <button type="button" className="plo-mode" aria-pressed={nouveau.sorte === 'interne'} data-sorte="interne" disabled={lu.interne !== true}
                title={lu.interne !== true ? 'Mise à jour de la base à appliquer (migration 419)' : undefined} onClick={() => setNouveau({ ...nouveau, sorte: 'interne' })}>Interne (compte de l’interface)</button>
            </span>
          )}
          <div className="plo-grille" data-ajout-apporteur>
            {nouveau.sorte === 'interne' ? (
              <label className="plo-champ"><span>Compte de l’interface *</span>
                <ListeChoix options={lu.collegues.filter((c) => !lu.apporteurs.some((x) => !x.archive && x.compteId === c.id))} valeur={nouveau.compteId} libelle="Compte de l’apporteur interne"
                  onChange={(v) => setNouveau({ ...nouveau, compteId: v })} donnees={{ 'data-compte-apporteur-nouveau': '' }} /></label>
            ) : (
              <>
                <label className="plo-champ"><span>Nom</span><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} data-nom-apporteur /></label>
                <label className="plo-champ"><span>Type</span>
                  <ListeChoix options={TYPES_APPORTEUR.map((t) => ({ id: t, libelle: LIBELLE_TYPE_APPORTEUR[t] }))} valeur={nouveau.type} vide={null} libelle="Type"
                    onChange={(v) => setNouveau({ ...nouveau, type: v as TypeApporteur })} donnees={{ 'data-type-apporteur-nouveau': '' }} /></label>
                {annuaire && (
                  <div className="plo-champ"><span>Collègue de rattachement *</span>
                    <ListeChoix options={lu.collegues} valeur={nouveau.collegueId} libelle="Collègue de rattachement"
                      onChange={(v) => setNouveau({ ...nouveau, collegueId: v })} donnees={{ 'data-collegue-apporteur-nouveau': '' }} />
                    <label className="plo-case"><input type="checkbox" checked={nouveau.toujours} onChange={(e) => setNouveau({ ...nouveau, toujours: e.target.checked })} data-nouveau-toujours />
                      Depuis toujours <small className="plo-muet">(sinon : à partir de la date du taux)</small></label></div>
                )}
              </>
            )}
            <ChoixMode valeur={nouveau.mode} onChange={(m) => setNouveau({ ...nouveau, mode: m })} />
            <label className="plo-champ"><span>Taux sur la location (%)</span><input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} data-taux-apporteur /></label>
            <label className="plo-champ"><span>Taux sur la gestion (%)</span><input inputMode="decimal" value={nouveau.tauxGestion} placeholder="ex. 20" onChange={(e) => setNouveau({ ...nouveau, tauxGestion: e.target.value })} data-taux-gestion-apporteur /></label>
            {nouveau.mode === 'recurrent' && <ChampDuree indeterminee={nouveau.indeterminee} duree={nouveau.duree} repere="nouveau" onChange={(x) => setNouveau({ ...nouveau, ...x })} />}
            <label className="plo-champ"><span>Taux applicable à partir du</span><input type="date" value={nouveau.depuis} onChange={(e) => setNouveau({ ...nouveau, depuis: e.target.value })} /></label>
            {annuaire && (
              <>
                <label className="plo-champ"><span>Société (facultatif)</span><input value={nouveau.societe} onChange={(e) => setNouveau({ ...nouveau, societe: e.target.value })} /></label>
                <label className="plo-champ"><span>Téléphone (facultatif)</span><input inputMode="tel" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></label>
                <label className="plo-champ"><span>E-mail (facultatif)</span><input inputMode="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} /></label>
              </>
            )}
          </div>
          {refusLocal !== null && <p className="plo-erreur" role="alert" data-refus-local-ajout>{refusLocal}</p>}
          <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-ajouter-apporteur
            onClick={() => {
              // 🔴 419 — refusé ICI comme au serveur : un externe sans collègue, un interne sans compte, une durée illisible.
              const interne = nouveau.sorte === 'interne';
              if (interne && nouveau.compteId === '') { setRefusLocal('Un apporteur interne est lié à son compte de l’interface : choisissez le compte.'); return; }
              if (!interne && annuaire && nouveau.collegueId === '') { setRefusLocal(MOT_COLLEGUE_OBLIGATOIRE); return; }
              if (nouveau.mode === 'recurrent' && lireDuree(dureeEnvoyee(nouveau)) === undefined) { setRefusLocal(MOT_DUREE); return; }
              setRefusLocal(null);
              const libelle = interne ? lu.collegues.find((c) => String(c.id) === nouveau.compteId)?.libelle ?? 'interne' : nouveau.nom.trim();
              void g.faire({ action: 'creer-apporteur', apporteur: {
                nom: nouveau.nom, type: nouveau.type, mode: nouveau.mode, taux: nouveau.taux, tauxGestion: nouveau.tauxGestion, depuis: nouveau.depuis,
                societe: nouveau.societe, telephone: nouveau.telephone, email: nouveau.email,
                ...(nouveau.mode === 'recurrent' ? { dureeAnnees: dureeEnvoyee(nouveau) } : {}),
                ...(interne ? { interne: true, compteId: Number(nouveau.compteId) }
                  : { collegueId: nouveau.collegueId === '' ? null : Number(nouveau.collegueId), ...(nouveau.toujours ? { depuisToujours: true } : {}) }) } }, `Apporteur « ${libelle} » ajouté.`)
                .then((ok) => { if (ok) setNouveau(VIDE_APPORTEUR(jour)); });
            }}>
            + Ajouter l’apporteur</button>
        </>
      )}
      {g.retour}
    </section>
  );
}

export function OngletCommissions() {
  const { lu, erreur, relire } = useSuiviParametres();
  const g = useGeste(relire);
  const jour = aujourdhuiParis();
  const enVigueur = lu === null ? null : versionADate(lu.regles, jour);
  const [regle, setRegle] = useState<{ depuis: string; tauxNegociateur: string; primeLogement: string; primeLocal: string; primeParking: string } | null>(null);
  const [retro, setRetro] = useState({ negociateurId: '', mois: jour.slice(0, 7), montant: '', libelle: '' });
  return (
    <section data-onglet-commissions>
      <p className="plo-note">La commission du négociateur, comme dans le suivi mensuel : <strong>taux × (CA HT − commissions des apporteurs) + primes de
        nouvelle gestion − rétrocessions</strong>. Une nouvelle règle vaut à partir de sa date, jamais en arrière.</p>
      <Etat lu={lu} erreur={erreur} />
      {lu !== null && lu.disponible && (
        <>
          <ol className="plo-versions" data-historique-regles>
            {[...lu.regles].reverse().map((r) => (
              <li key={r.depuis} data-regle={r.depuis}>
                <p className="plo-version-titre"><strong>Applicable à partir du {dateFr(r.depuis)}</strong>
                  {enVigueur?.depuis === r.depuis && <span className="plo-pastille plo-pastille--vigueur">en vigueur</span>}
                  {r.depuis > jour && <span className="plo-pastille">à venir</span>}</p>
                <p className="plo-version-valeurs">Taux {pourcent(r.tauxNegociateur)} · prime logement {euros(r.primeLogement)} · prime local {euros(r.primeLocal ?? r.primeLogement)} · prime parking {euros(r.primeParking)}</p>
              </li>
            ))}
          </ol>
          {regle === null ? (
            <button type="button" className="svv-btn svv-btn-outline gst-btn plo-ajout" data-nouvelle-regle
              onClick={() => { g.effacer(); setRegle({ depuis: jour, tauxNegociateur: enVigueur ? String(Math.round(enVigueur.tauxNegociateur * 1000000) / 10000).replace('.', ',') : '',
                primeLogement: enVigueur ? String(enVigueur.primeLogement).replace('.', ',') : '',
                // Arno (24/10/2026) — le local : la valeur en vigueur, ou celle du logement tant qu'aucune version ne l'a posée.
                primeLocal: enVigueur ? String(enVigueur.primeLocal ?? enVigueur.primeLogement).replace('.', ',') : '', primeParking: enVigueur ? String(enVigueur.primeParking).replace('.', ',') : '' }); }}>
              Nouvelle règle</button>
          ) : (
            <div className="plo-grille" data-saisie-regle onKeyDown={echap(() => setRegle(null))}>
              <label className="plo-champ"><span>Taux du négociateur (%)</span><input inputMode="decimal" value={regle.tauxNegociateur} onChange={(e) => setRegle({ ...regle, tauxNegociateur: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — logement (€)</span><input inputMode="decimal" value={regle.primeLogement} onChange={(e) => setRegle({ ...regle, primeLogement: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — local (€)</span><input inputMode="decimal" value={regle.primeLocal} data-prime-local onChange={(e) => setRegle({ ...regle, primeLocal: e.target.value })} /></label>
              <label className="plo-champ"><span>Prime nouvelle gestion — parking (€)</span><input inputMode="decimal" value={regle.primeParking} onChange={(e) => setRegle({ ...regle, primeParking: e.target.value })} /></label>
              <label className="plo-champ"><span>Applicable à partir du</span><input type="date" value={regle.depuis} onChange={(e) => setRegle({ ...regle, depuis: e.target.value })} /></label>
              <span className="plo-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRegle(null)} data-annuler-regle>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={g.envoi} data-enregistrer-regle
                  onClick={() => { void g.faire({ action: 'regle', regle }, 'Nouvelle règle de commission enregistrée.').then((ok) => { if (ok) setRegle(null); }); }}>Enregistrer</button>
              </span>
            </div>
          )}
          <h3 className="plo-h3">Rétrocessions</h3>
          <p className="plo-muet plo-petit-texte">Retranchées de la commission du négociateur, le mois indiqué (ex. « Alex Coms », août 2026).</p>
          <ol className="plo-versions" data-liste-retrocessions>
            {lu.retrocessions.map((r) => (
              <li key={r.id} data-retrocession={r.id}>
                <p className="plo-version-titre"><strong>{r.libelle}</strong> — {euros(r.montant)}</p>
                <p className="plo-muet plo-petit-texte">{r.negociateurLibelle} · {moisFr(r.mois)}</p>
                <button type="button" className="plo-lien" disabled={g.envoi} data-annuler-retrocession={r.id}
                  onClick={() => { void g.faire({ action: 'annuler-retrocession', id: r.id }, 'Rétrocession annulée (elle reste au journal).'); }}>Annuler cette rétrocession</button>
              </li>
            ))}
          </ol>
          <div className="plo-grille" data-ajout-retrocession>
            <label className="plo-champ"><span>Négociateur</span>
              <ListeChoix options={lu.negociateurs} valeur={retro.negociateurId} libelle="Négociateur"
                onChange={(v) => setRetro({ ...retro, negociateurId: v })} donnees={{ 'data-retro-negociateur': '' }} /></label>
            <label className="plo-champ"><span>Mois</span><input type="month" value={retro.mois} onChange={(e) => setRetro({ ...retro, mois: e.target.value })} /></label>
            <label className="plo-champ"><span>Montant (€)</span><input inputMode="decimal" value={retro.montant} onChange={(e) => setRetro({ ...retro, montant: e.target.value })} /></label>
            <label className="plo-champ"><span>Libellé</span><input value={retro.libelle} placeholder="ex. Alex Coms" onChange={(e) => setRetro({ ...retro, libelle: e.target.value })} /></label>
          </div>
          <button type="button" className="svv-btn svv-btn-primary gst-btn plo-ajout" disabled={g.envoi} data-ajouter-retrocession
            onClick={() => {
              const n = lu.negociateurs.find((x) => String(x.id) === retro.negociateurId);
              void g.faire({ action: 'retrocession', retrocession: { negociateurId: n?.id ?? null, negociateurLibelle: n?.libelle ?? '', mois: retro.mois, montant: retro.montant, libelle: retro.libelle } },
                'Rétrocession enregistrée.').then((ok) => { if (ok) setRetro({ ...retro, montant: '', libelle: '' }); });
            }}>+ Ajouter la rétrocession</button>
        </>
      )}
      {g.retour}
    </section>
  );
}

export const CSS_ONGLETS_SUIVI = CSS_REGLAGE_APPORTEUR + CSS_PANNEAUX_APPORTEUR + CSS_CUMUL_CONDITIONS + `
.plo-champ--large{grid-column:1 / -1}
.plo-modes{display:flex;flex-wrap:wrap;gap:8px}
.plo-mode{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.plo-mode[aria-checked="true"],.plo-mode[aria-pressed="true"]{border-color:var(--color-svv-red);background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.plo-mode:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.plo-a-rattacher{border-color:var(--color-svv-amber) !important;background:var(--color-svv-amber-soft)}
.plo-pastille--orange{background:var(--color-svv-amber);color:var(--color-svv-surface);border-color:transparent}
.plo-gestes-ligne{display:flex;flex-wrap:wrap;gap:8px}
.plo-filtre-rattacher{margin:0 0 8px}
.plo-tri{max-width:320px;margin:0 0 8px}
.plo-totaux{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.plo-totaux li{display:flex;flex-direction:column;gap:2px;align-items:flex-end;text-align:right;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:12px;padding:10px 12px}
.plo-totaux strong{font-size:1.05rem;color:var(--color-svv-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.plo-total-mot{font-size:.75rem;font-weight:700;color:var(--color-svv-muted)}
.plo-total-note{font-size:.72rem;color:var(--color-svv-muted)}
.plo-cumul-total th,.plo-cumul-total td{font-weight:800;color:var(--color-svv-ink)}
.plo-cumul td{font-variant-numeric:tabular-nums;white-space:nowrap}
/* 🔴 Arno (24/10/2026) — centrée, sur UNE ligne : la police (libellés ET montants) suit l'échelle commune de la liste (miseEnPageTotaux). */
.plo-totaux-ligne{display:flex;flex-wrap:nowrap;justify-content:center;gap:4px .6em;margin:6px auto;font-size:calc(1rem * var(--plo-echelle-totaux))}
.plo-totaux-ligne[data-replie]{flex-wrap:wrap}
.plo-totaux-ligne div{display:flex;gap:.25em;align-items:baseline;white-space:nowrap;flex-shrink:0}
.plo-totaux-ligne dt{font-size:.7em;font-weight:700;color:var(--color-svv-muted)}
.plo-totaux-ligne dd{margin:0;font-size:1.05em;font-weight:700;color:var(--color-svv-ink);font-variant-numeric:tabular-nums}
.plo-totaux-ligne .plo-total-net dt{color:var(--color-svv-ink);font-weight:800}
.plo-totaux-ligne .plo-total-net dd{font-weight:800}
/* 🔴 Arno (24/10/2026) — CHAQUE CARTE D'APPORTEUR EST UN BLOC : bordure nette sur tout le pourtour (le panneau ouvert est DEDANS), fond
   distinct de la modale, coins arrondis, ombre légère, 24 px entre deux cartes. « À rattacher » : fond ambré, même bordure. */
.plo-versions[data-liste-apporteurs]{gap:24px;--plo-echelle-totaux:1}
.plo-versions[data-liste-apporteurs]>li{border:1px solid var(--color-svv-line-strong);border-radius:16px;background:var(--color-svv-field);padding:14px 12px;
  box-shadow:0 1px 2px color-mix(in srgb, var(--color-svv-ink) 8%, transparent),0 6px 16px -10px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.plo-versions[data-liste-apporteurs]>li.plo-a-rattacher{border-color:var(--color-svv-line-strong) !important;background:var(--color-svv-amber-soft)}
.plo-versions[data-liste-apporteurs]>li [data-panneau]{background:var(--color-svv-surface)}
@media (max-width:640px){ .plo-totaux{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px} .plo-totaux li{padding:8px 6px} .plo-totaux strong{font-size:.74rem;letter-spacing:-.01em} .plo-total-mot{font-size:.68rem} }
.plo-case{display:flex;align-items:center;gap:8px;min-height:44px;font-weight:600;cursor:pointer}
.plo-case input{width:20px;height:20px;accent-color:var(--color-svv-red)}
.plo-champ input[type=date]:disabled{opacity:.5}
.plo-filtre-rattacher .svv-btn[aria-pressed="true"]{border-color:var(--color-svv-amber);color:var(--color-svv-amber)}
.plo-fiche{margin-top:10px;padding-top:10px;border-top:1px dashed var(--color-svv-line-strong);display:flex;flex-direction:column;gap:8px}
.plo-h4{margin:6px 0 0;font-size:.92rem}
.plo-cumul{width:100%;border-collapse:collapse;font-size:.88rem}
.plo-cumul th,.plo-cumul td{padding:5px 6px;border-bottom:1px solid var(--color-svv-line);text-align:right}
.plo-cumul th[scope=row],.plo-cumul thead th:first-child{text-align:left}
@media (max-width:640px){
  .plo-cumul thead{display:none}
  .plo-cumul,.plo-cumul tbody,.plo-cumul tr,.plo-cumul th,.plo-cumul td{display:block;width:100%;box-sizing:border-box}
  .plo-cumul tr{border:1px solid var(--color-svv-line);border-radius:10px;padding:4px 8px;margin-bottom:6px}
  .plo-cumul td{display:flex;justify-content:space-between;border-bottom:0}
  .plo-cumul td::before{content:attr(data-mot);color:var(--color-svv-muted);font-weight:700}
}
.plo-badge{font-size:.68rem;letter-spacing:.04em;font-weight:800}
.plo-badge--interne{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:transparent}
.plo-badge--externe{background:var(--color-svv-field);color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.plo-duree{display:flex;align-items:center;gap:6px}
.plo-duree input{max-width:90px}
.plo-remuneration{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field)}
.plo-dossiers{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.plo-dossiers>li{border:0;padding:0;background:none;box-shadow:none}
.plo-dossier-titre{display:block;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);margin-bottom:2px}
.plo-sorti-filtre{border-style:dashed !important;color:var(--color-svv-green-ink);font-weight:700}
.plo-select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%}
`;
