'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ecouterClassement } from '../../../../lib/gestion/signalClassement';
import {
  AIDE_PASTILLE_ONE_SHOT, MOT_MODIFIE_POUR_CE_MAIL, MOT_SUIVI_DE_FOND, PHRASE_AUTRES_MAILS, TITRE_MODALE_ONE_SHOT,
  motParLe, motPastilleOneShot, type ModificationOneShot,
} from '../../../../lib/gestion/suiviOneShot';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LE CARTOUCHE ROUGE ET SA MODALE ══════════════════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Sur la 1re ligne de la carte du mail, juste après “reçu de …” : petit cartouche à
 * contour rouge et texte rouge, “Suivi modifié en one shot”. Même hauteur que les pastilles “Auto” / “Événement en
 * cours”. […] Visible dans l'historique du bien, et partout où la carte de ce mail apparaît. »
 *
 * ═══ 🔴🔴 UN CHARGEUR GROUPÉ, ET NON UNE PROP DE PLUS SUR CHAQUE LISTE ════════════════════════════════════════════
 *
 * La carte d'un mail est rendue par plusieurs écrans (`LigneVie` à elle seule en a quatre). Faire passer la donnée
 * par chaque parent aurait touché chacun d'eux — et oublié le cinquième. Chaque pastille DEMANDE donc son mail ; les
 * demandes d'un même rendu sont réunies en UNE requête (`/api/admin/gestion/one-shot?messages=…`), et la réponse est
 * gardée pour la page. Un geste de classement (`annoncerClassement`) vide la mémoire : la pastille se relit.
 *
 * ═══ 🔴 ELLE VIT DANS UN BOUTON, ET C'EST LA CONTRAINTE QUI DÉCIDE DE SA FORME ═══════════════════════════════════
 *
 * Les trois lignes qui la portent SONT des boutons (déplier, ouvrir). Un bouton dans un bouton est du HTML invalide :
 * la pastille est donc un `span` dont le clic est ARRÊTÉ avant d'atteindre la ligne (sans quoi la carte se plierait
 * en même temps que la modale s'ouvre). Même patron que la mention « ✎ Brouillon » de `Conversation`. Et la modale
 * part dans un PORTAIL : rendue dans la ligne, ses propres clics remonteraient au bouton.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Entree = ModificationOneShot[];

const memoire = new Map<number, Entree>();
const enAttente = new Set<number>();
const abonnes = new Map<number, Set<() => void>>();
let minuterie: ReturnType<typeof setTimeout> | null = null;
let ecoute: (() => void) | null = null;

function prevenir(ids: Iterable<number>): void {
  for (const id of ids) for (const f of abonnes.get(id) ?? []) f();
}

