import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  IndicateurReleve, BadgeEtat, ETAT_LABELS, CompteSatisfaction, BlocARattacher, DetailDossiers, RelanceCarte, TableRuns,
  apporteUneNouveaute, SelecteurPeriode, ActionsCloture, messageIci, AIDE_ACTIONS_DOSSIER, AideActionsDossier,
  EtatDemande, RappelObtenusArchives, partitionnerDemandes,
  type OptionDemande, type RetourCible,
} from './ReponsesRendu';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, ReponseARattacher, RelancePreparee, DossierSuivi, CumulFenetre } from '../../../../lib/veille/reponsesSuivi';

/**
 * R5a/R5b — rendu PUR de l'écran « Réponses » (renderToStaticMarkup, aucun DOM). Couvre l'indicateur de relève (3 signaux),
 * les 7 états d'échéance (libellés distincts), la file vide (phrase, pas de tableau), le compte de satisfaction partielle, et
 * les ACTIONS R5b : les boutons apparaissent aux bons endroits (rattacher/traitée/télécharger, marquer/annuler), une demande
 * 'close' affiche son message et AUCUN bouton de marquage, une pièce sans clé affiche son motif et aucun lien, et le message
 * de retour se rend UNIQUEMENT dans la zone du bouton cliqué (messageIci), jamais dédoublé.
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

describe('T2 — exclusivité Réponses / Archives : partition + badges + rappel Archives', () => {
  const D = (dossiersActifs: number, dossiersSatisfaits: number) => ({ dossiersActifs, dossiersSatisfaits });

  it('partitionnerDemandes : partielle → vivante ; tout obtenu → soldée ; 0 dossier actif → sans dossier', () => {
    const { vivantes, soldees, sansDossier } = partitionnerDemandes([
      D(5, 2), // 3 dus → reste dans Réponses (partielle à cheval)
      D(5, 5), // 0 du, des actifs → soldée (masquée)
      D(0, 0), // aucun dossier actif → masquée
      D(1, 0), // 1 du → reste
    ]);
    expect(vivantes).toHaveLength(2);
    expect(soldees).toHaveLength(1);
    expect(sansDossier).toHaveLength(1);
    expect(soldees[0]).toMatchObject({ dossiersActifs: 5, dossiersSatisfaits: 5 });
    expect(sansDossier[0]).toMatchObject({ dossiersActifs: 0 });
  });

  it('EtatDemande : 0 dossier actif → « Aucun dossier actif », AUCUNE échéance courante affichée (garde T2)', () => {
    const h = renderToStaticMarkup(createElement(EtatDemande, { statut: 'envoyee', dossiersActifs: 0, etat: 'depassee', motif: 'Échéance dépassée…' }));
    expect(h).toContain('Aucun dossier actif');
    expect(h).toContain('aucun délai ne court');
    expect(h).not.toContain('Échéance dépassée'); // pas de badge d’échéance qui court
    expect(h).not.toContain('Délai en cours');
  });

  it('EtatDemande : close → « Clôturée » ; sinon → le badge d’échéance (décision d’etatEcheance, jamais recopiée)', () => {
    expect(renderToStaticMarkup(createElement(EtatDemande, { statut: 'close', dossiersActifs: 3, etat: 'en_cours' }))).toContain('Clôturée');
    const vivant = renderToStaticMarkup(createElement(EtatDemande, { statut: 'envoyee', dossiersActifs: 3, etat: 'en_cours', motif: 'Délai d’un mois en cours…' }));
    expect(vivant).toContain('Délai en cours'); // ETAT_LABELS.en_cours
    expect(vivant).not.toContain('Aucun dossier actif');
  });

  it('RappelObtenusArchives : N>0 → « N dossier(s) obtenu(s) — voir Archives » ; N=0 → rien', () => {
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 3 }))).toContain('3 dossiers obtenus — voir Archives');
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 1 }))).toContain('1 dossier obtenu — voir Archives');
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 0 }))).toBe('');
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
      { id: 1, recuLe: '2026-04-19T09:30:00Z', deAdresse: 'urba@mairie-x.fr', deNom: 'Service urba', objet: 'RE: demande', nbPieces: 2, rattachementMethode: 'aucun', pieces: [] },
    ];
    const h = renderToStaticMarkup(createElement(BlocARattacher, { reponses }));
    expect(h).toContain('<table');
    expect(h).toContain('urba@mairie-x.fr');
    expect(h).toContain('RE: demande');
    expect(h).toContain('aucun');
  });

  it('R4 — chaque pièce indique si elle est stockée ou non, et pourquoi', () => {
    const reponses: ReponseARattacher[] = [
      { id: 1, recuLe: '2026-04-19T09:30:00Z', deAdresse: 'urba@mairie-x.fr', deNom: null, objet: null, nbPieces: 2, rattachementMethode: 'aucun',
        pieces: [
          { id: 11, nomFichier: 'PC2.pdf', stockee: true, motif: null },
          { id: 12, nomFichier: 'plan.dwg', stockee: false, motif: 'type non autorisé pour le dépôt : « application/x-dwg »' },
        ] },
    ];
    const h = renderToStaticMarkup(createElement(BlocARattacher, { reponses }));
    expect(h).toContain('PC2.pdf');
    expect(h).toContain('stockée');
    expect(h).toContain('plan.dwg');
    expect(h).toContain('non stockée');
    expect(h).toContain('type non autorisé pour le dépôt');
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
      rebondsDetectes: null, rebondsRattaches: null, rebondsEtrangers: null, rebondsAppliques: null, enregistrees: null,
      piecesDeposees: null, piecesNonDeposees: null, erreur: 'IMAP timeout',
    }];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).toContain('IMAP timeout');
    expect(h).toContain('role="alert"');
  });
});

describe('T1 — TableRuns : ne montrer en clair que les passes qui apportent quelque chose', () => {
  // Un run 'ok' terminé, tous compteurs à 0 par défaut ; chaque cas ne surcharge que ce qui l'intéresse.
  const runOk = (patch: Partial<LigneRun>): LigneRun => ({
    demarreLe: '2026-04-20T09:00:00Z', termineLe: '2026-04-20T09:00:04Z', declencheur: 'planifie', resultat: 'ok',
    vus: 0, dejaConnus: 0, horsPerimetre: 0, retenus: 0, rattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, enregistrees: 0,
    piecesDeposees: 0, piecesNonDeposees: 0, erreur: null, ...patch,
  });

  it('apporteUneNouveaute : vrai dès qu’un compteur d’événement > 0, faux pour le seul bruit', () => {
    expect(apporteUneNouveaute(runOk({ retenus: 1 }))).toBe(true);
    expect(apporteUneNouveaute(runOk({ rattaches: 1 }))).toBe(true);
    expect(apporteUneNouveaute(runOk({ rebondsRattaches: 1 }))).toBe(true);
    expect(apporteUneNouveaute(runOk({ rebondsAppliques: 1 }))).toBe(true);
    expect(apporteUneNouveaute(runOk({ enregistrees: 1 }))).toBe(true);
    expect(apporteUneNouveaute(runOk({ piecesDeposees: 1 }))).toBe(true);
    // bruit seul (dont les 3 rebonds ÉTRANGERS re-détectés à chaque passe) → aucune nouveauté
    expect(apporteUneNouveaute(runOk({ vus: 3, dejaConnus: 5, horsPerimetre: 2, rebondsDetectes: 3, rebondsEtrangers: 3, piecesNonDeposees: 4 }))).toBe(false);
    // NULL traité comme 0
    expect(apporteUneNouveaute(runOk({ vus: null, retenus: null, enregistrees: null }))).toBe(false);
  });

  it('3 rebonds étrangers, rien d’autre → ligne repliée avec « Rien de nouveau »', () => {
    const runs: LigneRun[] = [runOk({ vus: 3, rebondsDetectes: 3, rebondsEtrangers: 3 })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).toContain('Rien de nouveau');
    expect(h).toContain('<details');
    expect(h).toContain('voir les compteurs');
  });

  it('1 réponse enregistrée → ligne affichée en entier (pas de repli)', () => {
    const runs: LigneRun[] = [runOk({ vus: 4, enregistrees: 1 })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).not.toContain('Rien de nouveau');
    expect(h).not.toContain('<details');
  });

  it('seulement des pièces déposées > 0 → ligne affichée en entier', () => {
    const runs: LigneRun[] = [runOk({ piecesDeposees: 2, piecesNonDeposees: 1 })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).not.toContain('Rien de nouveau');
    expect(h).not.toContain('<details');
  });

  it('résultat « erreur » avec tous compteurs à 0 → affichée en entier, jamais repliée', () => {
    const runs: LigneRun[] = [runOk({ resultat: 'erreur', erreur: 'connexion refusée' })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).not.toContain('Rien de nouveau');
    expect(h).toContain('connexion refusée');
    expect(h).toContain('role="alert"');
  });

  it('les compteurs de bruit restent présents dans le dépliant d’une ligne repliée', () => {
    const runs: LigneRun[] = [runOk({ vus: 3, rebondsDetectes: 3, rebondsEtrangers: 3 })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).toContain('reb. étrangers 3');
    expect(h).toContain('vus 3');
    expect(h).toContain('reb. détectés 3');
  });

  it('tableau non vide → phrase explicative de repli sous le tableau ; tableau vide → phrase existante seule', () => {
    const avec = renderToStaticMarkup(createElement(TableRuns, { runs: [runOk({ enregistrees: 1 })] }));
    expect(avec).toContain('re-détectés');
    const vide = renderToStaticMarkup(createElement(TableRuns, { runs: [] as LigneRun[] }));
    expect(vide).toContain('Aucune relève enregistrée');
    expect(vide).not.toContain('re-détectés');
    expect(vide).not.toContain('<table');
  });
});

describe('R5a — DetailDossiers : satisfait/dû et par quoi', () => {
  it('un dossier obtenu (automatique) et un dossier dû sont distingués', () => {
    const dossiers: DossierSuivi[] = [
      { dossierId: 1, numDau: 'PC0920042500001', adresse: '12 rue de la Paix', satisfait: true, satisfaitPar: 'automatique', triage: null, refusLe: null },
      { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null },
    ];
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers }));
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

// ── R5b — actions de l'écran Réponses (rendu pur : les boutons/callbacks sont là, aux bons endroits) ──────────────────────
const OPT: OptionDemande[] = [
  { demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnieres', envoyeLe: '2026-04-01T10:00:00Z' },
];
/** Une réponse « à rattacher » avec une pièce stockée et une pièce non stockée. */
function reponse(pieces: ReponseARattacher['pieces']): ReponseARattacher {
  return { id: 5, recuLe: '2026-04-19T09:30:00Z', deAdresse: 'urba@mairie-x.fr', deNom: null, objet: 'RE: demande', nbPieces: pieces.length, rattachementMethode: 'aucun', pieces };
}
const compte = (h: string, s: string) => h.split(s).length - 1;

