'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ecouterClassement } from '../../../../lib/gestion/signalClassement';
import { motBiensRattaches } from '../../../../lib/gestion/changementsSuivi';

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
      {n !== null && <span className="cbm-biens">{motBiensRattaches(n)}</span>}
    </span>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre). Le meme gris que la date, un
   cran plus petit. */
export const CSS_COMPTEUR_BIENS = `
.cbm-pile{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;flex:0 0 auto;min-width:0;
  text-align:right}
.cbm-biens{font-size:.7rem;line-height:1.2;color:var(--color-svv-muted);white-space:nowrap}
`;