async function charger(): Promise<void> {
  minuterie = null;
  const ids = [...enAttente];
  enAttente.clear();
  if (ids.length === 0) return;
  try {
    const r = await fetch(`/api/admin/gestion/one-shot?messages=${ids.join(',')}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { etat?: string; parMail?: Record<string, Entree> };
    if (!r.ok || j.etat !== 'ok') return;
    for (const id of ids) memoire.set(id, j.parMail?.[String(id)] ?? []);
  } catch {
    /* ⚠️ SILENCIEUX : aucune pastille plutôt qu'une carte cassée. */
    return;
  }
  prevenir(ids);
}

function demander(id: number): void {
  if (memoire.has(id) || enAttente.has(id)) return;
  enAttente.add(id);
  if (minuterie === null) minuterie = setTimeout(() => { void charger(); }, 0);
}

/** Un geste de classement a eu lieu : tout ce qui est affiché se relit (le fond d'un fil peut avoir bougé). */
function brancherEcoute(): void {
  if (ecoute !== null) return;
  ecoute = ecouterClassement(() => {
    memoire.clear();
    for (const id of abonnes.keys()) demander(id);
  });
}

/** Les modifications « ce mail uniquement » d'un mail. `[]` tant qu'on ne sait pas, ou s'il n'y en a aucune. */
export function useOneShot(messageId: number | null | undefined): Entree {
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
  return typeof messageId === 'number' ? memoire.get(messageId) ?? [] : [];
}

/** Pour les épreuves : repartir d'une page neuve. */
export function viderMemoireOneShot(): void {
  memoire.clear();
  enAttente.clear();
  if (minuterie !== null) { clearTimeout(minuterie); minuterie = null; }
}

/**
 * LA PASTILLE. `classe` = la capsule de la liste hôte (`vdb-capsule`, `cnv-capsule`, `bte-capsule`) : c'est elle qui
 * donne la MÊME HAUTEUR que « Auto » et « Événement en cours ». `svv-oneshot` n'y ajoute que la couleur.
 */
export function PastilleOneShot({ messageId, classe }: { messageId: number | null | undefined; classe: string }) {
  const modifs = useOneShot(messageId);
  const [ouverte, setOuverte] = useState(false);
  const mot = motPastilleOneShot(modifs.length);
  if (mot === null) return null;
  const arreter = (e: { stopPropagation: () => void; preventDefault: () => void }): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  return (
    <>
      <style>{CSS_PASTILLE_ONE_SHOT}</style>
      <span className={`${classe} svv-oneshot`} title={AIDE_PASTILLE_ONE_SHOT} data-one-shot={modifs.length}
        onClick={(e) => { arreter(e); setOuverte(true); }}
        onMouseDown={(e) => e.stopPropagation()}>
        {mot}
      </span>
      {ouverte && typeof document !== 'undefined' && createPortal(
        <ModaleOneShot modifs={modifs} onFermer={() => setOuverte(false)} />,
        /* Le portail vise `.svv-adm-root`, pas `body` : c'est là que vivent les couleurs du thème Sombre
           (même règle que `BoutonSyndic`). */
        document.querySelector('.svv-adm-root') ?? document.body)}
    </>
  );
}

/** LA MODALE, en lecture seule : aucune action de modification (demande d'Arno). */
export function ModaleOneShot({ modifs, onFermer }: { modifs: readonly ModificationOneShot[]; onFermer: () => void }) {
  const boite = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const auClavier = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onFermer(); }
    };
    document.addEventListener('keydown', auClavier, true);
    boite.current?.focus();
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [onFermer]);

  return (
    /* ⚠️ LE CLIC S'ARRÊTE ICI : React fait remonter les événements d'un portail le long de l'arbre des COMPOSANTS,
       donc jusqu'au bouton de la ligne. Sans cet arrêt, « Fermer » plierait aussi la carte. */
    <div className="osm-voile" role="presentation"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onFermer(); }}
      onMouseDown={(e) => e.stopPropagation()}>
      <style>{CSS_PASTILLE_ONE_SHOT}</style>
      <div className="osm" role="dialog" aria-modal="true" aria-labelledby="osm-titre" tabIndex={-1} ref={boite}>
        <h2 className="osm-titre" id="osm-titre">{TITRE_MODALE_ONE_SHOT}</h2>
        <ul className="osm-liste">
          {modifs.map((m, i) => (
            <li key={`${i}-${m.modifie}`} className="osm-modif">
              <p className="osm-ligne"><span className="osm-mot">{MOT_SUIVI_DE_FOND} :</span> {m.fond}</p>
              <p className="osm-ligne osm-ligne--apres">
                <span className="osm-mot">{MOT_MODIFIE_POUR_CE_MAIL} :</span> {m.modifie}
              </p>
              <p className="osm-ligne osm-qui">{motParLe(m.par, m.le)}</p>
            </li>
          ))}
        </ul>
        <p className="osm-phrase">{PHRASE_AUTRES_MAILS}</p>
        <div className="osm-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE GABARIT : il fermerait le litteral (piege connu du depot). */
export const CSS_PASTILLE_ONE_SHOT = `
.svv-oneshot.svv-oneshot{background:transparent;color:var(--color-svv-red);border:1px solid var(--color-svv-red);
  cursor:pointer;white-space:nowrap}
.svv-oneshot.svv-oneshot:hover{color:var(--color-svv-red-dark);border-color:var(--color-svv-red-dark)}
.osm-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45);text-align:left;cursor:default}
.osm{width:min(40rem,100%);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:.7rem;
  padding:16px;border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 12px 40px rgba(17,19,24,.25);color:var(--color-svv-ink)}
.osm:focus{outline:none}
.osm-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}
.osm-liste{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.osm-modif{padding:10px 12px;border-radius:10px;background:var(--color-svv-field);
  box-shadow:inset 2px 0 0 var(--color-svv-red);font-size:.85rem}
.osm-ligne{margin:0 0 .25rem;overflow-wrap:anywhere;color:var(--color-svv-ink)}
.osm-ligne--apres{font-weight:600}
.osm-mot{font-weight:700;color:var(--color-svv-muted)}
.osm-qui{margin:0;font-size:.78rem;color:var(--color-svv-muted)}
.osm-phrase{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
.osm-boutons{display:flex;justify-content:flex-end;gap:8px}
`;
