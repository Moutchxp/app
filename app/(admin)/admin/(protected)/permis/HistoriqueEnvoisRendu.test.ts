import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { MentionFamillesManquantes, HistoriqueEnvois, formaterEnvoiLe } from './HistoriqueEnvoisRendu';
import type { EnvoiHistorique } from '../../../../lib/veille/historiqueEnvois';

/**
 * LOT 13 — rendus purs de l'encart « En cours ». A : la mention rouge présente/absente selon le nombre de familles manquantes (et
 * portée par le titre, donc visible replié). B : l'historique — demande initiale en tête, cas vide, repli des plus anciennes.
 */
const env = (over: Partial<EnvoiHistorique> = {}): EnvoiHistorique => ({ le: '2026-08-04T19:21:00Z', nature: 'initiale', grade: null, libelle: 'Demande initiale de communication', destinataire: null, ...over });

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
    expect(renderToStaticMarkup(h(MentionFamillesManquantes, { manquantes: -1 }))).toBe('');
  });
});

describe('LOT 13-B — HistoriqueEnvois (nos envois : initiale puis relances)', () => {
  it('cas « aucun envoi » → mention neutre, jamais un vide muet', () => {
    const html = renderToStaticMarkup(h(HistoriqueEnvois, { envois: [] }));
    expect(html).toContain('Aucun envoi enregistré');
  });

  it('rend la demande initiale (avec sa date/heure) puis les relances graduées', () => {
    const envois: EnvoiHistorique[] = [
      env(),
      { le: '2026-08-26T07:09:00Z', nature: 'relance_ordinaire', grade: 'Rappel', libelle: 'Relance — Rappel', destinataire: 'mairie@ex.fr' },
    ];
    const html = renderToStaticMarkup(h(HistoriqueEnvois, { envois }));
    expect(html).toContain('Demande initiale de communication');
    expect(html).toContain('Relance — Rappel');
    expect(html).toContain('à mairie@ex.fr');
    // la demande initiale apparaît AVANT la relance dans le flux rendu (ordre chronologique)
    expect(html.indexOf('Demande initiale')).toBeLessThan(html.indexOf('Relance — Rappel'));
  });

  it('liste longue → repli natif des plus anciennes (un seul clic, pas de BlocRepliable imbriqué)', () => {
    const envois: EnvoiHistorique[] = [env(), ...[1, 2, 3, 4, 5].map((i): EnvoiHistorique => ({ le: `2026-08-${10 + i}T00:00:00Z`, nature: 'relance_ordinaire', grade: 'Rappel', libelle: `Relance — Rappel ${i}`, destinataire: null }))];
    const html = renderToStaticMarkup(h(HistoriqueEnvois, { envois }));
    expect(html).toContain('<details');           // repli natif = un seul clic
    expect(html).toContain('voir les 2 relances plus anciennes'); // 6 entrées : 1 initiale + 3 récentes visibles, 2 repliées
    expect(html).not.toContain('BlocRepliable');
  });
});

describe('formaterEnvoiLe — date + heure de Paris', () => {
  it('rend « 04/08/2026 à 21h21 » (heure de Paris, UTC+2 en août)', () => {
    expect(formaterEnvoiLe('2026-08-04T19:21:00Z')).toBe('04/08/2026 à 21h21');
  });
  it('ISO illisible → renvoyée telle quelle (jamais NaN)', () => {
    expect(formaterEnvoiLe('pas-une-date')).toBe('pas-une-date');
  });
});
