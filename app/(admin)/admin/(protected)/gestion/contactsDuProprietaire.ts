'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { annoncerCartesContact, concerneCeBien, ecouterCartesContact, type SignalCartesContact } from '../../../../lib/gestion/signalCartesContact';
import { carteMonteAuCarrousel } from '../../../../lib/gestion/partieCategorie';
import { ficheAEnvoyer, premierEmail } from '../../../../lib/gestion/ficheContact';
import type { LigneCarte as CarteDeContact } from '../../../../lib/gestion/partieCategorieRepo';
import type { ChampsSaisis, GestesCarteContact } from './CartesPersonnes';

/**
 * ══ 🔴🔴 FICHE PROPRIÉTAIRE COMMUNE — « + AJOUTER UN CONTACT » (Arno, 18/10/2026) ═════════════════════════════════════
 *
 * « La carte “+ Ajouter un propriétaire” devient “+ Ajouter un contact” ; au clic, EXACTEMENT la même petite fenêtre de
 * choix que celle de la Gestion (“Propriétaire (client)” / “Contact du propriétaire”). Contact du propriétaire → carte
 * CONTACT DU PROPRIÉTAIRE, rattachée à ce propriétaire et à ses biens, exactement comme dans la Gestion ; ce n'est pas
 * un client. » — accord d'Arno pour modifier la Gestion sur ce point.
 *
 * 🔴 « EXACTEMENT COMME DANS LA GESTION » : une carte de contact se range sur un BIEN (c'est la clé de sa table), côté
 * propriétaire, par la porte du rangement (`/api/admin/gestion/historique/parties`, la même que la fiche du bien). Depuis
 * la fiche du PROPRIÉTAIRE, elle se range donc sur CHACUN de ses biens en gestion — et la fiche les montre UNE fois
 * chacune (regroupées par adresse), chaque geste (vérifier, modifier, retirer, ranger) valant pour toutes les copies.
 * Le signal des cartes est écouté et annoncé : la fiche d'un bien ouverte ailleurs se met à jour, et inversement.
 */

/** Une carte affichée et les identifiants de toutes ses copies (une par bien). */
export interface ContactRegroupe { carte: CarteDeContact; ids: number[] }

/** PUR — les cartes « contact du propriétaire » qui montent au carrousel, une par adresse (la plus ancienne en tête). */
export function regrouperContactsProprietaire(cartes: readonly CarteDeContact[]): ContactRegroupe[] {
  const groupes = new Map<string, ContactRegroupe>();
  for (const c of cartes) {
    if (c.cote !== 'proprietaire' || !carteMonteAuCarrousel(c)) continue;
    const cle = c.adresse.trim().toLowerCase();
    const g = groupes.get(cle);
    if (g === undefined) groupes.set(cle, { carte: c, ids: [c.id] });
    else if (!g.ids.includes(c.id)) g.ids.push(c.id);
  }
  return [...groupes.values()];
}

export const MOTIF_SANS_BIEN_EN_GESTION =
  'Ce propriétaire n’a aucun bien en gestion : un contact du propriétaire se range sur ses biens, il ne peut donc pas être ajouté ici.';

const PORTE = '/api/admin/gestion/historique/parties';

export function useContactsDuProprietaire(lots: readonly string[], modifiable: boolean): {
  contacts: CarteDeContact[]; gestesContact: GestesCarteContact; creer: (champs: ChampsSaisis) => Promise<string | null>;
} {
  const cle = lots.join('|');
  const [groupes, setGroupes] = useState<ContactRegroupe[]>([]);
  const relire = useCallback(async (): Promise<void> => {
    const numeros = cle === '' ? [] : cle.split('|');
    try {
      const toutes = (await Promise.all(numeros.map(async (n) => {
        const res = await fetch(`${PORTE}?cible=lot-${encodeURIComponent(n)}`, { cache: 'no-store' });
        const d = (await res.json()) as { data?: { cartes?: CarteDeContact[] } };
        return d.data?.cartes ?? [];
      }))).flat();
      setGroupes(regrouperContactsProprietaire(toutes));
    } catch {
      // En échec, la rangée est celle d'avant : les cartes clients, intactes, sans contact.
      setGroupes([]);
    }
  }, [cle]);
  useEffect(() => { void relire(); }, [relire]);
  const monEcoute = useRef<((s: SignalCartesContact) => void) | null>(null);
  useEffect(() => {
    const g = (sig: SignalCartesContact): void => {
      if (cle !== '' && cle.split('|').some((n) => concerneCeBien(sig, n))) void relire();
    };
    monEcoute.current = g;
    return ecouterCartesContact(g);
  }, [cle, relire]);

  /** Un ou plusieurs POST par la porte du rangement, puis on relit et on prévient les autres écrans. */
  const poster = useCallback(async (corps: Record<string, unknown>[]): Promise<string | null> => {
    try {
      for (const c of corps) {
        const res = await fetch(PORTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
        const d = (await res.json()) as { etat?: string; motif?: string };
        if (d.etat !== 'ok') { await relire(); return d.motif ?? 'Le geste n’a pas pu être enregistré.'; }
      }
      await relire();
      for (const n of cle === '' ? [] : cle.split('|')) annoncerCartesContact(n, { sauf: monEcoute.current ?? undefined });
      return null;
    } catch {
      return 'Le geste n’a pas pu être enregistré : le réseau n’a pas répondu.';
    }
  }, [cle, relire]);
  const copies = (id: number): number[] => groupes.find((g) => g.ids.includes(id))?.ids ?? [id];
  const numeros = cle === '' ? [] : cle.split('|');

  const creer = useCallback(async (champs: ChampsSaisis): Promise<string | null> => {
    if (numeros.length === 0) return MOTIF_SANS_BIEN_EN_GESTION;
    const fiche = ficheAEnvoyer(champs);
    const adresse = premierEmail(fiche.coordonnees);
    if (adresse === null) return 'Il faut au moins une adresse e-mail : c’est elle qui identifie le contact.';
    return poster(numeros.map((n) => ({ cible: `lot-${n}`, adresse, categorie: 'proprietaire', ...fiche })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, poster]);

  const gestesContact: GestesCarteContact = {
    modifiable,
    onVerifier: (id) => poster(copies(id).map((x) => ({ action: 'verifier', id: x }))),
    onRetirer: (id) => poster(copies(id).map((x) => ({ action: 'retirer', id: x }))),
    onModifier: (id, champs) => poster(copies(id).map((x) => ({ action: 'modifier', id: x, ...ficheAEnvoyer(champs) }))),
    onRanger: (adresse, categorie) => poster(numeros.map((n) => ({ cible: `lot-${n}`, adresse, categorie }))),
  };
  return { contacts: groupes.map((g) => g.carte), gestesContact, creer };
}
