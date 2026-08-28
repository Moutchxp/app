import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  IndicateurReleve, BadgeEtat, ETAT_LABELS, CompteSatisfaction, BlocARattacher, BlocPropositions, DetailDossiers, RelanceCarte, TableRuns, BlocEtatReleve,
  apporteUneNouveaute, SelecteurPeriode, ActionsCloture, messageIci, AIDE_ACTIONS_DOSSIER, AideActionsDossier,
  EtatDemande, RappelObtenusArchives, partitionnerDemandes, partitionnerReponses, demandeADuRetour, messageReponsesVide, aReponseSansDocuments, BadgeReponseSansDocuments,
  BlocLiens, mentionExpiration, BlocAlertesGed, BlocMessagesAutre, BlocPiecesReponses, tronquerObjet,
  trierOptionsDemandes, marqueurOption,
  type OptionDemande, type RetourCible,
} from './ReponsesRendu';
import type { EtatEcheance } from '../../../../lib/veille/echeance';
import type { LigneRun, ReponseARattacher, RelancePreparee, DossierSuivi, CumulFenetre, PropositionDepotAffichee, ReglagesReleve, LienAffiche, AlerteGedAffiche } from '../../../../lib/veille/reponsesSuivi';

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

describe('U8 — BlocEtatReleve : encart « État de la relève » repliable (replié = titre + ligne d’état)', () => {
  const REGLAGES: ReglagesReleve = { active: true, intervalleMinutes: 30, profil: 'entreprise', fraicheurHeures: 48, alerteJours: 7, adresseReleve: 'permis@sansvisavis.fr' };
  const RUN = (over: Partial<LigneRun> = {}): LigneRun => ({
    demarreLe: '2026-04-20T11:00:00Z', termineLe: '2026-04-20T11:00:05Z', declencheur: 'planifie', resultat: 'ok',
    vus: 4, dejaConnus: 0, horsPerimetre: 0, horsPerimetreSonde: null, horsPerimetreSansAncre: null, emisParNous: 0, retenus: 1, rattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0, enregistrees: 1,
    piecesDeposees: 0, piecesNonDeposees: 0, erreur: null, ...over,
  });
  const CUMUL: CumulFenetre = {
    nbReleves: 5, nbErreurs: 0, vus: 30, dejaConnus: 10, horsPerimetre: 2, emisParNous: 0, retenus: 4, rattaches: 3,
    rebondsDetectes: 6, rebondsRattaches: 1, rebondsEtrangers: 9, rebondsAppliques: 2, accuses: 3, enregistrees: 7, piecesDeposees: 8, piecesNonDeposees: 5,
  };
  const NOW = new Date('2026-04-20T12:00:00Z');
  const rendu = (over?: Partial<Parameters<typeof BlocEtatReleve>[0]>) => renderToStaticMarkup(createElement(BlocEtatReleve, {
    reglages: REGLAGES, derniereOkLe: '2026-04-20T11:48:00Z', releveDepuisLe: '2026-04-17T11:00:00Z', relevePlafondAtteint: false,
    runs: [RUN()], cumul: CUMUL, periode: '7j', maintenant: NOW,
    ouvert: false, onToggle: () => {}, onPeriode: () => {}, ...over,
  }));

  it('P1 — « on relève depuis le … » toujours visible ; plafond atteint → avertissement « EN RETARD » (jamais une valeur cachée)', () => {
    const h = rendu({ ouvert: false });
    expect(h).toContain('On relève depuis le 2026-04-17');
    expect(h).not.toContain('Plafond atteint');
    const hPlaf = rendu({ ouvert: false, relevePlafondAtteint: true });
    expect(hPlaf).toContain('Plafond atteint');
    expect(hPlaf).toContain('EN RETARD');
    const hVide = rendu({ ouvert: false, releveDepuisLe: null });
    expect(hVide).toContain('rattrapage complet'); // premier run : jamais muet
  });

  it('REPLIÉ (défaut) : titre + ligne d’état visibles ; tableau des 10 relèves et phrases explicatives ABSENTS du markup', () => {
    const h = rendu({ ouvert: false });
    expect(h).toContain('État de la relève');
    expect(h).toContain('Dernière relève réussie il y a'); // la ligne d’état (IndicateurReleve) reste visible replié
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('10 dernières relèves');       // le tableau n’est pas dans le markup replié
    expect(h).not.toContain('cumulables sans ambiguïté');  // ni la dernière phrase explicative
    expect(h).not.toContain('<table');
  });

  it('DÉPLOYÉ : tableau, ligne de total et les DEUX phrases explicatives présents (dernière = « … cumulables sans ambiguïté »)', () => {
    const h = rendu({ ouvert: true });
    expect(h).toContain('10 dernières relèves');
    expect(h).toContain('<table');
    expect(h).toContain('Total');                          // ligne de total (tfoot, cumul fourni)
    expect(h).toContain('re-détectés');                    // 1re phrase explicative
    expect(h).toContain('cumulables sans ambiguïté');      // 2e (dernière) phrase, INCLUSE
    expect(h).toContain('aria-expanded="true"');
  });

  it('la LIGNE D’ÉTAT est rendue à l’identique replié et déployé, y compris son variant d’ÉCHEC (aucun dépliage auto)', () => {
    const replieEchec = rendu({ ouvert: false, derniereOkLe: null }); // jamais de relève réussie → alerte
    expect(replieEchec).toContain('Aucune relève réussie à ce jour'); // l’alerte est portée par la ligne, même repliée
    expect(replieEchec).not.toContain('10 dernières relèves');        // AUCUN dépliage automatique en échec
    const deployeEchec = rendu({ ouvert: true, derniereOkLe: null });
    expect(deployeEchec).toContain('Aucune relève réussie à ce jour'); // même ligne d’état une fois déployé
    // cas nominal : même texte d’état des deux côtés
    expect(rendu({ ouvert: false })).toContain('Dernière relève réussie il y a');
    expect(rendu({ ouvert: true })).toContain('Dernière relève réussie il y a');
  });

  it('déployé : le dépliant par ligne (T1, <details>) et le sélecteur de période (T2) restent INCHANGÉS à l’intérieur', () => {
    // run « rien de nouveau » → T1 replie la ligne en <details> ; cumul fourni → le sélecteur de période T2 est présent
    const h = rendu({ ouvert: true, runs: [RUN({ vus: 3, retenus: 0, enregistrees: 0, rebondsDetectes: 3, rebondsEtrangers: 3 })] });
    expect(h).toContain('<details');                 // T1 inchangé
    expect(h).toContain('id="cumul-periode"');       // T2 sélecteur de période inchangé
    expect(h).toContain('24 dernières heures');
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

describe('T6-A/2 — demandeADuRetour + partitionnerReponses : filtre local + EXCLUSION stricte des « sans retour »', () => {
  const dem = (over: Partial<{ nbReponsesReelles: number; dossiersActifs: number; dossiersSatisfaits: number; dossiers: { triage: string | null }[] }> = {}) =>
    ({ nbReponsesReelles: 0, dossiersActifs: 2, dossiersSatisfaits: 0, dossiers: [{ triage: null }, { triage: null }], ...over });

  it('demandeADuRetour : 154 → false ; a RÉPONDU / satisfait / triage → true ; accusé seul OU rebond seul → false', () => {
    expect(demandeADuRetour(dem())).toBe(false);                                        // 154 : 0 « a répondu », 0 statué → hors Réponses
    expect(demandeADuRetour(dem({ nbReponsesReelles: 1 }))).toBe(true);                 // ≥ 1 vrai retour (hors accusé, hors rebond)
    expect(demandeADuRetour(dem({ dossiersSatisfaits: 1 }))).toBe(true);                // ≥ 1 dossier satisfait
    expect(demandeADuRetour(dem({ dossiers: [{ triage: 'non_fourni' }] }))).toBe(true); // dossier dû trié
    // T3 — accusé seul OU rebond rattaché seul : nbReponsesReelles reste 0 (nature 'accuse'/'rebond' exclue de « a répondu »,
    //   cf. reponsesSuivi) → HORS de « Réponses ». (Un accusé compte tout de même comme « a écrit » côté « En cours » ; un rebond non.)
    expect(demandeADuRetour(dem({ nbReponsesReelles: 0 }))).toBe(false);
  });

  it('FUS — EXCLUSIVITÉ En cours ↔ Réponses par la MÊME règle : une demande à retour (même PARTIELLE, dossiers dus) est EXCLUE de En cours ET présente dans Réponses ; une sans-retour l’inverse', () => {
    const partielle = dem({ nbReponsesReelles: 1, dossiersActifs: 2, dossiersSatisfaits: 0 }); // 1 retour + 2 dus
    const sansRetour = dem({ nbReponsesReelles: 0, dossiersActifs: 2, dossiersSatisfaits: 0 });
    // L'exclusion d'affichage « En cours » (aRetourIds dans SuiviDemandes) réutilise EXACTEMENT ce prédicat (un seul foyer).
    expect(demandeADuRetour(partielle)).toBe(true);   // → quitte l'affichage En cours (foyer Réponses), même avec des dus
    expect(demandeADuRetour(sansRetour)).toBe(false); // → reste En cours
    // …et le MÊME prédicat la fait ENTRER dans Réponses → jamais dans les deux onglets à la fois.
    expect(partitionnerReponses([partielle, sansRetour], true).affichees).toEqual([partielle]);
  });

  it('lot 4 — EXCLUSIVITÉ : un permis EN CASCADE (relance vivante/préparée, aucun retour mairie) reste « En cours », JAMAIS dans « Réponses »', () => {
    // demandeADuRetour ne regarde QUE le retour de la MAIRIE (nbReponsesReelles / satisfait / triage) — jamais « a une relance vivante ».
    //   Un permis en pleine cascade sans vrai retour = nbReponsesReelles 0, aucun dossier satisfait/trié → hors Réponses.
    const enCascade = dem({ nbReponsesReelles: 0, dossiersActifs: 2, dossiersSatisfaits: 0, dossiers: [{ triage: null }, { triage: null }] });
    expect(demandeADuRetour(enCascade)).toBe(false);                         // reste « En cours » (la relance est NOTRE action, pas un retour)
    expect(partitionnerReponses([enCascade], true).affichees).toEqual([]);   // n'apparaît PAS dans « Réponses » → jamais dans les deux onglets
  });

  it('partitionnerReponses : la demande SANS retour est EXCLUE, MÊME avec afficherTout (jamais dans « affichees »)', () => {
    const sansRetour = dem({ nbReponsesReelles: 0, dossiersActifs: 2, dossiersSatisfaits: 0 });  // 154 (ou : accusé/rebond seul)
    const avecMessage = dem({ nbReponsesReelles: 1, dossiersActifs: 2, dossiersSatisfaits: 0 }); // vivante avec vrai retour
    const soldee = dem({ nbReponsesReelles: 1, dossiersActifs: 2, dossiersSatisfaits: 2 });      // retour + 0 dû → soldée (masquée par confort)
    const liste = [sansRetour, avecMessage, soldee];

    const defaut = partitionnerReponses(liste, false);
    expect(defaut.affichees).toEqual([avecMessage]);   // défaut : seulement les vivantes AVEC retour
    expect(defaut.soldees).toBe(1);
    expect(defaut.sansRetour).toBe(1);

    const tout = partitionnerReponses(liste, true);
    expect(tout.affichees).toEqual([avecMessage, soldee]); // « afficher tout » RÉVÈLE la soldée (masquage de confort)…
    expect(tout.affichees).not.toContain(sansRetour);       // …mais JAMAIS la sans-retour (EXCLUSION stricte, pas révélable)
    expect(tout.sansRetour).toBe(1);                        // toujours décomptée (mention non révélable)
  });

  it('messageReponsesVide : 3 cas d’état vide, JAMAIS de phrase fausse (pas de 4e cas)', () => {
    // que des soldées / sans dossier dû (révélables) — sansRetour = 0
    expect(messageReponsesVide({ soldees: 3, sansDossier: 1, sansRetour: 0 })).toContain('soldées ou sans dossier dû');
    // que des sans-retour (exclues, foyer En cours) — masquées = 0
    const m2 = messageReponsesVide({ soldees: 0, sansDossier: 0, sansRetour: 2 });
    expect(m2).toContain('Aucune demande avec retour de la mairie');
    expect(m2).toContain('En cours');
    expect(m2).not.toContain('soldées'); // ne dit JAMAIS « soldées » quand ce sont des sans-retour
    // mélange des deux
    const m3 = messageReponsesVide({ soldees: 2, sansDossier: 0, sansRetour: 1 });
    expect(m3).toContain('soldées ou sans dossier dû');
    expect(m3).toContain('sans retour de la mairie');
    expect(m3).toContain('En cours');
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

  it('T8 — RappelObtenusArchives : « N dossier(s) marqué(s) reçu(s) — voir Archives » (jamais « obtenu ») ; N=0 → rien', () => {
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 3 }))).toContain('3 dossiers marqués reçus — voir Archives');
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 1 }))).toContain('1 dossier marqué reçu — voir Archives');
    expect(renderToStaticMarkup(createElement(RappelObtenusArchives, { n: 0 }))).toBe('');
  });
});