describe('R5b — BlocARattacher : rattacher / traitée / télécharger', () => {
  it('avec callbacks → sélecteur de demande (référence + commune + date, jamais un id à saisir) + boutons Rattacher/Traitée', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([{ id: 50, nomFichier: 'PC2.pdf', stockee: true, motif: null }])],
      demandes: OPT, selection: {},
      onChoisir: () => {}, onRattacher: () => {}, onTraiter: () => {}, onTelecharger: () => {},
    }));
    expect(h).toContain('Rattacher à…');               // colonne d'action présente
    expect(h).toContain('<select');                     // sélecteur, pas un champ id libre
    expect(h).toContain('SVAV-DEM-2026-000042');        // l'option montre la RÉFÉRENCE…
    expect(h).toContain('Asnieres');                    // …la commune…
    expect(h).toContain('2026-04-01');                  // …et la date d'envoi
    expect(h).toContain('Rattacher');
    expect(h).toContain('Traitée');
  });

  it('pièce STOCKÉE + onTelecharger → bouton « télécharger » (aucune clé de stockage n’apparaît, PieceInfo n’en porte pas)', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([{ id: 50, nomFichier: 'PC2.pdf', stockee: true, motif: null }])],
      demandes: OPT, selection: {}, onRattacher: () => {}, onTelecharger: () => {},
    }));
    expect(h).toContain('télécharger');
    expect(h).not.toContain('cle_stockage');
    expect(h).not.toContain('href');                    // pas de lien portant un chemin de stockage : l'URL signée est demandée au serveur
  });

  it('pièce NON stockée → motif affiché, AUCUN lien de téléchargement même si onTelecharger est fourni', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([{ id: 51, nomFichier: 'plan.dwg', stockee: false, motif: 'type non autorisé pour le dépôt' }])],
      demandes: OPT, selection: {}, onRattacher: () => {}, onTelecharger: () => {},
    }));
    expect(h).toContain('plan.dwg');
    expect(h).toContain('non stockée');
    expect(h).toContain('type non autorisé pour le dépôt');
    expect(h).not.toContain('télécharger');
  });

  it('sans callbacks (lecture seule R5a) → aucune colonne d’action, aucun sélecteur, aucun bouton de téléchargement', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([{ id: 50, nomFichier: 'PC2.pdf', stockee: true, motif: null }])],
    }));
    expect(h).not.toContain('Rattacher à…');
    expect(h).not.toContain('<select');
    expect(h).not.toContain('télécharger');
    expect(h).toContain('stockée');                     // l'info reste lisible
  });

  it('bouton Rattacher désactivé tant qu’aucune demande n’est choisie', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([])], demandes: OPT, selection: {},
      onChoisir: () => {}, onRattacher: () => {}, onTraiter: () => {}, onTelecharger: () => {},
    }));
    expect(h).toContain('disabled');
  });
});

