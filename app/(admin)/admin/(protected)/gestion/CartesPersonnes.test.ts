// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocCartes, type GestesCartes } from './CartesPersonnes';
import type { PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';
import { MOTIF_DERNIERE_CARTE } from '../../../../lib/gestion/personneVivante';

/**
 * ══ 🔴🔴 LOT SUPPRIMER-CARTE — LE MENU « ⋯ », ET LES ARCHIVÉES ═══════════════════════════════════════════════
 *
 * Deux demandes d'Arno, éprouvées sur le vrai composant monté :
 *   ① « Supprimer » en DERNIÈRE position, en rouge, avec confirmation, et GRISÉ sur la dernière carte ;
 *   ② les cartes archivées ne s'affichent plus dans la rangée — défaut vu sur sa capture (proprietaire-146), où
 *      une carte archivée voisinait la carte active alors que le compteur disait « 1 ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const supprimees: { sujet: string; id: number }[] = [];

const PERSONNE = (o: Partial<PersonneAnnuaire> = {}): PersonneAnnuaire => ({
  sujet: 'proprietaire', id: 1, cle: 'P1', civilite: 'M.', prenom: 'Jean', nom: 'DUPONT',
  nomAffiche: 'DUPONT Jean', qualite: null, note: null, rang: 1, archive: false,
  archiveParLibelle: null, adresse: null, commune: null, codePostal: null, absent: false,
  contacts: [], dernierProprietaire: false, ...o,
} as PersonneAnnuaire);

const gestes = (o: Partial<GestesCartes> = {}): GestesCartes => ({
  modifiable: true,
  onEnregistrer: async () => null,
  onArchiver: async () => null,
  onSeparer: async () => null,
  onOrdonner: async () => null,
  onAjouter: () => {},
  onSupprimer: async (sujet, id) => { supprimees.push({ sujet, id }); return null; },
  ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  supprimees.length = 0;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const monter = (personnes: PersonneAnnuaire[], g: Partial<GestesCartes> = {}) => {
  act(() => {
    root.render(createElement(BlocCartes, {
      titre: 'Coordonnées', id: 'bloc', personnes, gestes: gestes(g), role: 'Propriétaire',
      motAjouter: '+ Ajouter', creation: { rappel: '', motDate: 'depuis', onCreer: async () => null },
    } as never));
  });
};

const boutonPar = (re: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => re.test((b.textContent ?? '').trim())) as HTMLButtonElement | undefined;
const ouvrirMenu = () => {
  const menu = [...container.querySelectorAll('button')]
    .find((b) => (b.getAttribute('aria-label') ?? '').toLowerCase().includes('autres gestes')
      || (b.textContent ?? '').trim() === '⋯');
  act(() => { menu?.click(); });
};

describe('🔴🔴 ② les cartes ARCHIVÉES quittent la rangée', () => {
  /**
   * 🔴 LE DÉFAUT DE LA CAPTURE D'ARNO : la carte archivée s'affichait à côté de l'active, et le compteur disait
   * « 1 ». Deux vérités côte à côte, et c'est le compteur qu'on croit faux.
   */
  it('🔴 une carte archivée n’est PAS dans la rangée, et le compteur ne compte que les vivantes', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, nomAffiche: 'Mme _TEST Camille', archive: true })]);
    expect(container.textContent).toContain('M. DUPONT Jean');
    expect(container.textContent).not.toContain('Mme _TEST Camille');
    expect(container.querySelector('.gst-compte')?.textContent).toBe('1');
  });

  /** 🔴 ELLES NE DISPARAISSENT PAS POUR AUTANT : les cacher sans rien dire ferait croire qu'archiver supprime. */
  it('🔴 un lien discret les montre, et dit COMBIEN', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, nomAffiche: 'Mme _TEST Camille', archive: true })]);
    const lien = boutonPar(/^Voir les archivées \(1\)$/);
    expect(lien).toBeDefined();
    act(() => { lien?.click(); });
    expect(container.textContent).toContain('Mme _TEST Camille');
    expect(boutonPar(/^Masquer les archivées$/)).toBeDefined();
  });

  it('⚠️ aucun lien quand il n’y a rien à montrer', () => {
    monter([PERSONNE()]);
    expect(boutonPar(/Voir les archivées/)).toBeUndefined();
  });
});

