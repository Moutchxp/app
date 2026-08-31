import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { MentionFamillesManquantes, FriseSuivi, formaterEnvoiLe, formaterEcheanceLe } from './FriseSuiviRendu';
import type { EvenementFrise } from '../../../../lib/veille/friseSuivi';

/**
 * LOT 13/15 — rendus purs de l'encart « En cours ». A : la mention rouge de familles manquantes. B : la FRISE unifiée — faits passés
 * en tête (ancre + récents, anciens repliés), échéances À VENIR visuellement distinctes et toujours visibles, geste sous la frise.
 */
const fait = (over: Partial<EvenementFrise> = {}): EvenementFrise => ({ le: '2026-08-04T19:21:00Z', quand: 'passe', libelle: 'Demande initiale de communication', detail: null, ...over });
const echeance = (over: Partial<EvenementFrise> = {}): EvenementFrise => ({ le: '2026-09-07T00:00:00Z', quand: 'avenir', libelle: 'Cascade partielle — prochaine étape', detail: null, ...over });

describe('LOT 13-A — MentionFamillesManquantes (compteur rouge du titre de famille)', () => {
  it('affiche « dossier incomplet (2 familles manquantes) » en rouge quand 2 manquent', () => {
    const html = renderToStaticMarkup(h(MentionFamillesManquantes, { manquantes: 2 }));
    expect(html).toContain('dossier incomplet (2 familles manquantes)');
    expect(html).toContain('var(--color-svv-red)');
  });
  it('singulier quand 1 seule manque', () => {
    expect(renderToStaticMarkup(h(MentionFamillesManquantes, { manquantes: 1 }))).toContain('dossier incomplet (1 famille manquante)');
  });
  it('ABSENTE quand rien ne manque (jamais « 0 manquante »)', () => {
    expect(renderToStaticMarkup(h(MentionFamillesManquantes, { manquantes: 0 }))).toBe('');
  });
});

describe('LOT 15 — FriseSuivi (frise unifiée : faits + échéances)', () => {
  it('cas « aucun événement » → mention neutre, jamais un vide muet', () => {
    expect(renderToStaticMarkup(h(FriseSuivi, { evenements: [] }))).toContain('Aucun événement enregistré');
  });

  it('rend les faits puis les échéances À VENIR, distinctes et jamais présentées comme des faits', () => {
    const evenements: EvenementFrise[] = [
      fait({ le: '2026-08-04T19:21:00Z', libelle: 'Demande initiale de communication' }),
      fait({ le: '2026-08-26T07:09:00Z', libelle: 'Relance — Rappel', detail: 'à mairie@ex.fr' }),
      echeance({ le: '2026-09-07T00:00:00Z', libelle: 'Cascade partielle — prochaine étape' }),
      echeance({ le: '2026-10-02T00:00:00Z', libelle: 'Délai avant saisine CADA prolongé', detail: 'dossier partiel' }),
    ];
    const html = renderToStaticMarkup(h(FriseSuivi, { evenements }));
    expect(html).toContain('Demande initiale de communication');
    expect(html).toContain('Relance — Rappel');
    expect(html).toContain('à mairie@ex.fr');
    // l'échéance est explicitement marquée « à venir » (le mot, pas juste l'opacité) et n'affiche PAS d'heure
    expect(html.toLowerCase()).toContain('à venir');
    expect(html).toContain('Cascade partielle — prochaine étape');
    expect(html).toContain('07/09/2026');
    expect(html).not.toContain('07/09/2026 à'); // échéance = date seule, jamais « à HHhMM » (pas un fait horodaté)
    // ordre : le fait initial avant l'échéance
    expect(html.indexOf('Demande initiale')).toBeLessThan(html.indexOf('Cascade partielle'));
  });

  it('beaucoup de FAITS → repli natif des anciens (un clic), les échéances restent visibles', () => {
    const faits = [0, 1, 2, 3, 4, 5].map((i) => fait({ le: `2026-08-0${i + 1}T08:00:00Z`, libelle: `Fait ${i}` }));
    const evenements = [...faits, echeance()];
    const html = renderToStaticMarkup(h(FriseSuivi, { evenements }));
    expect(html).toContain('<details');
    expect(html).toContain('voir les 2 entrées plus anciennes'); // 6 faits : ancre + 3 récents visibles → 2 repliés
    expect(html).not.toContain('BlocRepliable');
    expect(html).toContain('Cascade partielle — prochaine étape'); // échéance JAMAIS repliée
  });

  it('le geste « à venir » (préparer un brouillon) est rendu sous la frise', () => {
    const html = renderToStaticMarkup(h(FriseSuivi, { evenements: [echeance()], actionAvenir: h('button', {}, 'Préparer la relance 2') }));
    expect(html).toContain('Préparer la relance 2');
  });

  it('LOT 16 (point 2) — la bascule de process porte un LISERÉ ROUGE (bordure fine), et elle SEULE', () => {
    const evenements: EvenementFrise[] = [
      fait({ libelle: 'Demande initiale de communication' }),
      fait({ le: '2026-08-28T12:00:00Z', libelle: 'Relance pièces complémentaires', bascule: true }),
    ];
    const html = renderToStaticMarkup(h(FriseSuivi, { evenements }));
    expect(html).toContain('Relance pièces complémentaires');
    // liseré = bordure gauche rouge de la charte (discret : pas un fond plein)
    expect(html).toMatch(/border-left:\s*2px solid var\(--color-svv-red\)/);
    expect(html).not.toContain('background:var(--color-svv-red)'); // jamais un fond plein
    // une seule occurrence de liseré (la bascule uniquement)
    expect((html.match(/border-left:\s*2px solid var\(--color-svv-red\)/g) ?? []).length).toBe(1);
  });
});

describe('formaterEnvoiLe / formaterEcheanceLe', () => {
  it('fait : date + heure de Paris', () => {
    expect(formaterEnvoiLe('2026-08-04T19:21:00Z')).toBe('04/08/2026 à 21h21');
  });
  it('échéance : date seule (pas d’heure)', () => {
    expect(formaterEcheanceLe('2026-10-02T00:00:00Z')).toBe('02/10/2026');
  });
  it('ISO illisible → renvoyée telle quelle (jamais NaN)', () => {
    expect(formaterEnvoiLe('pas-une-date')).toBe('pas-une-date');
  });
});
