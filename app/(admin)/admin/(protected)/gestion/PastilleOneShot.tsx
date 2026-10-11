'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ecouterClassement } from '../../../../lib/gestion/signalClassement';
import {
  AIDE_PASTILLE_ONE_SHOT, PHRASE_AUTRES_MAILS, TITRE_MODALE_ONE_SHOT, motPastilleOneShot, type ModificationOneShot,
} from '../../../../lib/gestion/suiviOneShot';
/* 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — la fenêtre en deux colonnes, commune avec le « i » de l'accolade. */
import { SUFFIXE_CE_MAIL, type GesteAvantApres } from '../../../../lib/gestion/avantApres';
import { ModaleAvantApres } from './ModaleAvantApres';

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
/** 🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — l'avant / après structuré de chaque geste, pour la fenêtre. */
const memoireGestes = new Map<number, GesteAvantApres[]>();
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
    const j = (await r.json().catch(() => ({}))) as {
      etat?: string; parMail?: Record<string, Entree>; gestes?: Record<string, GesteAvantApres[]>;
    };
    if (!r.ok || j.etat !== 'ok') return;
    for (const id of ids) {
      memoire.set(id, j.parMail?.[String(id)] ?? []);
      memoireGestes.set(id, j.gestes?.[String(id)] ?? []);
    }
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
    memoireGestes.clear();
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
  memoireGestes.clear();
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
        <ModaleAvantApres titre={TITRE_MODALE_ONE_SHOT}
          gestes={typeof messageId === 'number' ? memoireGestes.get(messageId) ?? [] : []}
          suffixeApres={SUFFIXE_CE_MAIL} phrase={PHRASE_AUTRES_MAILS} onFermer={() => setOuverte(false)} />,
        /* Le portail vise `.svv-adm-root`, pas `body` : c'est là que vivent les couleurs du thème Sombre
           (même règle que `BoutonSyndic`). */
        document.querySelector('.svv-adm-root') ?? document.body)}
    </>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE GABARIT : il fermerait le litteral (piege connu du depot). */
export const CSS_PASTILLE_ONE_SHOT = `
.svv-oneshot.svv-oneshot{background:transparent;color:var(--color-svv-red);border:1px solid var(--color-svv-red);
  cursor:pointer;white-space:nowrap}
.svv-oneshot.svv-oneshot:hover{color:var(--color-svv-red-dark);border-color:var(--color-svv-red-dark)}
`;