describe('🔴🔴 ① « Supprimer » dans le menu « ⋯ »', () => {
  it('🔴 l’entrée existe, en DERNIÈRE position, et en rouge', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, civilite: 'Mme', nomAffiche: 'DUPONT Marie' })]);
    ouvrirMenu();
    const entrees = [...container.querySelectorAll('.cp-menu-item')];
    expect(entrees.length).toBeGreaterThan(0);
    const derniere = entrees[entrees.length - 1];
    expect(derniere.textContent?.trim()).toBe('Supprimer');
    expect(derniere.className).toContain('cp-menu-item--danger');
  });

  /** 🔴 « Archiver », « Remplacer » et « Séparer » RESTENT : Arno le demande explicitement. */
  it('🔴 « Archiver » reste à sa place', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, civilite: 'Mme', nomAffiche: 'DUPONT Marie' })]);
    ouvrirMenu();
    expect(boutonPar(/^Archiver \(restaurable\)…$/)).toBeDefined();
  });

  it('🔴 la confirmation est OBLIGATOIRE, et dit ce qui arrive', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, civilite: 'Mme', nomAffiche: 'DUPONT Marie' })]);
    ouvrirMenu();
    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    expect(container.textContent).toContain('Supprimer la fiche de M. DUPONT Jean ?');
    expect(container.textContent).toContain('de cette fiche, de l’annuaire et des propositions');
    // Rien n'est parti tant qu'on n'a pas confirmé.
    expect(supprimees).toEqual([]);
  });

  /**
   * 🔴🔴 « <CIVILITÉ NOM> », ET LE DÉFAUT VU À L'ÉCRAN. Éprouvé en vrai sur proprietaire-146 : la carte
   * s'intitulait « Mme _TEST SUPPRESSION Claire » et la confirmation demandait « Supprimer la fiche de _TEST
   * SUPPRESSION Claire ? » — sans la civilité. Arno a écrit « <civilité nom> », et sur une fiche à plusieurs
   * cartes deux homonymes ne se distinguent parfois QUE par elle.
   */
  it('🔴🔴 la confirmation nomme la personne AVEC sa civilité, comme le titre de la carte', () => {
    monter([PERSONNE({ civilite: 'Mme', nomAffiche: '_TEST SUPPRESSION Claire' }), PERSONNE({ id: 2 })]);
    expect(container.querySelector('.cp-nom')?.textContent).toBe('Mme _TEST SUPPRESSION Claire');
    ouvrirMenu();
    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    expect(container.textContent).toContain('Supprimer la fiche de Mme _TEST SUPPRESSION Claire ?');
  });

  it('🔴 confirmer supprime ; annuler ne fait rien', () => {
    monter([PERSONNE(), PERSONNE({ id: 2, civilite: 'Mme', nomAffiche: 'DUPONT Marie' })]);
    ouvrirMenu();
    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    act(() => { boutonPar(/^Annuler$/)?.click(); });
    expect(supprimees).toEqual([]);

    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    expect(supprimees).toEqual([{ sujet: 'proprietaire', id: 1 }]);
  });

  /**
   * 🔴 GRISÉE, ET NON ABSENTE : une entrée qui disparaît fait chercher où elle est passée ; une entrée grisée qui
   * dit POURQUOI apprend la règle en une seconde. Le serveur refuse de la même façon, et c'est lui qui fait foi.
   */
  it('🔴🔴 sur la DERNIÈRE carte, elle est grisée et dit pourquoi', () => {
    monter([PERSONNE({ dernierProprietaire: true })]);
    ouvrirMenu();
    const entree = boutonPar(/^Supprimer$/);
    expect(entree?.disabled).toBe(true);
    expect(entree?.getAttribute('title')).toBe(MOTIF_DERNIERE_CARTE);
  });

  /**
   * 🔴 « MÊME RÈGLE POUR ARCHIVER » (Arno). Elle existait déjà côté comportement ; ce qui manquait, c'est qu'elle
   * SE VOIE : vu sur la fiche proprietaire-146, « Archiver » était inerte mais rouge et vif, comme un geste
   * qu'on peut faire. On cliquait, rien ne se passait, et rien ne disait pourquoi.
   */
  it('🔴 « Archiver » est grisé LUI AUSSI sur la dernière carte, et le style le montre', () => {
    monter([PERSONNE({ dernierProprietaire: true })]);
    ouvrirMenu();
    const archiver = boutonPar(/^Archiver \(restaurable\)…$/);
    expect(archiver?.disabled).toBe(true);
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(src).toContain('.cp-menu-item--attention:disabled');
  });

  /**
   * 🔴🔴 UNE CARTE ARCHIVÉE SE SUPPRIME AUSSI. Défaut trouvé en voulant nettoyer les fiches « _TEST CLAUDE… »
   * d'Arno : elles sont ARCHIVÉES, et l'entrée leur était refusée — le seul endroit où le rebut s'accumule était
   * le seul qu'aucun geste ne pouvait nettoyer. « Restaurer » reste à côté : on n'a pas retiré le geste inverse.
   */
  it('🔴🔴 une carte ARCHIVÉE se supprime, et garde son « Restaurer »', () => {
    monter([PERSONNE(), PERSONNE({ id: 7, civilite: 'Mme', nomAffiche: '_TEST CLAUDE Sophie', archive: true })]);
    act(() => { boutonPar(/Voir les archivées/)?.click(); });
    const menus = [...container.querySelectorAll('button')]
      .filter((b) => (b.getAttribute('aria-label') ?? '').toLowerCase().includes('autres gestes')
        || (b.textContent ?? '').trim() === '⋯');
    act(() => { menus[menus.length - 1]?.click(); });
    expect(boutonPar(/^Restaurer dans l’annuaire$/)).toBeDefined();
    const entree = boutonPar(/^Supprimer$/);
    expect(entree).toBeDefined();
    expect(entree?.disabled).toBe(false);
    act(() => { entree?.click(); });
    act(() => { boutonPar(/^Supprimer$/)?.click(); });
    expect(supprimees).toEqual([{ sujet: 'proprietaire', id: 7 }]);
  });

  /**
   * ⚠️ SANS LA MIGRATION 287, `onSupprimer` EST ABSENT et l'entrée n'existe pas du tout : proposer un geste que
   * la base ne saurait pas garder serait pire qu'une fonction absente.
   */
  it('⚠️ sans la migration, l’entrée n’est pas offerte', () => {
    monter([PERSONNE(), PERSONNE({ id: 2 })], { onSupprimer: undefined });
    ouvrirMenu();
    expect(boutonPar(/^Supprimer$/)).toBeUndefined();
    // …et le reste du menu est intact.
    expect(boutonPar(/^Archiver \(restaurable\)…$/)).toBeDefined();
  });
});
