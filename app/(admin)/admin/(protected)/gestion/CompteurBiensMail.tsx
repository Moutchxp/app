'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ecouterClassement } from '../../../../lib/gestion/signalClassement';
import { motBiensRattaches } from '../../../../lib/gestion/changementsSuivi';
import { ligneDeLaBulle, placerBulleBiens, type BienDeLaBulle } from '../../../../lib/gestion/bulleBiensMail';
import { hoteDeLaBulle } from './InfoBien';

/**
 * ══ 🔴🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — « N BIENS RATTACHÉS » SOUS LA DATE DE CHAQUE LIGNE DE MAIL ══════
 *
 * DEMANDE D'ARNO (12/10/2026) : « Sur chaque ligne de mail, repliée ET dépliée, afficher juste EN DESSOUS de la date et
 * de l'heure, aligné à droite sous elle : “1 bien rattaché”, “3 biens rattachés” ou “aucun bien rattaché”. Style
 * discret. […] Partout où une ligne de mail s'affiche : historique d'un bien, vue conversation, boîte mail. Calcul
 * groupé pour toute la page. Après une validation dans la fenêtre de rattachement, le chiffre se met à jour sans
 * recharger la page. »
 *
 * 🔴 UN CHARGEUR GROUPÉ, comme la pastille « one shot » : chaque ligne DEMANDE son mail, les demandes d'un même rendu
 * partent en UNE requête (`/api/admin/gestion/biens-par-mail?messages=…`), la réponse est gardée pour la page. Un
 * geste de classement (`annoncerClassement`, émis par la fenêtre de rattachement) vide la mémoire : tout ce qui est
 * affiché se relit.
 * 🔴 LE CHIFFRE EST CELUI DE LA FENÊTRE « Bien(s) rattaché(s) à ce mail » (même règle, voir `compteBiensMailRepo`).
 * ⚠️ TANT QU'ON NE SAIT PAS, RIEN N'EST ÉCRIT : un « aucun bien rattaché » provisoire mentirait le temps d'une requête.
 */

const memoire = new Map<number, number>();
const enAttente = new Set<number>();
const abonnes = new Map<number, Set<() => void>>();
let minuterie: ReturnType<typeof setTimeout> | null = null;
let ecoute: (() => void) | null = null;
const LOT = 500;

