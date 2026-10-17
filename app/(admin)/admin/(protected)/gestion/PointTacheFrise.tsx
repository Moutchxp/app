'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bulleTacheFrise, dateMissionTache, tacheGrisee, type TacheFrise } from '../../../../lib/gestion/tacheFrise';
import { placerBulleBiens } from '../../../../lib/gestion/bulleBiensMail';
import { CSS_COMPTEUR_BIENS } from './CompteurBiensMail';
import { hoteDeLaBulle } from './InfoBien';
import { fermerQuandLaPagePerdLeFocus } from './fermetureMenu';

/**
 * ══ 🔴🔴 LOT GESTION-TACHES-EVENEMENTS (17/10/2026) — LE POINT D'UNE TÂCHE DANS LA FRISE D'UN ÉVÉNEMENT ════════════
 *
 * ARNO : « un petit POINT ROUGE placé à la date de la mission […] ; refusée par tous ou annulée : le point reste mais en
 * gris (historique). Au survol du point (et au focus clavier) : une bulle avec toutes les informations du récapitulatif
 * […], même composant de bulle que les autres (1 élément = 1 ligne). Au clic : ouvre la tâche. »
 *
 * 🔴 LA BULLE EST CELLE DES AUTRES BULLES DU MODULE : `.cbm-bulle` (surface, bordure, ombre, largeur au contenu), posée
 * par `placerBulleBiens` dans l'hôte commun, avec son titre en gras et UNE LIGNE PAR ÉLÉMENT (invité, contact, pièce).
 * Elle ne touche à aucune des bulles de la frise (celles des cartes et des messages), qui restent les leurs.
 *
 * ⚠️ PAS DE `data-carte` : le point n'est pas une carte de la frise — il ne se glisse pas, et l'ordre des cartes envoyé
 * au serveur (`useGlisserCarte`) ne doit pas le compter. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
let fermerLaBulleOuverte: (() => void) | null = null;

export function PointsTachesFrise({ taches, onOuvrir }: { taches: readonly TacheFrise[]; onOuvrir: (id: number) => void }) {
  return (
    <span className="fav-taches">
      {taches.map((t) => <PointTache key={t.id} t={t} onOuvrir={onOuvrir} />)}
    </span>
  );
}

function PointTache({ t, onOuvrir }: { t: TacheFrise; onOuvrir: (id: number) => void }) {
  const grise = tacheGrisee(t);
  const libelle = `Tâche « ${t.objet} » — ${dateMissionTache(t.jour, t.heure, t.dureeMinutes)}${grise ? ' (historique)' : ''}`;
  return (
    <DeclencheurBulleTache t={t} onOuvrir={onOuvrir} libelle={libelle}
      className={`fav-point-tache${grise ? ' fav-point-tache--gris' : ''}`} donnees={{ 'data-tache-frise': t.id, 'data-grise': grise ? 'oui' : 'non' }}>
      <span className="fav-sr">{libelle}</span>
    </DeclencheurBulleTache>
  );
}

/**
 * 🔴 LOT GESTION-HISTORIQUE-TACHES — LE DÉCLENCHEUR DE LA BULLE D'UNE TÂCHE, partagé : le point de la frise ET la ligne
 * de l'« Historique des tâches » du bien. Survol et focus clavier : la bulle du récapitulatif ; clic : ouvre la tâche.
 */