describe('R5b — DetailDossiers : marquer reçu / annuler, et garde-fou « close »', () => {
  const dossiers: DossierSuivi[] = [
    { dossierId: 1, numDau: 'PC0920042500001', adresse: null, satisfait: true, satisfaitPar: 'manuel', triage: null, refusLe: null },
    { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null },
  ];

  it('demande envoyée + onMarquer → « annuler » sur le satisfait, « marquer reçu » sur le dû', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers, onMarquer: () => {} }));
    expect(h).toContain('annuler');
    expect(h).toContain('marquer reçu');
  });

  it('demande CLOSE → message explicite et AUCUN bouton de marquage (jamais un bouton inerte)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'close', dossiers, onMarquer: () => {} }));
    expect(h).toContain('Demande close');
    expect(h).toContain('le marquage des dossiers est désactivé');
    expect(h).not.toContain('marquer reçu');
    expect(h).not.toContain('annuler');
    expect(h).not.toContain('<button');
  });
});

// ── T1 — statuer chaque dossier ligne par ligne (4 actions), formulaire de refus daté, avertissement de retrait ──────────
describe('T1 — DetailDossiers : 4 actions par ligne + réversibilité', () => {
  const rien = () => {};
  const DU: DossierSuivi = { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null };
  const cbs = { onMarquer: rien, onNonFourni: rien, onAnnulerTriage: rien, onRefusOuvrir: rien, onRefusDateChange: rien, onRefusConfirmer: rien, onRefusAnnuler: rien, onRetirerOuvrir: rien, onRetirerConfirmer: rien, onRetirerAnnuler: rien };

  it('dossier dû → les 4 actions distinctes (reçu / non fourni / refus mairie / retirer)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], ...cbs }));
    expect(h).toContain('marquer reçu');
    expect(h).toContain('non fourni');
    expect(h).toContain('refus mairie');
    expect(h).toContain('retirer');
  });

  it('dossier « non fourni » → état « reste dû » + « annuler le statut » (le dossier n’est PAS satisfait)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [{ ...DU, triage: 'non_fourni' }], ...cbs }));
    expect(h).toContain('non fourni (reste dû)');
    expect(h).toContain('annuler le statut');
    expect(h).not.toContain('tip-7-2-marquer_recu'); // le BOUTON « marquer reçu » n’est pas offert (l’aide, elle, décrit toujours toutes les actions)
  });

  it('dossier « refus mairie » → montre la DATE de notification + « annuler le statut »', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [{ ...DU, triage: 'refus_mairie', refusLe: '2026-05-03' }], ...cbs }));
    expect(h).toContain('refus mairie');
    expect(h).toContain('notifié le 2026-05-03');
    expect(h).toContain('annuler le statut');
  });

  it('dossier SATISFAIT → « annuler » seulement, JAMAIS « retirer » (on ne détache pas un dossier obtenu)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [{ ...DU, satisfait: true, satisfaitPar: 'manuel' }], ...cbs }));
    expect(h).toContain('annuler');
    expect(h).not.toContain('tip-7-2-retirer');    // JAMAIS le bouton « retirer » sur un dossier obtenu (l’aide décrit l’action, mais aucun bouton ne l’offre ici)
    expect(h).not.toContain('tip-7-2-non_fourni'); // ni le bouton « non fourni »
  });

  it('formulaire de refus ouvert → champ date borné à aujourd’hui (max) + « confirmer le refus »', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, {
      demandeId: 7, statut: 'envoyee', dossiers: [DU], aujourdhui: '2026-08-12',
      refusOuvertDossierId: 2, refusDate: '2026-05-03', ...cbs,
    }));
    expect(h).toContain('type="date"');
    expect(h).toContain('max="2026-08-12"');
    expect(h).toContain('confirmer le refus');
    expect(h).not.toContain('disabled'); // date passée valide → bouton actif
  });

  it('formulaire de refus avec date FUTURE → « confirmer » désactivé (garde écran, la route reste l’autorité)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, {
      demandeId: 7, statut: 'envoyee', dossiers: [DU], aujourdhui: '2026-08-12',
      refusOuvertDossierId: 2, refusDate: '2999-12-31', ...cbs,
    }));
    expect(h).toContain('disabled');
  });

  it('avertissement de retrait → DIT ce qui se passe (quitte la demande, redevient demandable dans « À demander »), pas un « êtes-vous sûr ? »', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, {
      demandeId: 7, statut: 'envoyee', dossiers: [DU], retirerOuvertDossierId: 2, ...cbs,
    }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('quitter la demande');
    expect(h).toContain('redevient demandable');
    expect(h).toContain('À demander');
    expect(h).toContain('confirmer le retrait');
    expect(h).not.toContain('êtes-vous sûr');
  });
});

