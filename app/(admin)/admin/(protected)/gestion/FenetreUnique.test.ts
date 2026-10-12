import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUCUN_BIEN_SUIVI, definitionDe, glissiereOuverte, morceauxDefinitionPortee, porteeArbitre,
  positionAffichee, POSITIONS_PORTEE,
} from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — UNE SEULE FENÊTRE, AUCUN GESTE PERDU, LE DÉFAUT DU PREMIER CLASSEMENT ══
 *
 * DÉCISION D'ARNO (12/10/2026) : « les fenêtres qui ont la même fonction doivent être IDENTIQUES ». La fenêtre de
 * « Modifier le rattachement » (historique d'un bien) remplace « Rattacher ce mail à… » (bouton « Rattacher à un
 * logement »). Ces épreuves tiennent les trois promesses du lot ; le parcours monté est éprouvé par
 * `EncartRattachement.contacts`, `EncartRattachement.fiche` et `Conversation.statut`.
 */
const ICI = join(process.cwd(), 'app/(admin)/admin/(protected)/gestion');
const source = (f: string): string => readFileSync(join(ICI, f), 'utf8');
/** Le code sans ses commentaires : ce qui est MONTÉ, pas ce qui est raconté. */
const code = (f: string): string => source(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('🔴🔴 un seul composant pour « Modifier le rattachement » et « Rattacher à un logement »', () => {
  it('🔴 les deux portes montent `RattachementsDuFil` en porte ponctuelle', () => {
    expect(code('HistoriqueDuBien.tsx')).toMatch(/<RattachementsDuFil[^>]*\n?[^>]*ponctuel/);
    const encart = code('EncartRattachement.tsx');
    const i = encart.indexOf('<RattachementsDuFil');
    expect(i).toBeGreaterThan(-1);
    expect(encart.slice(i, i + 200)).toContain('ponctuel');
  });

  it('🔴 l’ancienne fenêtre n’est plus montée par l’encart, sauf en repli sans échange connu (`filId` absent)', () => {
    const encart = code('EncartRattachement.tsx');
    const montages = [...encart.matchAll(/<RattacherEnEcrivant/g)];
    expect(montages).toHaveLength(1);
    const avant = encart.slice(Math.max(0, (montages[0].index ?? 0) - 60), montages[0].index);
    expect(avant).toContain('filId == null');
  });
});

describe('🔴🔴 aucun geste de l’ancienne fenêtre n’est perdu', () => {
  const encart = code('EncartRattachement.tsx');
  const bloc = encart.slice(encart.indexOf('<RattachementsDuFil'), encart.indexOf('<RattacherEnEcrivant'));

  it('🔴 « Hors gestion, ou classer par pièce… », « Classer dans une carte », « Classer sans suite » : « Autres classements »', () => {
    expect(bloc).toContain('Hors gestion, ou classer par pièce…');
    expect(bloc).toContain('setClasser(true)');
    // Les deux gestes du statut viennent de l'appelant, mêmes handlers qu'avant.
    expect(bloc).toContain('...actionsDePied.map(');
    expect(code('RattachementsDuFil.tsx')).toContain('Autres classements');
  });

  it('🔴 la validation reste celle de l’encart : étape « Classer ce nouveau contact », marque « Interne », chemin sans 290', () => {
    expect(bloc).toContain('ecrireParLAppelant=');
    expect(bloc).toContain('appliquerCibles(');
    // Pendant ces étapes, la fenêtre est CACHÉE, pas fermée : « ← Retour » la retrouve telle quelle.
    expect(encart).toMatch(/hidden=\{verification \|\| etape2 !== null \|\| demandeLevee !== null\}>\s*<RattachementsDuFil/);
  });

  it('🔴 les trois choix ronds sont remplacés par les trois positions actives de la glissière, mêmes fenêtres', () => {
    const choix = POSITIONS_PORTEE.filter((p) => p.choix !== null).map((p) => [p.libelle, p.choix]);
    expect(choix).toEqual([['One shot', 'mail'], ['Ce mail + futurs échanges', 'suite'], ['Toute la conversation', 'conversation']]);
  });

  it('🔴 l’événement du mail reste lu dans la fenêtre, avec le renvoi vers les gestes de la conversation', () => {
    expect(bloc).toContain('renvoiEvenement={RENVOI_EVENEMENT_CONVERSATION}');
  });
});

describe('🔴🔴 la glissière au premier classement (mail jamais classé)', () => {
  it('🔴 par défaut sur « Ce mail + futurs échanges », la règle du premier classement', () => {
    expect(positionAffichee(null, false, true)).toBe('suite');
    expect(positionAffichee(null, true, true)).toBe('suite');
  });

  it('🔴 « Origine » n’est jamais la position au premier rattachement (lot PREMIER-RATTACHEMENT-SANS-ORIGINE)', () => {
    expect(positionAffichee('origine', false, true)).toBe('suite');
    expect(positionAffichee('origine', true, true)).toBe('suite');
    expect(positionAffichee('one_shot', true, true)).toBe('one_shot');
    expect(positionAffichee('conversation', false, true)).toBe('conversation');
  });

  it('🔴 son texte « Le mail reste à classer… » est retiré : jamais affiché au premier rattachement', () => {
    expect(morceauxDefinitionPortee('origine', 0, true).map((m) => m.texte).join('')).not.toContain('reste à classer');
    expect(AUCUN_BIEN_SUIVI).toBe('Aucun bien suivi pour l’instant');
  });

  it('🔴 les quatre positions se choisissent d’emblée au premier classement, pas ailleurs sans modification', () => {
    expect(glissiereOuverte(false, true)).toBe(true);
    expect(glissiereOuverte(false, false)).toBe(false);
    expect(glissiereOuverte(true, false)).toBe(true);
  });

  it('⚠️ hors premier classement, RIEN NE CHANGE : Origine, puis One shot à la première modification', () => {
    expect(positionAffichee(null, false, false)).toBe('origine');
    expect(positionAffichee(null, true, false)).toBe('one_shot');
    expect(positionAffichee('conversation', true, false)).toBe('conversation');
    expect(morceauxDefinitionPortee('origine', 0, false)[0].texte).toBe(definitionDe('origine').definition);
  });

  it('🔴 la préséance : la glissière arbitre dès qu’on la touche, et toujours hors premier classement', () => {
    expect(porteeArbitre(null, true)).toBe(false);
    expect(porteeArbitre('suite', true)).toBe(true);
    expect(porteeArbitre(null, false)).toBe(true);
  });
});
