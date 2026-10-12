// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GlissierePortee } from './GlissierePortee';
import {
  AUCUN_BIEN_RETIRE, dateCourteMail, phrasePorteeInterne, phrasesDetachement,
} from '../../../../lib/gestion/interneDetache';
import { capsuleDuMessage } from '../../../../lib/gestion/statutClassement';
import { etatClassement } from '../../../../lib/gestion/classementAvantEnvoi';
import type { PositionPortee } from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT INTERNE-GLISSIERE-ET-STATUT-COHERENT ════════════════════════════════════════════════════════════════════
 *
 * ① le panneau « Interne » porte LA glissière de la fenêtre de rattachement, à trois positions ;
 * ② le texte dit la vérité, mail par mail (constat d'Arno sur le mail 58109 : le lot 236 était porté par le mail de
 *    17:49, et le panneau écrivait « Sortir ce mail du suivi de … ») ;
 * ③ la règle de statut : « À classer » ⇔ aucun rattachement actif sur CE mail ⇔ les deux boutons.
 * 🔒 Aucune donnée réelle, aucune écriture.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let conteneur: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); conteneur?.remove(); root = null; conteneur = null; });

const monterGlissiere = (position: PositionPortee, choisis: PositionPortee[]) => {
  conteneur = document.createElement('div'); document.body.appendChild(conteneur); root = createRoot(conteneur);
  act(() => {
    root?.render(createElement(GlissierePortee, {
      position, modification: true, positions: ['one_shot', 'suite', 'conversation'], libelleGroupe: 'Portée du marquage',
      onChoisir: (p: PositionPortee) => { choisis.push(p); },
    }));
  });
  return conteneur;
};