// ── U1 — expliquer les boutons : source de vérité unique, infobulle reliée (aria-describedby), relais tactile <details> ──
describe('U1 — aide des boutons d’action de statut', () => {
  const rien = () => {};
  const cbs = { onMarquer: rien, onNonFourni: rien, onAnnulerTriage: rien, onRefusOuvrir: rien, onRefusDateChange: rien, onRefusConfirmer: rien, onRefusAnnuler: rien, onRetirerOuvrir: rien, onRetirerConfirmer: rien, onRetirerAnnuler: rien };
  const DU: DossierSuivi = { dossierId: 2, numDau: 'PCz', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null };
  const parCle = (cle: string) => AIDE_ACTIONS_DOSSIER.find((a) => a.cle === cle)!;

  it('chaque bouton porte sa légende reliée par aria-describedby (bouton → id de l’infobulle → phrase EXACTE de la source)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], ...cbs }));
    for (const cle of ['marquer_recu', 'non_fourni', 'refus_mairie', 'retirer'] as const) {
      const id = `tip-7-2-${cle}`;
      expect(h).toContain(`aria-describedby="${id}"`);        // le bouton référence sa description…
      expect(h).toContain(`id="${id}" class="svv-tip"`);      // …qui est bien l’infobulle CSS portant cet id
      expect(h).toContain(parCle(cle).phrase);                // et la phrase est celle de la source unique
    }
  });

  it('l’infobulle n’est pas un `title` natif (invisible au toucher, non stylable)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], ...cbs }));
    expect(h).not.toContain('title=');
    expect(h).toContain('role="tooltip"'); // infobulle sémantique, stylée en CSS (survol + focus)
  });

  it('dépliant tactile « À quoi servent ces boutons ? » : <details> replié par défaut, mêmes textes que les infobulles', () => {
    const h = renderToStaticMarkup(createElement(AideActionsDossier, {}));
    expect(h).toContain('À quoi servent ces boutons ?');
    expect(h).toContain('<details');
    expect(h).not.toContain('open='); // replié par défaut (pas d’attribut open)
    for (const a of AIDE_ACTIONS_DOSSIER) {
      expect(h).toContain(a.label);
      expect(h).toContain(a.phrase); // exactement la même phrase que l’infobulle du bouton correspondant
    }
  });

  it('le dépliant est en TÊTE de liste dès qu’il y a des actions, et absent si la demande est close', () => {
    const ouvert = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], ...cbs }));
    expect(ouvert).toContain('À quoi servent ces boutons ?');
    const close = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'close', dossiers: [DU], ...cbs }));
    expect(close).not.toContain('À quoi servent ces boutons ?'); // aucun bouton à expliquer → aucune aide
  });

  it('source unique : exactement les 5 actions attendues, dans l’ordre d’apparition des boutons', () => {
    expect(AIDE_ACTIONS_DOSSIER.map((a) => a.cle)).toEqual(['marquer_recu', 'non_fourni', 'refus_mairie', 'retirer', 'annuler_statut']);
  });
});

