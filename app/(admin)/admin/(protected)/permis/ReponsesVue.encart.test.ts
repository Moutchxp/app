import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * UNIF-2 — GARDE-FOU « NE RIEN PERDRE » du détail « Réponses » (précédent 19/08). Pas d'infra DOM + aucune demande en base → on
 * SCANNE ReponsesVue.tsx et on prouve que le détail adopte l'encart de familles ET que CHAQUE geste de l'inventaire §1 de « Réponses »
 * reste branché. On prouve AUSSI, en négatif, que les gestes SPÉCIFIQUES à « En cours » (réf. mairie, suspension, cascade) ne sont pas
 * importés mécaniquement ici — la liste diffère à dessein d'UNIF-1.
 */
const SRC = readFileSync(fileURLToPath(new URL('./ReponsesVue.tsx', import.meta.url)), 'utf8');

describe('UNIF-2 — le détail « Réponses » consomme l’encart de familles (socle UNIF-0)', () => {
  it('utilise EncartFamilles pour l’onglet « reponses »', () => {
    expect(SRC).toContain('<EncartFamilles onglet="reponses"');
  });
  it('les 6 familles sont déclarées (suivi + historique + 4 per-permis)', () => {
    for (const cle of ['suivi_actions', 'historique', 'completude', 'caracteristiques', 'batiments', 'pieces']) {
      expect(SRC).toContain(`cle: '${cle}'`);
    }
  });
  it('les familles à sous-plis lazy passent par SousSectionsPermis (4 per-permis + le fil de l’historique)', () => {
    expect((SRC.match(/<SousSectionsPermis /g) ?? []).length).toBe(5); // LOT-4 : +1 pour le fil des échanges (BlocFilEchanges)
    for (const bloc of ['BlocCompletude', 'CaracteristiquesBloc', 'BlocTraceEmprise', 'BlocPiecesPermis', 'BlocFilEchanges']) {
      expect(SRC).toContain(bloc);
    }
  });
  it('le tri par urgence PART-D et « reçu il y a N jours » restent intacts (non touchés par ce lot)', () => {
    expect(SRC).toContain('comparerUrgenceReponse'); // tri par urgence (liens en attente d'abord, puis échéance CADA)
  });
});

describe('UNIF-2 — NE RIEN PERDRE : les gestes du détail « Réponses » survivent', () => {
  const GESTES: [string, string][] = [
    ['statuer dossiers (5 actions)', '<DetailDossiers demandeId={d.demandeId}'],
    ['— action « marquer reçu »/« non fourni »/« annuler »', "action: 'marquer_dossier'"],
    ['— action « refus mairie »', "action: 'dossier_refus_mairie'"],
    ['— action « retirer » / « réattacher »', "action: 'retirer_dossier'"],
    ['clôturer / rouvrir', "action: 'cloturer'"],
    ['rappel « obtenus → Archives »', '<RappelObtenusArchives n={d.dossiersSatisfaits}'],
    ['messages « autre » (répondu/reclasser)', '<BlocMessagesAutre messages={d.messagesAutre}'],
    ['liens de téléchargement', '<BlocLiens liens={d.liens}'],
    ['pièces des réponses', '<BlocPiecesReponses groupes={d.piecesReponses}'],
    ['alertes GED', '<BlocAlertesGed alertes={d.alertesGed}'],
    ['fil des échanges mail (comme Analyse/Archives)', '<BlocFilEchanges key={id} dossierId={id}'],
  ];
  for (const [geste, preuve] of GESTES) {
    it(`geste toujours joignable : ${geste}`, () => {
      expect(SRC.includes(preuve), `geste perdu : ${geste} (fragment absent : ${preuve})`).toBe(true);
    });
  }

  it('AUCUN geste spécifique à « En cours » importé ici (réf. mairie, lever suspension, cascade partielle)', () => {
    expect(SRC).not.toContain('EditeurReferenceMairie'); // réf. mairie = En cours (table)
    expect(SRC).not.toContain('leverSuspension');        // suspension = En cours
    expect(SRC).not.toContain('envoyerCascade');         // cascade partielle = En cours
  });
});