describe('T2 commit B — badge « réponse sans documents » (dérivé du triage non_fourni, marqueur de lisibilité pur)', () => {
  it('aReponseSansDocuments : vrai dès UN dossier dû non_fourni ; faux sinon', () => {
    expect(aReponseSansDocuments([{ triage: 'non_fourni' }, { triage: null }])).toBe(true);
    expect(aReponseSansDocuments([{ triage: null }, { triage: 'refus_mairie' }])).toBe(false);
    // un non_fourni SATISFAIT ou RETIRÉ quitte les dus (commit A) → absent de la liste → plus de badge
    expect(aReponseSansDocuments([])).toBe(false);
    expect(aReponseSansDocuments([{ triage: null }])).toBe(false);
  });

  it('le badge réutilise l’infobulle U1 : même phrase source (AIDE_ACTIONS_DOSSIER[non_fourni]) + aria-describedby + .svv-tip', () => {
    const phrase = AIDE_ACTIONS_DOSSIER.find((a) => a.cle === 'non_fourni')!.phrase;
    const h = renderToStaticMarkup(createElement(BadgeReponseSansDocuments, { demandeId: 42 }));
    expect(h).toContain('réponse sans documents');
    expect(h).toContain('aria-describedby="tip-reponse-sans-doc-42"');
    expect(h).toContain('id="tip-reponse-sans-doc-42" class="svv-tip"'); // exactement le mécanisme d’aide de U1
    expect(h).toContain(phrase);                                          // aucune phrase en dur : la source unique
    expect(h).not.toContain('title='); // pas un title natif (comme U1)
  });

  it('cohabitation : le badge n’EFFACE PAS l’échéance — les deux coexistent (empilés dans la colonne État)', () => {
    const h = renderToStaticMarkup(createElement('div', null,
      createElement(EtatDemande, { statut: 'envoyee', dossiersActifs: 3, etat: 'en_cours', motif: 'Délai en cours…' }),
      createElement(BadgeReponseSansDocuments, { demandeId: 7 }),
    ));
    expect(h).toContain('Délai en cours');         // l’information d’échéance reste
    expect(h).toContain('réponse sans documents'); // + le nouveau marqueur
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
      vus: null, dejaConnus: null, horsPerimetre: null, horsPerimetreSonde: null, horsPerimetreSansAncre: null, emisParNous: null, retenus: null, rattaches: null,
      rebondsDetectes: null, rebondsRattaches: null, rebondsEtrangers: null, rebondsAppliques: null, accuses: null, enregistrees: null,
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
    vus: 0, dejaConnus: 0, horsPerimetre: 0, horsPerimetreSonde: null, horsPerimetreSansAncre: null, emisParNous: 0, retenus: 0, rattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0, enregistrees: 0,
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

  it('J1 — le décompte hors-périmètre (aucune ancre / sonde) s’affiche quand il est connu', () => {
    const runs: LigneRun[] = [runOk({ retenus: 1, horsPerimetre: 4, horsPerimetreSansAncre: 3, horsPerimetreSonde: 1 })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).toContain('ancre 3');
    expect(h).toContain('sonde 1');
  });

  it('J1 — décompte ABSENT (migration 162 pas appliquée : null) → aucun sous-détail affiché, la cellule reste le total', () => {
    const runs: LigneRun[] = [runOk({ retenus: 1, horsPerimetre: 4, horsPerimetreSansAncre: null, horsPerimetreSonde: null })];
    const h = renderToStaticMarkup(createElement(TableRuns, { runs }));
    expect(h).not.toContain('ancre');
    expect(h).not.toContain('sonde');
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
  it('T8 — un dossier MARQUÉ REÇU (automatique) et un dossier dû sont distingués (« reçu », jamais « obtenu »)', () => {
    const dossiers: DossierSuivi[] = [
      { dossierId: 1, numDau: 'PC0920042500001', adresse: '12 rue de la Paix', satisfait: true, satisfaitPar: 'automatique', triage: null, refusLe: null },
      { dossierId: 2, numDau: 'PC0920042500002', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null },
    ];
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers }));
    expect(h).toContain('reçu (automatique)');
    expect(h).not.toContain('obtenu (automatique)'); // vocabulaire T8 : « obtenu » réservé à un fichier en GED
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

  // « dire quand ça part » — la carte annonce en une ligne que le courrier part tout seul (ou pas, si l'envoi auto est OFF).
  it('sans info d’envoi → aucune mention ; envoi auto ON → « part tout seul » + fenêtre (réglages)', () => {
    expect(renderToStaticMarkup(createElement(RelanceCarte, { relance, ouvert: false }))).not.toContain('part tout seul');
    const on = renderToStaticMarkup(createElement(RelanceCarte, { relance, ouvert: false, envoi: { relanceAutoActive: true, envoiHeureDebut: 9, envoiHeureFin: 11 } }));
    expect(on).toContain('part tout seul');
    expect(on).toContain('de 9 h à 11 h');
    expect(on).toContain('data-envoi-auto="true"');
  });
  it('envoi auto OFF → dit qu’il ne partira PAS seul (à modifier / annuler)', () => {
    const off = renderToStaticMarkup(createElement(RelanceCarte, { relance, ouvert: false, envoi: { relanceAutoActive: false, envoiHeureDebut: 9, envoiHeureFin: 11 } }));
    expect(off).toMatch(/désactivé/);
    expect(off).not.toContain('part tout seul');
    expect(off).toContain('data-envoi-auto="false"');
  });
});

// ── R5b — actions de l'écran Réponses (rendu pur : les boutons/callbacks sont là, aux bons endroits) ──────────────────────
const OPT: OptionDemande[] = [
  { demandeId: 42, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnieres', envoyeLe: '2026-04-01T10:00:00Z', statut: 'envoyee', soldee: false },
];
/** Une réponse « à rattacher » avec une pièce stockée et une pièce non stockée. */
function reponse(pieces: ReponseARattacher['pieces']): ReponseARattacher {
  return { id: 5, recuLe: '2026-04-19T09:30:00Z', deAdresse: 'urba@mairie-x.fr', deNom: null, objet: 'RE: demande', nbPieces: pieces.length, rattachementMethode: 'aucun', pieces };
}
const compte = (h: string, s: string) => h.split(s).length - 1;

describe('T4 — sélecteur « à rattacher » : tri PUR (candidates probables d’abord) + marqueurs (filtrer, pas amputer)', () => {
  const opt = (demandeId: number, envoyeLe: string | null, over: Partial<OptionDemande> = {}): OptionDemande =>
    ({ demandeId, reference: `R${demandeId}`, communeNom: 'X', envoyeLe, statut: 'envoyee', soldee: false, ...over });

  it('soldées DÉMOTÉES : les non soldées passent avant, même plus récente que la soldée', () => {
    const tri = trierOptionsDemandes([
      opt(1, '2026-01-01T00:00:00Z', { soldee: true }), // soldée, pourtant la plus ancienne → doit finir en bas
      opt(2, '2026-03-01T00:00:00Z'),
      opt(3, '2026-02-01T00:00:00Z'),
    ]);
    expect(tri.map((x) => x.demandeId)).toEqual([2, 3, 1]); // non soldées (par date desc) puis la soldée
  });

  it('CLOSE aussi démotée (même rang que soldée)', () => {
    const tri = trierOptionsDemandes([opt(1, '2026-05-01T00:00:00Z', { statut: 'close' }), opt(2, '2026-01-01T00:00:00Z')]);
    expect(tri.map((x) => x.demandeId)).toEqual([2, 1]);
  });

  it('date DÉCROISSANTE dans chaque groupe (date nulle en bas du groupe)', () => {
    const tri = trierOptionsDemandes([
      opt(1, '2026-01-01T00:00:00Z'), opt(2, null), opt(3, '2026-06-01T00:00:00Z'), opt(4, '2026-03-01T00:00:00Z'),
    ]);
    expect(tri.map((x) => x.demandeId)).toEqual([3, 4, 1, 2]); // récent → ancien → null
  });

  it('une soldée reste PRÉSENTE et sélectionnable (démotée, jamais retirée)', () => {
    const tri = trierOptionsDemandes([opt(1, '2026-01-01T00:00:00Z', { soldee: true })]);
    expect(tri.map((x) => x.demandeId)).toEqual([1]);
  });

  it('liste vide → [] (aucun plantage)', () => {
    expect(trierOptionsDemandes([])).toEqual([]);
  });

  it('marqueur UNIQUEMENT sur les démotées : « soldée » / « close » / null (soldée prime)', () => {
    expect(marqueurOption({ soldee: true, statut: 'envoyee' })).toBe('soldée');
    expect(marqueurOption({ soldee: false, statut: 'close' })).toBe('close');
    expect(marqueurOption({ soldee: false, statut: 'envoyee' })).toBeNull();
    expect(marqueurOption({ soldee: true, statut: 'close' })).toBe('soldée');
  });

  it('rendu : le marqueur apparaît sur l’option démotée, sur UNE seule, pas sur la candidate probable', () => {
    const h = renderToStaticMarkup(createElement(BlocARattacher, {
      reponses: [reponse([])],
      demandes: [opt(2, '2026-03-01T00:00:00Z'), opt(1, '2026-01-01T00:00:00Z', { soldee: true })],
      selection: {}, onChoisir: () => {}, onRattacher: () => {},
    }));
    expect(h).toContain('· soldée');        // marqueur présent sur la démotée
    expect(compte(h, '· soldée')).toBe(1);  // et sur une seule (la candidate probable n'en porte pas)
  });
});

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

// ── T4 — BlocPropositions : file « dépôts à confirmer », DISTINCTE de « à rattacher » ──────────────────────────────────
describe('T4 — BlocPropositions : confirmer un dépôt (date réelle obligatoire et bornée), ambiguïté, pièces', () => {
  const noop = () => {};
  const cbs = { onOuvrir: noop, onDateChange: noop, onConfirmer: noop, onFermer: noop, onIgnorer: noop };
  const PROP = (over: Partial<PropositionDepotAffichee> = {}): PropositionDepotAffichee => ({
    id: 10, recuLe: '2026-08-05T09:30:00Z', deAdresse: 'urba@mairie.fr', deNom: 'Mairie', objet: 'Dépôt enregistré', nbPieces: 0,
    candidats: [{ demandeId: 100, reference: 'SVAV-DEM-2026-000156', communeNom: 'Paris' }], ...over,
  });

  it('liste vide → phrase explicative, aucun bouton', () => {
    const h = renderToStaticMarkup(createElement(BlocPropositions, { propositions: [], aujourdhui: '2026-08-12', ...cbs }));
    expect(h).toContain('Aucun dépôt à confirmer');
    expect(h).not.toContain('<button');
  });

  it('1 candidate (fermée) → montre la demande citée + « Oui, déposée » et « Ignorer » ; PAS de champ date tant que non ouvert', () => {
    const h = renderToStaticMarkup(createElement(BlocPropositions, { propositions: [PROP()], aujourdhui: '2026-08-12', ...cbs }));
    expect(h).toContain('SVAV-DEM-2026-000156');
    expect(h).toContain('(Paris)');
    expect(h).toContain('Oui, déposée — saisir la date');
    expect(h).toContain('Ignorer');
    expect(h).not.toContain('type="date"'); // le formulaire n'est pas ouvert
  });

  it('formulaire ouvert → champ date BORNÉ au message (max) + aide non décisionnelle + « Confirmer le dépôt » DÉSACTIVÉ tant que vide', () => {
    const h = renderToStaticMarkup(createElement(BlocPropositions, {
      propositions: [PROP()], aujourdhui: '2026-08-12', dateOuverteId: 10, dateValeur: '', ...cbs,
    }));
    expect(h).toContain('type="date"');
    expect(h).toContain('max="2026-08-05"');             // le message (05/08) borne, plus strict qu'aujourd'hui (12/08)
    expect(h).toContain('le dépôt lui est forcément antérieur'); // aide, jamais une valeur pré-remplie
    expect(h).toContain('Confirmer le dépôt');
    expect(h).toContain('disabled');                      // champ vide → confirmation impossible (date obligatoire)
  });

  it('date saisie ≤ message → « Confirmer » ACTIF ; date POSTÉRIEURE au message → DÉSACTIVÉ (borne écran, la route reste l’autorité)', () => {
    const ok = renderToStaticMarkup(createElement(BlocPropositions, {
      propositions: [PROP()], aujourdhui: '2026-08-12', dateOuverteId: 10, dateValeur: '2026-08-01', ...cbs,
    }));
    expect(ok).not.toContain('disabled');                 // 01/08 ≤ 05/08 → valide
    const tard = renderToStaticMarkup(createElement(BlocPropositions, {
      propositions: [PROP()], aujourdhui: '2026-08-12', dateOuverteId: 10, dateValeur: '2026-08-10', ...cbs,
    }));
    expect(tard).toContain('disabled');                   // 10/08 > 05/08 (postérieure au message) → refus écran
  });

  it('AMBIGUÏTÉ (≥ 2 candidats) → signale + liste les références ; JAMAIS de confirmation (ni « Oui », ni champ date, même ouvert)', () => {
    const h = renderToStaticMarkup(createElement(BlocPropositions, {
      propositions: [PROP({ candidats: [
        { demandeId: 100, reference: 'SVAV-DEM-2026-000156', communeNom: 'Paris' },
        { demandeId: 200, reference: 'SVAV-DEM-2026-000200', communeNom: 'Asnieres' },
      ] })],
      aujourdhui: '2026-08-12', dateOuverteId: 10, dateValeur: '2026-08-01', ...cbs, // même « ouvert », aucune saisie possible
    }));
    expect(h).toContain('ambiguïté');
    expect(h).toContain('SVAV-DEM-2026-000156');
    expect(h).toContain('SVAV-DEM-2026-000200');
    expect(h).not.toContain('Oui, déposée — saisir la date');
    expect(h).not.toContain('type="date"');
    expect(h).toContain('Ignorer'); // on peut toujours l'écarter
  });

  it('pièces jointes → averti qu’elles ne satisfont RIEN automatiquement', () => {
    const h = renderToStaticMarkup(createElement(BlocPropositions, { propositions: [PROP({ nbPieces: 3 })], aujourdhui: '2026-08-12', ...cbs }));
    expect(h).toContain('AUCUN dossier');
  });

  it('le retour « proposition-10 » se rend une seule fois, dans la carte de la proposition', () => {
    const retour: RetourCible = { cle: 'proposition-10', texte: 'Dépôt confirmé.', ok: true };
    const h = renderToStaticMarkup(createElement(BlocPropositions, { propositions: [PROP()], aujourdhui: '2026-08-12', retour, ...cbs }));
    expect(compte(h, 'Dépôt confirmé.')).toBe(1);
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

describe('T1 — DetailDossiers : sous-liste des dossiers RETIRÉS + « annuler le retrait » (réversibilité de « retirer »)', () => {
  const rien = () => {};
  const DU: DossierSuivi = { dossierId: 2, numDau: 'PC-DU', adresse: null, satisfait: false, satisfaitPar: null, triage: null, refusLe: null };
  const RET = { dossierId: 9, numDau: 'PC-RETIRE', adresse: '3 rue X' };
  const cbs = { onMarquer: rien, onNonFourni: rien, onAnnulerTriage: rien, onRefusOuvrir: rien, onRefusDateChange: rien, onRefusConfirmer: rien, onRefusAnnuler: rien, onRetirerOuvrir: rien, onRetirerConfirmer: rien, onRetirerAnnuler: rien, onReattachOuvrir: rien, onReattachConfirmer: rien, onReattachAnnuler: rien };

  it('un dossier retiré → sous-liste barrée + « annuler le retrait » ; il n’est PAS dans les dus (aucun bouton d’action de dû)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], dossiersRetires: [RET], ...cbs }));
    expect(h).toContain('1 dossier retiré de la demande');
    expect(h).toContain('PC-RETIRE');
    expect(h).toContain('annuler le retrait');
    expect(h).toContain('line-through');           // le n° du retiré est barré
    expect(h).toContain('tip-7-2-retirer');         // le DU, lui, offre bien « retirer »
    expect(h).not.toContain('tip-7-9');             // le RETIRÉ n’a AUCUN bouton d’action de dû (ni retirer, ni marquer reçu, …)
  });

  it('aucun retiré → AUCUNE sous-liste rendue (jamais de section vide)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], ...cbs }));
    expect(h).not.toContain('retiré de la demande');
    expect(h).not.toContain('annuler le retrait');
  });

  it('confirmation « annuler le retrait » ouverte → deux temps (dit ce qui se passe, « confirmer » + « annuler »)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [DU], dossiersRetires: [RET], reattachOuvertDossierId: 9, ...cbs }));
    expect(h).toContain('revenir dans la demande');
    expect(h).toContain('redevient dû');
    expect(h).toContain('>confirmer<');
  });

  it('TOUS les dossiers retirés (0 dû) → la sous-liste reste rendue MALGRÉ « Aucun dossier rattaché » (repli n’avale pas les retirés)', () => {
    const h = renderToStaticMarkup(createElement(DetailDossiers, { demandeId: 7, statut: 'envoyee', dossiers: [], dossiersRetires: [RET], ...cbs }));
    expect(h).toContain('Aucun dossier rattaché');
    expect(h).toContain('1 dossier retiré de la demande');
    expect(h).toContain('annuler le retrait');
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
    vus: 1, dejaConnus: 0, horsPerimetre: 0, horsPerimetreSonde: null, horsPerimetreSansAncre: null, emisParNous: 0, retenus: 1, rattaches: 0,
    rebondsDetectes: 0, rebondsRattaches: 0, rebondsEtrangers: 0, rebondsAppliques: 0, accuses: 0, enregistrees: 1,
    piecesDeposees: 0, piecesNonDeposees: 0, erreur: null,
  });
  const cumul = (over: Partial<CumulFenetre> = {}): CumulFenetre => ({
    nbReleves: 5, nbErreurs: 0, vus: 30, dejaConnus: 10, horsPerimetre: 2, emisParNous: 0, retenus: 4, rattaches: 3,
    rebondsDetectes: 6, rebondsRattaches: 1, rebondsEtrangers: 9, rebondsAppliques: 2, accuses: 11, enregistrees: 7,
    piecesDeposees: 8, piecesNonDeposees: 5, ...over,
  });

  it('cumul fourni → un <tfoot> avec la ligne de total, alignée sur COLS_RUN (13 cellules) + libellé de fenêtre', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul(), periode: '7j', onPeriode: noop }));
    expect(h).toContain('<tfoot');
    expect(h).toContain('Total');
    expect(h).toContain('7 derniers jours');
    // 3 cellules fixes (colSpan 3) + 13 cellules de compteurs (T3 : « accusés » = 11) → les 13 valeurs du cumul sont présentes
    for (const v of [30, 10, 2, 4, 3, 6, 1, 9, 2, 11, 7, 8, 5]) expect(h).toContain(`>${v}</td>`);
  });

  it('le décompte de relèves s’affiche ; « dont N en erreur » seulement si > 0', () => {
    const sansErr = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul({ nbReleves: 5, nbErreurs: 0 }), periode: '7j', onPeriode: noop }));
    expect(sansErr).toContain('5 relèves');
    expect(sansErr).not.toContain('en erreur');
    const avecErr = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul({ nbReleves: 12, nbErreurs: 2 }), periode: '7j', onPeriode: noop }));
    expect(avecErr).toContain('12 relèves');
    expect(avecErr).toContain('dont 2 en erreur');
  });

  it('les 7 colonnes de BRUIT du total portent la marque d’atténuation ; pas les 7 d’événement', () => {
    const h = renderToStaticMarkup(createElement(TableRuns, { runs: [run()], cumul: cumul(), periode: '7j', onPeriode: noop }));
    expect(h).toContain('compté plusieurs fois'); // marque présente
    expect((h.match(/compté plusieurs fois/g) ?? []).length).toBe(7); // les 7 colonnes de bruit (dont « émis par nous », N10 correctif boucle)
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

describe('L1 — BlocLiens + mentionExpiration : forts en tête, faibles repliés, expiration jamais devinée', () => {
  const lien = (over: Partial<LienAffiche> = {}): LienAffiche =>
    ({ url: 'https://x.fr', fort: false, recuLe: '2026-08-10T13:24:00Z', deAdresse: 'urba@mairie-x.fr', expireLe: null, expirationSource: null, expirationIndice: null, ...over });

  it('FUS — expéditeur (adresse COMPLÈTE) affiché à côté du lien : clé de recherche « retrouver ce mail dans Gmail »', () => {
    const h = renderToStaticMarkup(createElement(BlocLiens, { liens: [lien({ fort: true, deAdresse: 'no-reply@paris.fr' })] }));
    expect(h).toContain('de no-reply@paris.fr'); // adresse entière, non tronquée
  });

  it('mentionExpiration : absolue / relative (calcul montré) / nulle', () => {
    expect(mentionExpiration(lien({ expireLe: '2026-08-17', expirationSource: 'absolue', expirationIndice: "jusqu'au 17/08/2026" })))
      .toBe('lien reçu le 10/08 — expire le 17/08');
    expect(mentionExpiration(lien({ expireLe: '2026-08-17', expirationSource: 'relative', expirationIndice: '7 jours' })))
      .toBe('lien reçu le 10/08 — expire le 17/08 (7 jours à compter du 10/08)');
    expect(mentionExpiration(lien())).toBe('lien reçu le 10/08 — durée de validité non précisée');
  });

  it('vide → rien ; fort en tête, URL cliquable (rel noopener), faibles repliés dans <details>, rappel « geste humain »', () => {
    expect(renderToStaticMarkup(createElement(BlocLiens, { liens: [] }))).toBe('');
    const fort = lien({ url: 'https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder', fort: true, expireLe: '2026-08-17', expirationSource: 'relative', expirationIndice: '7 jours' });
    const faible = lien({ url: 'https://opendata.paris.fr' });
    const h = renderToStaticMarkup(createElement(BlocLiens, { liens: [fort, faible] }));
    expect(h).toContain('href="https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder"');
    expect(h).toContain('rel="noopener noreferrer nofollow"');
    expect(h).toContain('7 jours à compter du 10/08');
    expect(h).toContain('<details');       // les faibles sont repliés
    expect(h).toContain('geste humain');    // rappel de la règle dure
  });

  it('plusieurs liens FORTS → mention d’ambiguïté, aucun choisi automatiquement', () => {
    const a = lien({ url: 'https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder', fort: true });
    const b = lien({ url: 'https://ged.paris.fr/share/s/Xy12Wv34Ut56Rs78Qp/folder', fort: true });
    const h = renderToStaticMarkup(createElement(BlocLiens, { liens: [a, b] }));
    expect(h).toContain('aucun n’est retenu automatiquement');
  });

  it('G1 — un lien fort dont l’expiration est DÉPASSÉE (maintenant fourni) → « délai dépassé » ; avant → rien', () => {
    const l = lien({ url: 'https://ged.paris.fr/share/s/Tok9Ab34Cd56Ef78/folder', fort: true, expireLe: '2026-08-17T13:24:00Z', expirationSource: 'relative', expirationIndice: '7 jours' });
    expect(renderToStaticMarkup(createElement(BlocLiens, { liens: [l], maintenant: new Date('2026-08-20T00:00:00Z') }))).toContain('délai dépassé');
    expect(renderToStaticMarkup(createElement(BlocLiens, { liens: [l], maintenant: new Date('2026-08-15T00:00:00Z') }))).not.toContain('délai dépassé');
  });
});

describe('G1 — BlocAlertesGed : alertes envoyées + retard rendus VISIBLES (décision 7)', () => {
  it('vide → rien ; sinon liste J-3 / 24 h par permis, avec badge « en retard » + note d’avertissement', () => {
    expect(renderToStaticMarkup(createElement(BlocAlertesGed, { alertes: [] }))).toBe('');
    const alertes: AlerteGedAffiche[] = [
      { type: 'j3', numDau: '0930012500081', envoyeLe: '2026-08-14T13:30:00Z', enRetard: false },
      { type: 'h24', numDau: '0930012500081', envoyeLe: '2026-08-16T20:00:00Z', enRetard: true },
    ];
    const h = renderToStaticMarkup(createElement(BlocAlertesGed, { alertes }));
    expect(h).toContain('Rappel J-3 — permis N°0930012500081 — envoyé le 14/08');
    expect(h).toContain('Rappel 24 h — permis N°0930012500081 — envoyé le 16/08');
    expect(h).toContain('en retard');
    expect(h).toContain('surveillance interrompue');
  });

  it('alerte « contenu non rattaché » (permis inconnu) → libellé dédié, sans n° de permis', () => {
    const h = renderToStaticMarkup(createElement(BlocAlertesGed, { alertes: [{ type: 'j3', numDau: null, envoyeLe: '2026-08-14T13:30:00Z', enRetard: false }] }));
    expect(h).toContain('contenu non rattaché');
    expect(h).not.toContain('N°');
  });
});

describe('T7-B — BlocMessagesAutre : bouton « répondu » MANUEL et RÉVERSIBLE par message', () => {
  const M = (over: Partial<{ id: number; objet: string | null; deAdresse: string; deNom: string | null; recuLe: string; reponduLe: string | null; reponduPar: string | null; reponduAuto: boolean }> = {}) =>
    ({ id: 70, objet: 'Complément', deAdresse: 'urba@mairie.fr', deNom: 'Urba', recuLe: '2026-08-12T09:00:00Z', reponduLe: null, reponduPar: null, reponduAuto: false, ...over });

  it('vide → ne rend rien', () => {
    expect(renderToStaticMarkup(createElement(BlocMessagesAutre, { messages: [] }))).toBe('');
  });

  it('message à répondre → « à répondre » + bouton « marquer répondu » ; compte des non-répondus dans le titre', () => {
    const h = renderToStaticMarkup(createElement(BlocMessagesAutre, { messages: [M(), M({ id: 71, reponduLe: '2026-08-11T00:00:00Z', reponduPar: '5' })], onRepondu: () => {} }));
    expect(h).toContain('1 à répondre');            // un seul non répondu
    expect(h).toContain('à répondre');
    expect(h).toContain('marquer répondu');
    expect(h).toContain('Complément');
  });

  it('message déjà répondu → état « répondu le … par … » + bouton « annuler » (réversible)', () => {
    const h = renderToStaticMarkup(createElement(BlocMessagesAutre, { messages: [M({ reponduLe: '2026-08-11T00:00:00Z', reponduPar: '5' })], onAnnulerRepondu: () => {} }));
    expect(h).toContain('répondu le');
    expect(h).toContain('par 5');
    expect(h).toContain('annuler');
    expect(h).toContain('tous répondus'); // titre quand aucun ne reste à répondre
  });

  it('FUS-4 — geste « reclasser » VISIBLE (le trou réparé) : 3 cibles quand onReclasser fourni ; absent sinon', () => {
    const avec = renderToStaticMarkup(createElement(BlocMessagesAutre, { messages: [M()], onRepondu: () => {}, onReclasser: () => {} }));
    expect(avec).toContain('reclasser en :');
    expect(avec).toContain('accusé de réception'); // cible 1
    expect(avec).toContain('documents');            // cible 2
    expect(avec).toContain('autre (actuel)');       // cible 3 = état courant, non actionnable
    // sans le câblage → aucun geste (état d'avant ce lot : action serveur invisible)
    const sans = renderToStaticMarkup(createElement(BlocMessagesAutre, { messages: [M()], onRepondu: () => {} }));
    expect(sans).not.toContain('reclasser en :');
  });
});

describe('T5 — tronquerObjet', () => {
  it('objet vide/null → « (sans objet) » ; court → intact ; long → tronqué avec …', () => {
    expect(tronquerObjet(null)).toBe('(sans objet)');
    expect(tronquerObjet('   ')).toBe('(sans objet)');
    expect(tronquerObjet('Réponse courte')).toBe('Réponse courte');
    const long = 'Réponse de la mairie concernant votre demande de communication de documents administratifs relatifs au permis';
    const t = tronquerObjet(long, 40);
    expect(t.length).toBeLessThanOrEqual(41); // ≤ max + « … »
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('T5 — BlocPiecesReponses : pièces rattachées, consultables/téléchargeables', () => {
  const G = (over: Partial<{ reponseId: number; recuLe: string; deAdresse: string; objet: string | null; pieces: { id: number; nomFichier: string; stockee: boolean; motif: string | null }[] }> = {}) =>
    ({ reponseId: 71, recuLe: '2026-08-12T09:00:00Z', deAdresse: 'urba@mairie-x.fr', objet: 'Envoi des pièces', pieces: [{ id: 500, nomFichier: 'plan.pdf', stockee: true, motif: null }], ...over });

  it('vide → ne rend rien', () => {
    expect(renderToStaticMarkup(createElement(BlocPiecesReponses, { groupes: [] }))).toBe('');
  });

  it('pièce stockée → bouton de téléchargement ; étiquette « reçues le JJ/MM — objet · de expéditeur »', () => {
    const h = renderToStaticMarkup(createElement(BlocPiecesReponses, { groupes: [G({ deAdresse: 'urba@paris.fr' })], onTelecharger: () => {} }));
    expect(h).toContain('Pièces reçues de la mairie');
    expect(h).toContain('reçues le 12/08 — Envoi des pièces');
    expect(h).toContain('de urba@paris.fr'); // FUS — expéditeur (adresse complète) à côté du groupe de pièces
    expect(h).toContain('plan.pdf');
    expect(h).toContain('<button'); // bouton présent pour une pièce stockée
  });

  it('pièce NON stockée → motif en clair et AUCUN bouton (jamais un fichier « disponible » à tort)', () => {
    const h = renderToStaticMarkup(createElement(BlocPiecesReponses, {
      groupes: [G({ pieces: [{ id: 501, nomFichier: 'coupe.pdf', stockee: false, motif: 'pièce trop volumineuse : 60 Mo (maximum 50 Mo)' }] })], onTelecharger: () => {},
    }));
    expect(h).toContain('coupe.pdf');
    expect(h).toContain('non récupérée : pièce trop volumineuse : 60 Mo (maximum 50 Mo)');
    expect(h).not.toContain('<button'); // AUCUN bouton mort sur une pièce refusée au dépôt
  });

  it('SÉCURITÉ : la clé de stockage n’apparaît jamais dans le rendu', () => {
    const h = renderToStaticMarkup(createElement(BlocPiecesReponses, { groupes: [G()], onTelecharger: () => {} }));
    expect(h).not.toMatch(/cle_stockage|entrantes\/|\.s3\./i);
  });
});