describe('R5b — retour d’action : dans la zone du bouton cliqué, jamais dédoublé', () => {
  it('messageIci ne rend le message qu’à la clé correspondante', () => {
    const retour: RetourCible = { cle: 'rattacher-5', texte: 'Rattachée.', ok: true };
    expect(messageIci(retour, 'rattacher-5')).not.toBeNull();
    expect(messageIci(retour, 'traiter-5')).toBeNull();
    expect(messageIci(retour, 'piece-5')).toBeNull();
    expect(messageIci(null, 'rattacher-5')).toBeNull();
  });

  it('BlocARattacher : un retour « rattacher-5 » s’affiche UNE seule fois (pas dans les zones traiter/pièce)', () => {
    const retour: RetourCible = { cle: 'rattacher-5', texte: 'Rattachée à la demande.', ok: true };
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([{ id: 50, nomFichier: 'PC2.pdf', stockee: true, motif: null }])],
      demandes: OPT, selection: {}, retour,
      onChoisir: () => {}, onRattacher: () => {}, onTraiter: () => {}, onTelecharger: () => {},
    }));
    expect(compte(h, 'Rattachée à la demande.')).toBe(1);
  });

  it('DetailDossiers : le retour d’un dossier s’affiche à SA ligne, une seule fois', () => {
    const dossiers: DossierSuivi[] = [
      { dossierId: 1, numDau: 'PCa', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null },
      { dossierId: 2, numDau: 'PCb', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null },
    ];
    const retour: RetourCible = { cle: 'dossier-7-1', texte: 'Dossier marqué reçu.', ok: true };
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers, retour, onMarquer: () => {} }));
    expect(compte(h, 'Dossier marqué reçu.')).toBe(1);
  });
});