describe('① la glissière du panneau « Interne » : trois positions, même composant', () => {
  it('🔴 trois libellés, dans l’ordre, sans « Origine », et la position par défaut cochée', () => {
    const c = monterGlissiere('conversation', []);
    const radios = [...c.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(['One shot', 'Ce mail + futurs échanges', 'Toute la conversation']);
    expect(c.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Toute la conversation');
    expect(c.querySelectorAll('.gpo-cran')).toHaveLength(3);
    expect(c.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Portée du marquage');
  });

  it('🔴 les trois repères se répartissent sur la piste (0, ½, 1)', () => {
    const c = monterGlissiere('suite', []);
    const x = [...c.querySelectorAll<HTMLElement>('.gpo-cran')].map((e) => e.style.getPropertyValue('--gpo-x'));
    expect(x).toEqual(['0', '0.5', '1']);
  });

  it('🔴 un clic et le clavier choisissent une autre position', () => {
    const choisis: PositionPortee[] = [];
    const c = monterGlissiere('conversation', choisis);
    act(() => { (c.querySelectorAll('[role="radio"]')[0] as HTMLElement).click(); });
    act(() => {
      c.querySelector('[role="radiogroup"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(choisis).toEqual(['one_shot', 'suite']);
  });

  it('🔴 le texte d’explication suit la position', () => {
    expect(phrasePorteeInterne('mail')).toContain('Ce mail sera marqué Interne');
    expect(phrasePorteeInterne('suite')).toContain('mails suivants');
    expect(phrasePorteeInterne('conversation')).toContain('Tous les mails de cette conversation');
  });
});

describe('② le texte dit la vérité, mail par mail', () => {
  const LOT236 = { lienId: 173437, libelle: '1-11 rue Eugène Eichenberger, PUTEAUX — lot 236', messageId: 58115,
    recuLe: '2026-10-12T15:49:32Z' };

  it('🔴🔴 le cas d’Arno : sur 58109, le lot 236 est porté par le mail de 17:49 — jamais « Ce mail »', () => {
    const ph = phrasesDetachement(58109, [LOT236]);
    expect(ph).toEqual([
      'Le mail du 12/10 à 17:49 de cette conversation sortira du suivi de 1-11 rue Eugène Eichenberger, PUTEAUX — lot 236 (restaurable).',
    ]);
    expect(ph.join(' ')).not.toContain('Ce mail sortira');
  });

  it('🔴 un bien porté par le mail cliqué : « Ce mail sortira du suivi de … »', () => {
    expect(phrasesDetachement(58115, [LOT236])).toEqual([
      'Ce mail sortira du suivi de 1-11 rue Eugène Eichenberger, PUTEAUX — lot 236 (restaurable).',
    ]);
  });

  it('🔴 rien à retirer : « Aucun bien n’est retiré du suivi. »', () => {
    expect(phrasesDetachement(58109, [])).toEqual([AUCUN_BIEN_RETIRE]);
    expect(AUCUN_BIEN_RETIRE).toBe('Aucun bien n’est retiré du suivi.');
  });

  it('🔴 plusieurs mails : une phrase par mail, dans l’ordre des mails, biens regroupés', () => {
    const ph = phrasesDetachement(1, [
      { lienId: 3, libelle: 'B', messageId: 3, recuLe: '2026-10-12T16:00:00Z' },
      { lienId: 1, libelle: 'A', messageId: 1, recuLe: '2026-10-12T08:00:00Z' },
      { lienId: 2, libelle: 'C', messageId: 3, recuLe: '2026-10-12T16:00:00Z' },
    ]);
    expect(ph).toEqual([
      'Ce mail sortira du suivi de A (restaurable).',
      'Le mail du 12/10 à 18:00 de cette conversation sortira du suivi de B, de C (restaurable).',
    ]);
  });

  it('⚠️ une réponse sans le mail (API plus ancienne) : une forme qui ne nomme aucun mail', () => {
    expect(phrasesDetachement(9, [{ lienId: 1, libelle: 'A' }])).toEqual(['Sortira du suivi : A (restaurable).']);
  });

  it('la date est celle de Paris', () => {
    expect(dateCourteMail('2026-10-12T15:49:32Z')).toBe('12/10 à 17:49');
  });
});

describe('③ la règle de statut : « À classer » ⇔ aucun rattachement actif sur CE mail ⇔ les deux boutons', () => {
  type L = { sorte: string; statut: string; origine?: string };
  const cas: { nom: string; liens: L[]; interne?: boolean; hg?: boolean; pastille: string; boutons: string }[] = [
    { nom: 'aucun lien', liens: [], pastille: 'a_classer', boutons: 'rien' },
    { nom: 'une proposition seulement (58109)', liens: [{ sorte: 'lot', statut: 'propose' }], pastille: 'a_classer', boutons: 'rien' },
    { nom: 'un lien retiré', liens: [{ sorte: 'lot', statut: 'retire' }], pastille: 'a_classer', boutons: 'rien' },
    { nom: 'un lien sorti du suivi', liens: [{ sorte: 'lot', statut: 'sorti' }], pastille: 'a_classer', boutons: 'rien' },
    { nom: 'un logement confirmé automatique (17:49)', liens: [{ sorte: 'lot', statut: 'confirme', origine: 'automatique' }], pastille: 'auto', boutons: 'rattache' },
    { nom: 'un logement confirmé à la main', liens: [{ sorte: 'lot', statut: 'confirme', origine: 'manuel' }], pastille: 'classe', boutons: 'rattache' },
    { nom: 'interne sans bien', liens: [], interne: true, pastille: 'interne', boutons: 'interne' },
    { nom: 'interne ET logement : le logement l’emporte', liens: [{ sorte: 'lot', statut: 'confirme', origine: 'manuel' }], interne: true, pastille: 'classe', boutons: 'rattache' },
    { nom: 'hors gestion', liens: [], hg: true, pastille: 'hors_gestion', boutons: 'hors_gestion' },
  ];
  for (const c of cas) {
    it(c.nom, () => {
      const pastille = capsuleDuMessage(
        c.liens.map((l) => ({ cible: { sorte: l.sorte }, statut: l.statut, origine: l.origine ?? 'automatique' })),
        c.hg === true, c.interne === true);
      /* Les boutons : `etatClassement` sur les logements CONFIRMÉS du mail (les `biensRattaches` de l'encart). */
      const boutons = etatClassement({
        cibles: c.liens.filter((l) => l.statut === 'confirme' && l.sorte === 'lot').map((l) => ({ sorte: l.sorte })),
        interne: c.interne === true, horsGestion: c.hg === true,
      });
      expect(pastille).toBe(c.pastille);
      expect(boutons).toBe(c.boutons);
      expect(pastille === 'a_classer').toBe(boutons === 'rien');
    });
  }
});
