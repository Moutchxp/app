import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  IndicateurReleve, BadgeEtat, ETAT_LABELS, CompteSatisfaction, BlocARattacher, DetailDossiers, RelanceCarte, TableRuns,
} from './ReponsesRendu';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, ReponseARattacher, RelancePreparee, DossierSuivi } from '../../../../lib/veille/reponsesSuivi';

/**
 * R5a — rendu PUR de l'écran « Réponses » (renderToStaticMarkup, aucun DOM). Couvre l'indicateur de relève (3 signaux),
 * les 7 états d'échéance (libellés distincts), la file vide (phrase, pas de tableau) et le compte de satisfaction partielle.
 */
const NOW = new Date('2026-04-20T12:00:00Z');

describe('R5a — IndicateurReleve : trois signaux distincts', () => {
  it('relève FRAÎCHE → message rassurant (« il y a … »), pas d’alerte', () => {
    const h = renderToStaticMarkup(createElement(IndicateurReleve, {
      active: true, derniereOkLe: '2026-04-20T11:48:00Z', fraicheurHeures: 48, maintenant: NOW,
    }));
    expect(h).toContain('Dernière relève réussie il y a');
    expect(h).toContain('12 minutes');
    expect(h).not.toContain('indéterminées');
  });

  it('relève TROP ANCIENNE (> fraîcheur) → avertissement explicite', () => {
    const h = renderToStaticMarkup(createElement(IndicateurReleve, {
      active: true, derniereOkLe: '2026-04-17T12:00:00Z', fraicheurHeures: 48, maintenant: NOW,
    }));
    expect(h).toContain('indéterminées');
    expect(h).toContain('3 jours');
    expect(h).toContain('on ne peut pas affirmer qu’une mairie n’a pas répondu');
  });

  it('relève DÉSACTIVÉE → message distinct', () => {
    const h = renderToStaticMarkup(createElement(IndicateurReleve, {
      active: false, derniereOkLe: '2026-04-20T11:48:00Z', fraicheurHeures: 48, maintenant: NOW,
    }));
    expect(h).toContain('désactivée');
    expect(h).not.toContain('Dernière relève réussie il y a');
  });

  it('JAMAIS de relève réussie (null) → avertissement distinct', () => {
    const h = renderToStaticMarkup(createElement(IndicateurReleve, {
      active: true, derniereOkLe: null, fraicheurHeures: 48, maintenant: NOW,
    }));
    expect(h).toContain('Aucune relève réussie à ce jour');
  });
});

describe('R5a — BadgeEtat : les 7 états rendent chacun un libellé distinct', () => {
  const etats: EtatEcheance[] = ['non_delivree', 'repondue', 'repondue_partiellement', 'indeterminee', 'depassee', 'proche', 'en_cours'];

  it('chaque état affiche son libellé', () => {
    for (const e of etats) {
      const h = renderToStaticMarkup(createElement(BadgeEtat, { etat: e, motif: `motif ${e}` }));
      expect(h).toContain(ETAT_LABELS[e].libelle);
      expect(h).toContain(`motif ${e}`); // le motif lisible accompagne le badge
    }
  });

  it('les 7 libellés sont deux à deux DIFFÉRENTS', () => {
    const libelles = etats.map((e) => ETAT_LABELS[e].libelle);
    expect(new Set(libelles).size).toBe(7);
  });
});

describe('R5a — CompteSatisfaction : compte de dossiers', () => {
  it('demande partiellement satisfaite → « 2 / 5 »', () => {
    const h = renderToStaticMarkup(createElement(CompteSatisfaction, { satisfaits: 2, total: 5 }));
    expect(h).toContain('2 / 5');
  });
});

describe('R5a — blocs vides : phrase explicative, jamais un tableau muet', () => {
  it('file « à rattacher » vide → phrase + AUCUN tableau', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, { reponses: [] as ReponseARattacher[] }));
    expect(h).toContain('Aucune réponse en attente de rattachement');
    expect(h).not.toContain('<table');
  });

  it('file « à rattacher » non vide → tableau avec l’expéditeur, l’objet et le motif', () => {
    const reponses: ReponseARattacher[] = [
      { id: 1, recuLe: '2026-04-19T09:30:00Z', deAdresse: 'urba@mairie-x.fr', deNom: 'Service urba', objet: 'RE: demande', nbPieces: 2, rattachementMethode: 'aucun' },
    ];
    const h = renderToStaticMarkup(createElement(BlocARattacher, { reponses }));
    expect(h).toContain('<table');
    expect(h).toContain('urba@mairie-x.fr');
    expect(h).toContain('RE: demande');
    expect(h).toContain('aucun');
  });

  it('runs vides → phrase, pas de tableau', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [] as LigneRun[] }));
    expect(h).toContain('Aucune relève enregistrée');
    expect(h).not.toContain('<table');
  });
});

describe('R5a — TableRuns : une erreur est affichée en clair', () => {
  it('résultat « erreur » → message d’erreur avec role="alert"', () => {
    const runs: LigneRun[] = [{
      demarreLe: '2026-04-20T11:00:00Z', termineLe: '2026-04-20T11:00:05Z', declencheur: 'planifie', resultat: 'erreur',
      vus: null, dejaConnus: null, horsPerimetre: null, retenus: null, rattaches: null,
      rebondsDetectes: null, rebondsRattaches: null, rebondsEtrangers: null, rebondsAppliques: null, enregistrees: null, erreur: 'IMAP timeout',
    }];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).toContain('IMAP timeout');
    expect(h).toContain('role="alert"');
  });
});

describe('R5a — DetailDossiers : satisfait/dû et par quoi', () => {
  it('un dossier obtenu (automatique) et un dossier dû sont distingués', () => {
    const dossiers: DossierSuivi[] = [
      { numDau: 'PC0920042500001', adresse: '12 rue de la Paix', satisfait: true, satisfaitPar: 'automatique' },
      { numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null },
    ];
    const h = renderToStaticMarkup(createElement(DetailDossiers, { dossiers }));
    expect(h).toContain('obtenu (automatique)');
    expect(h).toContain('dû');
    expect(h).toContain('PC0920042500001');
  });
});

describe('R5a — RelanceCarte : lecture seule, corps consultable', () => {
  const relance: RelancePreparee = {
    id: 1, genereeLe: '2026-04-20T08:00:00Z', demandeId: 42, reference: 'SVAV-DEM-2026-000042',
    communeNom: 'Asnieres', objet: 'Relance — …', corps: 'CORPS DE LA RELANCE',
  };

  it('fermée → objet visible, corps masqué', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, { relance, ouvert: false }));
    expect(h).toContain('Relance — …');
    expect(h).not.toContain('CORPS DE LA RELANCE');
  });

  it('ouverte → corps visible ; aucun champ éditable ni bouton (lecture seule)', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, { relance, ouvert: true }));
    expect(h).toContain('CORPS DE LA RELANCE');
    expect(h).not.toContain('<textarea');
    expect(h).not.toContain('<button');
  });
});