// ── R5c — relances éditables + clôture / réouverture ──────────────────────────────────────────────────────────────────
const noop = () => {};
const RELANCE: RelancePreparee = {
  id: 9, genereeLe: '2026-04-20T08:00:00Z', demandeId: 42, reference: 'SVAV-DEM-2026-000042',
  communeNom: 'Asnieres', objet: 'Relance — obj', corps: 'CORPS RELANCE',
};

describe('R5c — RelanceCarte : édition (objet/corps) + régénérer / abandonner', () => {
  it('dépliée + callbacks → objet et corps éditables, boutons Enregistrer / Régénérer / Abandonner', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, {
      relance: RELANCE, ouvert: true, onChangeObjet: noop, onChangeCorps: noop, onEnregistrer: noop, onRegenerer: noop, onAbandonner: noop,
    }));
    expect(h).toContain('<input');
    expect(h).toContain('<textarea');
    expect(h).toContain('Enregistrer');
    expect(h).toContain('Régénérer');
    expect(h).toContain('Abandonner');
  });

  it('les valeurs d’édition EN COURS priment sur le texte stocké (rien ne le régénère en douce)', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, {
      relance: RELANCE, ouvert: true, objet: 'OBJ EDITE', corps: 'CORPS EDITE',
      onChangeObjet: noop, onChangeCorps: noop, onEnregistrer: noop, onRegenerer: noop, onAbandonner: noop,
    }));
    expect(h).toContain('OBJ EDITE');
    expect(h).toContain('CORPS EDITE');
  });

  it('fermée → pas de textarea (le corps ne s’édite qu’une fois déplié) ; objet lisible', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, {
      relance: RELANCE, ouvert: false, onChangeObjet: noop, onChangeCorps: noop, onEnregistrer: noop, onRegenerer: noop, onAbandonner: noop,
    }));
    expect(h).not.toContain('<textarea');
    expect(h).toContain('Relance — obj');
  });

  it('sans callbacks (lecture seule R5a) → corps en <pre>, aucun champ ni bouton', () => {
    const h = renderToStaticMarkup(createElement(RelanceCarte, { relance: RELANCE, ouvert: true }));
    expect(h).toContain('CORPS RELANCE');
    expect(h).not.toContain('<textarea');
    expect(h).not.toContain('<button');
  });

  it('le retour « relance-9 » se rend une seule fois, côté carte', () => {
    const retour: RetourCible = { cle: 'relance-9', texte: 'Relance enregistrée.', ok: true };
    const h = renderToStaticMarkup(createElement(RelanceCarte, {
      relance: RELANCE, ouvert: true, retour, onChangeObjet: noop, onChangeCorps: noop, onEnregistrer: noop, onRegenerer: noop, onAbandonner: noop,
    }));
    expect(compte(h, 'Relance enregistrée.')).toBe(1);
  });
});

