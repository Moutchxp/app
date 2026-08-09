import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmationCadaRendu, type EtatPageCada } from './ConfirmationCadaRendu';
import type { ContexteConfirmation } from '../../lib/veille/saisineCadaRepo';

/**
 * X5 — rendu PUR de la page publique de confirmation (renderToStaticMarkup, aucun DOM). Vérifie : le bouton n'apparaît QUE si
 * l'acte est possible ('saisissable') ; chaque état affiche son message ; le détail du dossier est rendu ; les liens de repli.
 */
const URL_ONGLET = '/admin/permis';
const BOUTON = createElement('button', { type: 'button' }, 'BOUTON-ACTE-CADA');

const CTX = (over: Partial<ContexteConfirmation> = {}): ContexteConfirmation => ({
  etat: 'saisissable', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine',
  envoyeLe: new Date('2026-03-14T10:00:00Z'), refusTaciteLe: new Date('2026-04-14T10:00:00Z'), forclusionLe: new Date('2026-06-14T10:00:00Z'),
  joursAvantForclusion: 30, dossiersDusNums: ['DAU-092-2025-0001', 'DAU-092-2025-0002'], dejaLanceeLe: null, ...over,
});

const rendu = (etat: EtatPageCada, ctx?: ContexteConfirmation | null) =>
  renderToStaticMarkup(createElement(ConfirmationCadaRendu, { etat, ctx, urlOnglet: URL_ONGLET, bouton: BOUTON }));

describe('X5 — le bouton n’apparaît QUE si l’acte est possible', () => {
  it('saisissable → bouton présent + message d’invite', () => {
    const h = rendu('saisissable', CTX());
    expect(h).toContain('BOUTON-ACTE-CADA');
    expect(h).toContain('vous pouvez saisir la CADA');
  });

  for (const etat of ['jeton_invalide', 'jeton_expire', 'demande_absente', 'demande_hors_etat', 'deja_lancee', 'forclose', 'refus_non_acquis', 'plus_de_dossier', 'silence_non_verifie'] as EtatPageCada[]) {
    it(`${etat} → AUCUN bouton (jamais un bouton inerte)`, () => {
      expect(rendu(etat, CTX({ etat: etat as ContexteConfirmation['etat'] }))).not.toContain('BOUTON-ACTE-CADA');
    });
  }
});

describe('X5 — message clair dans chacun des états', () => {
  it('jeton invalide → message d’invalidité, pas de détail', () => {
    const h = rendu('jeton_invalide', null);
    expect(h).toContain('n’est pas valide');
    expect(h).not.toContain('SVAV-DEM'); // aucun détail (pas de demande chargée)
  });
  it('jeton expiré → dit 7 jours + renvoie vers l’onglet Saisines CADA', () => {
    const h = rendu('jeton_expire', null);
    expect(h).toContain('expiré');
    expect(h).toContain('7 jours');
    expect(h).toContain(URL_ONGLET);
  });
  it('déjà lancée → dit QUAND (date d’envoi de la saisine)', () => {
    expect(rendu('deja_lancee', CTX({ etat: 'deja_lancee', dejaLanceeLe: new Date('2026-05-10T09:00:00Z') }))).toContain('déjà été lancée pour cette demande le 2026-05-10');
  });
  it('déjà lancée sans date (brouillon) → « en préparation »', () => {
    expect(rendu('deja_lancee', CTX({ etat: 'deja_lancee', dejaLanceeLe: null }))).toContain('en préparation');
  });
  it('forclose → dit la date de forclusion', () => {
    expect(rendu('forclose', CTX({ etat: 'forclose' }))).toContain('forclos depuis le 2026-06-14');
  });
  it('silence non vérifié → message de sincérité', () => {
    expect(rendu('silence_non_verifie', CTX({ etat: 'silence_non_verifie' }))).toContain('pas assez récente');
  });
  it('plus de dossier → message « plus rien à saisir »', () => {
    expect(rendu('plus_de_dossier', CTX({ etat: 'plus_de_dossier' }))).toContain('plus rien à saisir');
  });
});

describe('X5 — détail du dossier (identification, sans donnée personnelle)', () => {
  it('rend référence, commune, dates, jours avant forclusion et la LISTE des dossiers dus', () => {
    const h = rendu('saisissable', CTX());
    expect(h).toContain('SVAV-DEM-2026-000042');
    expect(h).toContain('Asnières-sur-Seine');
    expect(h).toContain('2026-03-14'); // envoyée le
    expect(h).toContain('2026-04-14'); // refus tacite
    expect(h).toContain('DAU-092-2025-0001, DAU-092-2025-0002'); // liste des dossiers dus
  });
  it('peu de jours restants → jours signalés en rouge (appui visuel, le texte reste)', () => {
    expect(rendu('saisissable', CTX({ joursAvantForclusion: 3 }))).toContain('text-svv-red');
  });
});
