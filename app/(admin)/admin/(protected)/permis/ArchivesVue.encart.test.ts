import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * UNIF-3 — GARDE-FOU « NE RIEN PERDRE » du détail « Archives » (précédent 19/08). Archives est PER-DOSSIER (une ligne = un permis) :
 * pas d'ambiguïté multi-permis, donc pas de SousSectionsPermis. Le détail est composé sur DEUX fichiers — la COQUILLE + les gestes
 * PROPRES à Archives (pièces téléchargeables/supprimables, ajout à la main) vivent dans ArchivesRendu.tsx ; les familles « si non
 * vide » (Complétude / Historique / Bâtiments) et « Caractéristiques » sont injectées en SLOTS par ArchivesVue.tsx. On scanne les
 * deux et on prouve, geste par geste, que chacun survit. Assertions NÉGATIVES : aucun geste propre aux autres onglets n'apparaît
 * (Archives est post-satisfaction : ni statuer-dossier, ni clôture, ni réf mairie / suspension / cascade).
 */
const RENDU = readFileSync(fileURLToPath(new URL('./ArchivesRendu.tsx', import.meta.url)), 'utf8');
const VUE = readFileSync(fileURLToPath(new URL('./ArchivesVue.tsx', import.meta.url)), 'utf8');

describe('UNIF-3 — le détail « Archives » consomme l’encart de familles (socle UNIF-0)', () => {
  it('la coquille utilise EncartFamilles pour l’onglet « archives »', () => {
    expect(RENDU).toContain('<EncartFamilles onglet="archives"');
  });
  it('répartition Archives : 5 familles (Caractéristiques + Pièces remplissables ; Complétude/Historique/Bâtiments si non vides)', () => {
    for (const cle of ['completude', 'historique', 'caracteristiques', 'batiments', 'pieces']) {
      expect(RENDU).toContain(`cle: '${cle}'`);
    }
    // UNIF-3b — alignement STRICT avec les autres onglets : TOUT REPLIÉ, aucune famille ouverte d'emblée.
    expect(RENDU).not.toContain('defautOuvert');
    // Les signaux « non vide » per-dossier pilotent les familles si-non-vide (jamais le contenu → paresse).
    for (const sig of ['l.completudeNonVide', 'l.historiqueNonVide', 'l.batimentsNonVide']) {
      expect(RENDU).toContain(sig);
    }
  });
  it('« Suivi & actions » est ABSENTE du détail Archives (post-satisfaction : rien à statuer)', () => {
    expect(RENDU).not.toContain("cle: 'suivi_actions'");
  });
});

describe('UNIF-3 — NE RIEN PERDRE : les gestes du détail « Archives » survivent', () => {
  // geste → [fichier, preuve] (composant/handler)
  const GESTES: [string, string, string][] = [
    ['pièces : téléchargement + suppression (manuel) + sources', 'RENDU', '<CellulePieces pieces={l.pieces} sourcesNonResolues={l.sourcesNonResolues} onTelecharger={onTelecharger} onSupprimer={onSupprimer}'],
    ['ajouter un document à la main', 'RENDU', '<AjoutDocument dossierId={l.dossierId} onFichier={onFichier}'],
    ['caractéristiques du permis', 'VUE', '<CaracteristiquesBloc key={`${dossierId}-${version}`}'],
    ['relancer l’analyse', 'VUE', '<BoutonRelancerAnalyse dossierId={dossierId}'],
    ['complétude des pièces', 'VUE', '<BlocCompletude key={`comp-${dossierId}-${version}`}'],
    ['historique des échanges', 'VUE', '<BlocFilEchanges key={`fil-${dossierId}-${version}`}'],
    ['bâtiments et projection', 'VUE', '<BlocTraceEmprise key={`bat-${dossierId}-${version}`}'],
  ];
  for (const [geste, ou, preuve] of GESTES) {
    it(`geste toujours branché : ${geste} (${ou})`, () => {
      const src = ou === 'RENDU' ? RENDU : VUE;
      expect(src.includes(preuve), `geste perdu : ${geste} (fragment absent : ${preuve})`).toBe(true);
    });
  }

  it('téléchargement/ouverture = SIGNEUR UNIQUE (url_piece), la clé de stockage ne transite jamais', () => {
    expect(VUE).toContain("action: 'url_piece'"); // télécharger + ouvrirPiece
    expect(VUE).not.toContain('cle_stockage');
  });

  it('AUCUN geste propre aux autres onglets dans Archives (statuer-dossier, clôture, réf mairie, suspension, cascade)', () => {
    for (const src of [RENDU, VUE]) {
      expect(src).not.toContain('DetailDossiers');        // statuer dossiers = En cours / Réponses
      expect(src).not.toContain('ActionsCloture');        // clôturer / rouvrir = En cours / Réponses
      expect(src).not.toContain('EditeurReferenceMairie'); // réf mairie = En cours
      expect(src).not.toContain('leverSuspension');       // suspension = En cours
      expect(src).not.toContain('envoyerCascade');        // cascade partielle = En cours
    }
  });
});