describe('R5c — ActionsCloture : clôturer / rouvrir + avertissement de clôture partielle', () => {
  it('demande CLOSE → badge « Clôturée » et bouton Rouvrir (visible, jamais disparue) ; aucun bouton Clôturer', () => {
    const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut: 'close', dossiersDus: 0, onRouvrir: noop }));
    expect(h).toContain('Clôturée');
    expect(h).toContain('Rouvrir');
    expect(h).not.toContain('Clôturer');
  });

  it('demande ENVOYÉE, tous dossiers obtenus → conséquence annoncée + Clôturer actif, aucun champ motif', () => {
    const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut: 'envoyee', dossiersDus: 0, onCloturer: noop, onMotif: noop }));
    expect(h).toContain('empêche toute relance');
    expect(h).toContain('sort la demande de la surveillance');
    expect(h).toContain('Clôturer');
    expect(h).not.toContain('<input');
    expect(h).not.toContain('disabled');
  });

  it('demande ENVOYÉE avec dossiers DUS → avertissement de clôture partielle + champ motif + Clôturer désactivé si motif vide', () => {
    const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut: 'envoyee', dossiersDus: 2, motif: '', onCloturer: noop, onMotif: noop }));
    expect(h).toContain('2 dossier(s) restent dus');
    expect(h).toContain('un motif est requis');
    expect(h).toContain('<input');
    expect(h).toContain('disabled');
  });

  it('dossiers DUS + motif saisi → bouton Clôturer actif', () => {
    const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut: 'envoyee', dossiersDus: 2, motif: 'relance restée sans réponse', onCloturer: noop, onMotif: noop }));
    expect(h).not.toContain('disabled');
  });

  it('statut brouillon / prête / annulée → aucun contrôle (rien à clôturer)', () => {
    for (const statut of ['brouillon', 'prete', 'annulee']) {
      const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut, dossiersDus: 0, onCloturer: noop, onRouvrir: noop }));
      expect(h).toBe('');
    }
  });
});

