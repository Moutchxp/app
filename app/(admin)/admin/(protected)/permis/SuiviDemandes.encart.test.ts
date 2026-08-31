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
  it('LOT 15 (point 8) — la réf. mairie n’est PLUS dupliquée dans l’encart : retirée de la famille, le geste vit dans la colonne du tableau', () => {
    expect(SRC).toContain('masquerRefMairie');                    // le panneau ne la montre pas
    expect(SRC).not.toContain('EditeurReferenceMairie');          // ...et l'encart non plus (doublon retiré)
    expect(SRC).toContain('<RefMairieCellule references={rich.referencesMairie}'); // seule place : la colonne du tableau (même route, portée par demande)
  });
  it('LOT 15 — la famille « Suivi et actions » rend la FRISE unifiée (envois + cascade fondus), sans l’ancien bloc ni le rappel « obtenus »', () => {
    expect(SRC).toContain('projeterParcours({'); // LOT 18 : projection du parcours complet (remplace construireFriseSuivi)
    expect(SRC).toContain('<FriseSuivi evenements={evenements}');
    expect(SRC).not.toContain('<HistoriqueEnvois ');             // l'ancien bloc LOT 13 est absorbé par la frise
    expect(SRC).not.toContain('<RappelObtenusArchives');         // point 7 : info portée par le titre « Contact mairie » (LOT 9)
  });
  it('les familles à sous-plis lazy passent par SousSectionsPermis (4 per-permis + le fil de l’historique)', () => {
    expect((SRC.match(/<SousSectionsPermis /g) ?? []).length).toBe(5); // LOT-4 : +1 pour le fil des échanges (BlocFilEchanges)
    for (const bloc of ['BlocCompletude', 'CaracteristiquesBloc', 'BlocTraceEmprise', 'BlocPiecesPermis', 'BlocFilEchanges']) {
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
    ['éditeur de cascade partielle (préparer/envoyer le brouillon)', 'void envoyerCascade(detail.id'],
    ['fil des échanges mail (comme Analyse/Archives)', '<BlocFilEchanges key={id} dossierId={id}'],
    // LOT 15 (point 8) — le geste réf. mairie SURVIT : il vit désormais dans la colonne du tableau (RefMairieCellule → ajouterRefTable), plus dans l'encart.
    ['référence mairie (ajouter/modifier/effacer) — colonne du tableau', 'ajouterRefTable(d.id, r)'],
    ['clôturer / rouvrir', "action: 'cloturer'"],
    // LOT 15 (point 7) — « rappel obtenus → Archives » RETIRÉ de l'encart (info portée par le titre « Contact mairie ») : ce n'est pas un geste, aucune action perdue.
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