async function charger(): Promise<void> {
  minuterie = null;
  const tous = [...enAttente];
  enAttente.clear();
  for (let i = 0; i < tous.length; i += LOT) {
    const ids = tous.slice(i, i + LOT);
    try {
      const r = await fetch(`/api/admin/gestion/biens-par-mail?messages=${ids.join(',')}`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { etat?: string; parMail?: Record<string, number> };
      if (!r.ok || j.etat !== 'ok') continue;
      for (const id of ids) {
        const n = j.parMail?.[String(id)];
        if (typeof n === 'number') memoire.set(id, n);
      }
    } catch {
      continue;
    }
    for (const id of ids) for (const f of abonnes.get(id) ?? []) f();
  }
}

function demander(id: number): void {
  if (memoire.has(id) || enAttente.has(id)) return;
  enAttente.add(id);
  if (minuterie === null) minuterie = setTimeout(() => { void charger(); }, 0);
}

function brancherEcoute(): void {
  if (ecoute !== null) return;
  ecoute = ecouterClassement(() => {
    memoire.clear();
    /* 🔴 LOT BULLE-BIENS-RATTACHES — le détail des bulles se relit lui aussi après un geste. */
    memoireDetail.clear();
    for (const id of abonnes.keys()) demander(id);
  });
}

/** Le nombre de biens rattachés à ce mail ; `null` tant qu'on ne sait pas. */
export function useBiensRattaches(messageId: number | null | undefined): number | null {
  const [, forcer] = useState(0);
  useEffect(() => {
    if (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId <= 0) return undefined;
    brancherEcoute();
    const f = (): void => forcer((n) => n + 1);
    const s = abonnes.get(messageId) ?? new Set<() => void>();
    s.add(f);
    abonnes.set(messageId, s);
    demander(messageId);
    return () => {
      s.delete(f);
      if (s.size === 0) abonnes.delete(messageId);
    };
  }, [messageId]);
  return typeof messageId === 'number' ? memoire.get(messageId) ?? null : null;
}

/** Pour les épreuves : repartir d'une page neuve. */
export function viderMemoireBiensRattaches(): void {
  memoire.clear();
  enAttente.clear();
  if (minuterie !== null) { clearTimeout(minuterie); minuterie = null; }
}

/**
 * LA DATE ET, JUSTE DESSOUS, ALIGNÉ À DROITE, LE NOMBRE DE BIENS. `date` est l'élément de date de la liste hôte, rendu
 * tel quel (sa classe, son info-bulle, son format) : rien ne change pour lui, il gagne seulement un voisin du dessous.
 */
export function DateEtBiens({ messageId, date }: { messageId: number | null | undefined; date: ReactNode }) {
  const n = useBiensRattaches(messageId);
  return (
    /* ⚠️ SA FEUILLE (CSS_COMPTEUR_BIENS) EST DANS CELLE DE CHAQUE LISTE HÔTE, une fois : une balise style par ligne
       ajouterait son texte à celui de la ligne. */
    <span className="cbm-pile">
      {date}
      {n !== null && (n > 0 && typeof messageId === 'number'
        ? <CompteurAvecBulle messageId={messageId} mot={motBiensRattaches(n)} />
        /* 🔴 « aucun bien rattaché » : pas de bulle (Arno). */
        : <span className="cbm-biens">{motBiensRattaches(n)}</span>)}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT BULLE-BIENS-RATTACHES — LA BULLE DU COMPTEUR
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (12/10/2026) : « Quand je passe le curseur sur “N biens rattachés”, une bulle s'ouvre. Elle s'ouvre
   aussi au focus clavier et au toucher sur téléphone. Les détails sont chargés au premier survol, puis gardés en
   mémoire pour la page. Style : celui des bulles “i” existantes. »

   🔴 ELLE VIT DANS UNE LIGNE-BOUTON (déplier le mail) : le déclencheur est donc un `span` focalisable, et ses clics et
   touches sont ARRÊTÉS avant la ligne (même patron que la pastille « one shot »). La bulle part dans un PORTAIL vers la
   racine de l'administration (`hoteDeLaBulle`, pour hériter du thème) en `position:fixed` : rien ne la rogne, et
   `placerBulleBiens` la garde entière dans l'écran.
   🔴 UNE SEULE BULLE OUVERTE À LA FOIS, comme les bulles « i ». */

type EtatDetail = { v: 'charge' } | { v: 'ok'; biens: BienDeLaBulle[] } | { v: 'erreur' };
const memoireDetail = new Map<number, BienDeLaBulle[]>();
let fermerLaBulleOuverte: (() => void) | null = null;

function CompteurAvecBulle({ messageId, mot }: { messageId: number; mot: string }) {
  const declencheur = useRef<HTMLSpanElement | null>(null);
  const bulle = useRef<HTMLDivElement | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ⚠️ AU TOUCHER, LE NAVIGATEUR SIMULE D'ABORD UN SURVOL (qui ouvre), PUIS UN CLIC : ce clic ne doit pas refermer ce
   * qu'il vient d'ouvrir. Mesuré dans Chrome en mode tactile : sans cette garde, la bulle s'ouvrait et se refermait.
   */
  const ouverteLe = useRef(0);
  const [ouverte, setOuverte] = useState(false);
  const [etat, setEtat] = useState<EtatDetail>({ v: 'charge' });
  const [place, setPlace] = useState<ReturnType<typeof placerBulleBiens> | null>(null);
  const idBulle = `cbm-bulle-${messageId}`;

  const annulerFermeture = (): void => {
    if (minuteur.current !== null) { clearTimeout(minuteur.current); minuteur.current = null; }
  };
  const fermer = useCallback((): void => {
    annulerFermeture();
    setOuverte(false);
    setPlace(null);
  }, []);
  const ouvrir = (): void => {
    annulerFermeture();
    if (ouverte) return;
    if (fermerLaBulleOuverte !== null && fermerLaBulleOuverte !== fermer) fermerLaBulleOuverte();
    fermerLaBulleOuverte = fermer;
    ouverteLe.current = Date.now();
    setOuverte(true);
  };
  /* ⚠️ UN PETIT DÉLAI POUR SORTIR : le curseur doit pouvoir passer du texte à la bulle sans qu'elle se ferme. */
  const fermerBientot = (): void => {
    annulerFermeture();
    minuteur.current = setTimeout(fermer, 180);
  };

  /* 🔴 LE DÉTAIL, AU PREMIER SURVOL SEULEMENT, puis gardé pour la page (et relu après un geste de classement). */
  useEffect(() => {
    if (!ouverte) return undefined;
    const connu = memoireDetail.get(messageId);
    if (connu !== undefined) { setEtat({ v: 'ok', biens: connu }); return undefined; }
    let vivant = true;
    setEtat({ v: 'charge' });
    void (async () => {
      try {
        const r = await fetch(`/api/admin/gestion/biens-par-mail?detail=${messageId}`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { etat?: string; biens?: BienDeLaBulle[] };
        if (!vivant) return;
        if (!r.ok || j.etat !== 'ok') { setEtat({ v: 'erreur' }); return; }
        memoireDetail.set(messageId, j.biens ?? []);
        setEtat({ v: 'ok', biens: j.biens ?? [] });
      } catch { if (vivant) setEtat({ v: 'erreur' }); }
    })();
    return () => { vivant = false; };
  }, [ouverte, messageId]);

  /* LA PLACE : mesurée avant d'être peinte, et recalculée au défilement (en capture) et au redimensionnement. */
  useLayoutEffect(() => {
    if (!ouverte) return undefined;
    const mesurer = (): void => {
      const d = declencheur.current?.getBoundingClientRect();
      const b = bulle.current;
      if (d === undefined || b === null) return;
      setPlace(placerBulleBiens({
        declencheur: { gauche: d.left, haut: d.top, largeur: d.width, hauteur: d.height },
        bulle: { largeur: b.offsetWidth, hauteur: b.scrollHeight },
        fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
      }));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    document.addEventListener('scroll', mesurer, true);
    return () => {
      window.removeEventListener('resize', mesurer);
      document.removeEventListener('scroll', mesurer, true);
    };
  }, [ouverte, etat]);

  /* SORTIES : Échap, et un toucher / clic ailleurs. */
  useEffect(() => {
    if (!ouverte) return undefined;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer(); };
    const ailleurs = (e: PointerEvent): void => {
      const n = e.target as Node | null;
      if (n !== null && (declencheur.current?.contains(n) || bulle.current?.contains(n))) return;
      fermer();
    };
    document.addEventListener('keydown', clavier, true);
    document.addEventListener('pointerdown', ailleurs, true);
    return () => {
      document.removeEventListener('keydown', clavier, true);
      document.removeEventListener('pointerdown', ailleurs, true);
    };
  }, [ouverte, fermer]);
  useEffect(() => () => {
    annulerFermeture();
    if (fermerLaBulleOuverte === fermer) fermerLaBulleOuverte = null;
  }, [fermer]);

  /* ⚠️ LE CLIC ET LES TOUCHES S'ARRÊTENT ICI : sinon la ligne se plierait / déplierait en même temps. */
  const arreter = (e: { stopPropagation: () => void; preventDefault: () => void }): void => {
    e.stopPropagation();
    e.preventDefault();
  };

  const contenu = (
    <div className="cbm-bulle" id={idBulle} role="tooltip" ref={bulle}
      style={place === null
        ? { visibility: 'hidden', left: 0, top: 0 }
        : { left: place.gauche, top: place.haut, maxHeight: place.hauteurMax }}
      onMouseEnter={annulerFermeture} onMouseLeave={fermerBientot}
      onClick={(e) => e.stopPropagation()}>
      {etat.v === 'charge' && <p className="cbm-bulle-mot">Chargement…</p>}
      {etat.v === 'erreur' && <p className="cbm-bulle-mot">Les biens n’ont pas pu être lus.</p>}
      {etat.v === 'ok' && (
        <ul className="cbm-bulle-liste">
          {etat.biens.map((b) => {
            const l = ligneDeLaBulle(b);
            return (
              <li key={b.cle} className="cbm-bulle-ligne">
                <span className="cbm-bulle-bien">{l.bien}</span>
                <span className="cbm-bulle-proprio">{l.proprietaire}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <span className={`cbm-biens cbm-biens--bulle${ouverte ? ' cbm-biens--ouverte' : ''}`} ref={declencheur}
        role="button" tabIndex={0} aria-expanded={ouverte} aria-describedby={ouverte ? idBulle : undefined}
        onMouseEnter={ouvrir} onMouseLeave={fermerBientot}
        onFocus={ouvrir} onBlur={fermerBientot}
        onClick={(e) => {
          arreter(e);
          if (!ouverte) ouvrir();
          else if (Date.now() - ouverteLe.current > 600) fermer();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { arreter(e); if (ouverte) fermer(); else ouvrir(); }
        }}>
        {mot}
      </span>
      {ouverte && typeof document !== 'undefined' && createPortal(contenu, hoteDeLaBulle())}
    </>
  );
}

/** Pour les épreuves : repartir d'une page neuve (le détail aussi). */
export function viderMemoireBulleBiens(): void {
  memoireDetail.clear();
  fermerLaBulleOuverte = null;
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre). Le meme gris que la date, un
   cran plus petit. LOT BULLE-BIENS-RATTACHES : la bulle reprend le dessin des bulles « i » (.ifb-bulle) — surface,
   bordure line-strong, rayon, ombre — et s'elargit au contenu (max-content) jusqu'a la largeur de l'ecran moins une
   marge ; au-dela seulement, les lignes passent a la ligne proprement. */
export const CSS_COMPTEUR_BIENS = `
.cbm-pile{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;flex:0 0 auto;min-width:0;
  text-align:right}
.cbm-biens{font-size:.7rem;line-height:1.2;color:var(--color-svv-muted);white-space:nowrap}
.cbm-biens--bulle{cursor:help;border-radius:.25rem}
.cbm-biens--bulle:hover,.cbm-biens--ouverte{color:var(--color-svv-ink);text-decoration:underline dotted;
  text-underline-offset:2px}
.cbm-biens--bulle:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.cbm-bulle{position:fixed;z-index:2000;box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);
  overflow-y:auto;padding:10px 12px;font-size:.8rem;font-weight:400;font-style:normal;text-align:left;line-height:1.4;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:.6rem;box-shadow:0 10px 30px rgba(0,0,0,.22);cursor:default;white-space:normal;
  overscroll-behavior:contain}
.cbm-bulle-mot{margin:0;color:var(--color-svv-muted)}
.cbm-bulle-liste{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.cbm-bulle-ligne{display:flex;align-items:baseline;justify-content:space-between;gap:1.5rem}
.cbm-bulle-bien{min-width:0;overflow-wrap:anywhere}
.cbm-bulle-proprio{flex:0 1 auto;margin-left:auto;text-align:right;font-weight:600;overflow-wrap:anywhere}
`;