describe('T2 — TableRuns : ligne de total en <tfoot> + sélecteur de période', () => {
  const noop = () => {};
  const run = (): LigneRun => ({
    demarreLe: '2026-08-09T09:00:00Z', termineLe: '2026-08-09T09:00:04Z', declencheur: 'planifie', resultat: 'ok',
    vus: 1, dejaConnus: 0, horsPerimetre: 0, retenus: 1, rattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, enregistrees: 1,
    piecesDeposees: 0, piecesNonDeposees: 0, erreur: null,
  });
  const cumul = (over: Partial<CumulFenetre> = {}): CumulFenetre => ({
    nbReleves: 5, nbErreurs: 0, vus: 30, dejaConnus: 10, horsPerimetre: 2, retenus: 4, rattaches: 3,
    rebondsDetectes: 6, rebondsRattaches: 1, rebondsEtrangers: 9, rebondsAppliques: 2, enregistrees: 7,
    piecesDeposees: 8, piecesNonDeposees: 5, ...over,
  });

  it('cumul fourni → un <tfoot> avec la ligne de total, alignée sur COLS_RUN (12 cellules) + libellé de fenêtre', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul(), periode: '7j', onPeriode: noop }));
    expect(h).toContain('<tfoot');
    expect(h).toContain('Total');
    expect(h).toContain('7 derniers jours');
    // 3 cellules fixes (colSpan 3) + 12 cellules de compteurs → les 12 valeurs du cumul sont présentes
    for (const v of [30, 10, 2, 4, 3, 6, 1, 9, 2, 7, 8, 5]) expect(h).toContain(`>${v}</td>`);
  });

  it('le décompte de relèves s’affiche ; « dont N en erreur » seulement si > 0', () => {
    const sansErr = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul({ nbReleves: 5, nbErreurs: 0 }), periode: '7j', onPeriode: noop }));
    expect(sansErr).toContain('5 relèves');
    expect(sansErr).not.toContain('en erreur');
    const avecErr = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul({ nbReleves: 12, nbErreurs: 2 }), periode: '7j', onPeriode: noop }));
    expect(avecErr).toContain('12 relèves');
    expect(avecErr).toContain('dont 2 en erreur');
  });

  it('les 6 colonnes de BRUIT du total portent la marque d’atténuation ; pas les 6 d’événement', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul(), periode: '7j', onPeriode: noop }));
    expect(h).toContain('compté plusieurs fois'); // marque présente
    expect((h.match(/compté plusieurs fois/g) ?? []).length).toBe(6); // exactement les 6 colonnes de bruit
  });

  it('zéro relève sur la période → phrase explicite, jamais une ligne de zéros muette', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul({ nbReleves: 0, nbErreurs: 0 }), periode: '24h', onPeriode: noop }));
    expect(h).toContain('Aucune relève sur cette fenêtre');
    expect(h).toContain('24 dernières heures');
    expect(h).not.toContain('5 relèves');
  });

  it('sélecteur de période présent avec <label> associé et les six options', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul(), periode: '7j', onPeriode: noop }));
    expect(h).toContain('id="cumul-periode"');
    expect(h).toContain('for="cumul-periode"'); // htmlFor rendu en for=
    expect(h).toContain('24 dernières heures');
    expect(h).toContain('depuis le début');
    // note d'honnêteté des chiffres sous le tableau
    expect(h).toContain('cumulables sans ambiguïté');
  });

  it('SelecteurPeriode isolé : select contrôlé + label lié + toutes les fenêtres', () => {
    const h = renderToStaticMarkup(createElement(SelecteurPeriode, { periode: '30j', onPeriode: noop }));
    expect(h).toContain('for="cumul-periode"');
    expect(h).toContain('<select');
    for (const lib of ['24 dernières heures', '7 derniers jours', '30 derniers jours', '90 derniers jours', '365 derniers jours', 'depuis le début']) {
      expect(h).toContain(lib);
    }
  });

  it('rétrocompat T1 : sans cumul → aucun <tfoot>, aucun sélecteur', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()] }));
    expect(h).not.toContain('<tfoot');
    expect(h).not.toContain('cumul-periode');
    expect(h).not.toContain('cumulables sans ambiguïté');
  });
});
