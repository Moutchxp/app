'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — L'EXPÉDITEUR D'UN MAIL EST-IL LE SYNDIC (OU L'IMMEUBLE) DE CE BIEN ? ═══════
 *
 * Le cartouche EXPÉDITEUR se pose sur la ligne de la partie qui porte l'adresse De: du mail. Quand ce n'est ni le
 * propriétaire ni un locataire, ce peut être le syndic de la copropriété du bien, un de ses contacts, ou une
 * personne du carnet de l'immeuble — la route `/api/admin/gestion/expediteur-syndic` le dit, bien par bien, à la
 * date du mail.
 *
 * 🔴 UNE REQUÊTE PAR MAIL ET PAR LISTE AFFICHÉE : les cartes d'une même fenêtre demandent leur bien dans le même
 * tour, et le chargeur les groupe (même principe que le compteur « N biens rattachés »). Le résultat est gardé pour
 * la page : la fiche syndic ne change pas sous les yeux pendant qu'on rattache un mail.
 * 🔒 LECTURE SEULE ; le mail est désigné par son identifiant, jamais par une adresse.
 */
export interface ExpediteurSyndical { role: string; nom: string }

const memoire = new Map<string, ExpediteurSyndical | null>();
const enAttente = new Map<number, Set<string>>();
const abonnes = new Map<string, Set<() => void>>();
let minuterie: ReturnType<typeof setTimeout> | null = null;

const cleDe = (messageId: number, bien: string): string => `${messageId}|${bien}`;

async function charger(): Promise<void> {
  minuterie = null;
  const lots = [...enAttente];
  enAttente.clear();
  for (const [messageId, biens] of lots) {
    const liste = [...biens];
    try {
      const r = await fetch(
        `/api/admin/gestion/expediteur-syndic?message=${messageId}&biens=${liste.map(encodeURIComponent).join(',')}`,
        { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as { etat?: string; parBien?: Record<string, ExpediteurSyndical> };
      if (!r.ok || j.etat !== 'ok') continue;
      for (const b of liste) memoire.set(cleDe(messageId, b), j.parBien?.[b] ?? null);
    } catch {
      continue;
    }
    for (const b of liste) for (const f of abonnes.get(cleDe(messageId, b)) ?? []) f();
  }
}

/**
 * LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — un rangement vient de changer dans le bloc PARTIES : ce que
 * cette page savait de l'expéditeur des mails est peut-être périmé (classement local « Syndic & immeuble »). On l'oublie ;
 * le prochain cartouche le redemande. Rien n'est écrit.
 */
export function oublierExpediteursSyndicaux(): void {
  memoire.clear();
}

function demander(messageId: number, bien: string): void {
  const cle = cleDe(messageId, bien);
  if (memoire.has(cle)) return;
  const s = enAttente.get(messageId) ?? new Set<string>();
  s.add(bien);
  enAttente.set(messageId, s);
  if (minuterie === null) minuterie = setTimeout(() => { void charger(); }, 0);
}

/** Le rôle syndical de l'expéditeur de ce mail pour ce bien ; `null` s'il n'en a pas ou tant qu'on ne sait pas. */
export function useExpediteurSyndical(
  messageId: number | null | undefined, bien: string | null | undefined, actif = true,
): ExpediteurSyndical | null {
  const pret = actif && typeof messageId === 'number' && messageId > 0 && (bien ?? '') !== '';
  const cle = pret ? cleDe(messageId as number, bien as string) : null;
  const [, rafraichir] = useState(0);
  useEffect(() => {
    if (cle === null) return undefined;
    const f = () => rafraichir((n) => n + 1);
    const s = abonnes.get(cle) ?? new Set<() => void>();
    s.add(f);
    abonnes.set(cle, s);
    demander(messageId as number, bien as string);
    return () => { s.delete(f); };
  }, [cle, messageId, bien]);
  return cle === null ? null : memoire.get(cle) ?? null;
}

/** Pour les épreuves : repartir d'une mémoire vide. */
export function viderMemoireExpediteurSyndical(): void {
  memoire.clear();
  enAttente.clear();
}
