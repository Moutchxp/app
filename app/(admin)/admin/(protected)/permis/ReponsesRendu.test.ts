import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  IndicateurReleve, BadgeEtat, ETAT_LABELS, CompteSatisfaction, BlocARattacher, DetailDossiers, RelanceCarte, TableRuns,
  ActionsCloture, messageIci, type OptionDemande, type RetourCible,
} from './ReponsesRendu';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, ReponseARattacher, RelancePreparee, DossierSuivi } from '../../../../lib/veille/reponsesSuivi';

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

describe('R5a — DetailDossiers : satisfait/dû et par quoi', () => {
  it('un dossier obtenu (automatique) et un dossier dû sont distingués', () => {
    const dossiers: DossierSuivi[] = [
      { dossierId: 1, numDau: 'PC0920042500001', adresse: '12 rue de la Paix', satisfait: true, satisfaitPar: 'automatique' },
      { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null },
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
    { dossierId: 1, numDau: 'PC0920042500001', adresse: null, satisfait: true, satisfaitPar: 'manuel' },
    { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null },
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
      { dossierId: 1, numDau: 'PCa', adresse: null, satisfait: false, satisfaitPar: null },
      { dossierId: 2, numDau: 'PCb', adresse: null, satisfait: false, satisfaitPar: null },
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

  it('statut brouillon / prête / abandonnée → aucun contrôle (rien à clôturer)', () => {
    for (const statut of ['brouillon', 'prete', 'abandonnee']) {
      const h = renderToStaticMarkup(createElement(ActionsCloture, { demandeId: 7, statut, dossiersDus: 0, onCloturer: noop, onRouvrir: noop }));
      expect(h).toBe('');
    }
  });
});