export function DeclencheurBulleTache({ t, onOuvrir, libelle, className, donnees = {}, children }: {
  t: TacheFrise; onOuvrir: (id: number) => void; libelle: string; className: string;
  donnees?: Record<string, string | number>; children: React.ReactNode;
}) {
  const declencheur = useRef<HTMLButtonElement | null>(null);
  const bulle = useRef<HTMLDivElement | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ouverte, setOuverte] = useState(false);
  const [place, setPlace] = useState<ReturnType<typeof placerBulleBiens> | null>(null);
  const idBulle = `fav-tache-bulle-${t.id}-${useId().replace(/:/g, '')}`;
  const contenu = bulleTacheFrise(t);

  const annuler = (): void => { if (minuteur.current !== null) { clearTimeout(minuteur.current); minuteur.current = null; } };
  const fermer = useCallback((): void => { annuler(); setOuverte(false); setPlace(null); }, []);
  const ouvrir = (): void => {
    annuler();
    if (fermerLaBulleOuverte !== null && fermerLaBulleOuverte !== fermer) fermerLaBulleOuverte();
    fermerLaBulleOuverte = fermer;
    setOuverte(true);
  };
  const fermerBientot = (): void => { annuler(); minuteur.current = setTimeout(fermer, 180); };

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
    return () => { window.removeEventListener('resize', mesurer); document.removeEventListener('scroll', mesurer, true); };
  }, [ouverte]);

  useEffect(() => {
    if (!ouverte) return undefined;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', clavier, true);
    const lacher = fermerQuandLaPagePerdLeFocus(fermer);
    return () => { document.removeEventListener('keydown', clavier, true); lacher(); };
  }, [ouverte, fermer]);
  useEffect(() => () => { annuler(); if (fermerLaBulleOuverte === fermer) fermerLaBulleOuverte = null; }, [fermer]);

  const laBulle = (
    <div className="cbm-bulle fav-tache-bulle" id={idBulle} role="tooltip" ref={bulle} data-bulle-tache={t.id}
      style={place === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: place.gauche, top: place.haut, maxHeight: place.hauteurMax }}
      onMouseEnter={annuler} onMouseLeave={fermerBientot}>
      <style>{CSS_COMPTEUR_BIENS}</style>
      <p className="cbm-bulle-titre">Tâche · {contenu.titre}</p>
      {contenu.etat !== null && <p className="cbm-bulle-mot">{contenu.etat}</p>}
      {contenu.parties.map((p) => (
        <div key={p.titre} className="fav-tache-partie">
          <p className="cbm-bulle-lot fav-tache-partie-titre">{p.titre}</p>
          <ul className="cbm-bulle-liste">
            {p.lignes.map((l, i) => (
              <li key={`${p.titre}-${i}`} className="cbm-bulle-ligne">
                <span className="cbm-bulle-bien">{l.texte}</span>
                {l.discret !== undefined && <span className="cbm-bulle-lot">{l.discret}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="cbm-bulle-lot fav-tache-aide">Un clic ouvre la tâche.</p>
    </div>
  );

  return (
    <>
      <button type="button" ref={declencheur} {...donnees} className={className}
        aria-label={libelle} aria-describedby={ouverte ? idBulle : undefined}
        onMouseEnter={ouvrir} onMouseLeave={fermerBientot} onFocus={ouvrir} onBlur={fermerBientot}
        onClick={() => { fermer(); onOuvrir(t.id); }}>
        {children}
      </button>
      {ouverte && typeof document !== 'undefined' && createPortal(laBulle, hoteDeLaBulle())}
    </>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre). Le point est PETIT et ne prend
   que sa place (10 px + une cible tactile de 24 px), comme les points des messages : les carres ne bougent pas. */
export const CSS_POINT_TACHE_FRISE = `
/* POSE SUR LE FIL, a mi-hauteur des carres (meme regle que les points des messages et les + intercalaires). */
.fav-el--taches{align-self:flex-start;padding-top:calc(var(--fav-mi-carre, 59px) - 12px)}
.fav-taches{display:inline-flex;align-items:center;gap:2px}
.fav-point-tache{position:relative;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
  padding:0;border:0;background:none;cursor:pointer}
.fav-point-tache::before{content:'';display:block;width:10px;height:10px;border-radius:50%;background:var(--color-svv-red);
  box-shadow:0 0 0 2px var(--color-svv-surface)}
.fav-point-tache--gris::before{background:var(--color-svv-muted)}
.fav-point-tache:hover::before,.fav-point-tache:focus-visible::before{transform:scale(1.3)}
.fav-point-tache:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px;border-radius:50%}
.fav-tache-partie{margin-top:6px}
.fav-tache-partie-titre{margin:0 0 2px;font-weight:600}
.fav-tache-aide{margin:8px 0 0}
`;
