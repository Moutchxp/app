import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * UNIF-1 — GARDE-FOU « NE RIEN PERDRE » (précédent 19/08 : BlocMessagesAutre perdu en déplaçant une ligne). Le dépôt n'a pas d'infra
 * de rendu DOM (env node) et il n'y a aucune demande en base → on SCANNE le source de SuiviDemandes.tsx et on prouve que le détail
 * « En cours » adopte l'encart de familles ET que CHAQUE geste de l'inventaire §1 est toujours branché (composant + handler).
 */
const SRC = readFileSync(fileURLToPath(new URL('./SuiviDemandes.tsx', import.meta.url)), 'utf8');

describe('UNIF-1 — le détail « En cours » consomme l’encart de familles (socle UNIF-0)', () => {
  it('utilise EncartFamilles pour l’onglet « en_cours »', () => {
    expect(SRC).toContain('<EncartFamilles onglet="en_cours"');
  });
  it('les 6 familles sont déclarées (suivi + historique + 4 per-permis)', () => {
    for (const cle of ['suivi_actions', 'historique', 'completude', 'caracteristiques', 'batiments', 'pieces']) {
      expect(SRC).toContain(`cle: '${cle}'`);
    }
  });
  it('la réf. mairie est rangée dans la famille (masquée dans le panneau) — pas dupliquée', () => {
    expect(SRC).toContain('masquerRefMairie');
    expect(SRC).toContain('<EditeurReferenceMairie references={richDetail.referencesMairie}');
  });
  it('les 4 familles per-permis passent par SousSectionsPermis (sous-plis lazy)', () => {
    expect((SRC.match(/<SousSectionsPermis /g) ?? []).length).toBe(4);
    for (const bloc of ['BlocCompletude', 'CaracteristiquesBloc', 'BlocTraceEmprise', 'BlocPiecesPermis']) {
      expect(SRC).toContain(bloc);
    }
  });
});

describe('UNIF-1 — NE RIEN PERDRE : les 9 gestes du détail « En cours » survivent', () => {
  // geste → preuve (fragment de source : composant ou handler)
  const GESTES: [string, string][] = [
    ['statuer dossiers (5 actions)', '<DetailDossiers demandeId={detail.id}'],
    ['— action « marquer reçu »/« non fourni »/« annuler »', "action: 'marquer_dossier'"],
    ['— action « refus mairie »', "action: 'dossier_refus_mairie'"],
    ['— action « retirer » / « réattacher »', "action: 'retirer_dossier'"],
    ['lever la suspension', 'void leverSuspension(detail.id)'],
    ['éditeur de cascade partielle', 'void envoyerCascade(detail.id'],
    ['référence mairie (ajouter/modifier/effacer)', '<EditeurReferenceMairie references={richDetail.referencesMairie}'],
    ['clôturer / rouvrir', "action: 'cloturer'"],
    ['rappel « obtenus → Archives »', '<RappelObtenusArchives n={richDetail.dossiersSatisfaits}'],
    ['messages « autre » (répondu/reclasser)', '<BlocMessagesAutre messages={richDetail.messagesAutre}'],
    ['liens de téléchargement', '<BlocLiens liens={richDetail.liens}'],
    ['pièces des réponses', '<BlocPiecesReponses groupes={richDetail.piecesReponses}'],
    ['alertes GED', '<BlocAlertesGed alertes={richDetail.alertesGed}'],
  ];
  for (const [geste, preuve] of GESTES) {
    it(`geste toujours joignable : ${geste}`, () => {
      expect(SRC.includes(preuve), `geste perdu : ${geste} (fragment absent : ${preuve})`).toBe(true);
    });
  }
});
