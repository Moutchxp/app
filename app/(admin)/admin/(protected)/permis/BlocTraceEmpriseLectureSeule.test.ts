import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * LOT 86 — GARDE PAR LECTURE DE SOURCE : le bloc « Projection des emprises » (Analyse) est un composant client lourd (pdf.js, effets)
 * non montable unitairement. On garde donc la STRUCTURE de la branche « aucun bâtiment déclaré » : elle ne doit plus court-circuiter le
 * schéma, mais le rendre en LECTURE SEULE (parcelle + empreinte + bâti BD TOPO), en ne masquant QUE les contrôles de tracé.
 */
const ici = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ici, 'BlocTraceEmprise.tsx'), 'utf8');
// Isole EXACTEMENT la branche « aucun-batiment » : de sa garde jusqu'au `return (` du rendu principal (vue « prête »).
const iBranche = src.indexOf("if (vue === 'aucun-batiment')");
const iFin = src.indexOf('\n  return (', iBranche);
const brancheEtSuite = src.slice(iBranche, iFin);

describe('LOT 86 — la garde « aucun bâtiment » n’efface plus le schéma (lecture seule)', () => {
  it('source unique de décision : la garde s’appuie toujours sur affichageTrace (vue === aucun-batiment), jamais une logique dupliquée', () => {
    expect(src).toContain('const vue = affichageTrace(etat, batiments.length)');
    expect(src).toContain("if (vue === 'aucun-batiment')");
  });

  it('la branche rend le schéma en LECTURE SEULE : SchemaParcelleTrace SANS onCliquer ni calage, gardé par `boite`', () => {
    expect(brancheEtSuite).toContain('boite ? (');                 // rendu conditionné à un cadre calculable
    expect(brancheEtSuite).toContain('<SchemaParcelleTrace');       // le schéma est bien rendu ici
    expect(brancheEtSuite).toContain('calageLambert={[]}');         // aucun point de calage (pas de tracé)
    expect(brancheEtSuite).not.toContain('onCliquer={');            // read-only : le schéma de cette branche ne câble aucun clic de tracé
    expect(brancheEtSuite).toContain('etiquettes={etiquettesProjection(');  // étiquettes des LOTs 82/83
    expect(brancheEtSuite).toContain('<LegendeProjectionEmprises');         // légende des LOTs 81/82/83 sous le schéma
  });

  it('LOT 90 — la LISEUSE lecture seule est montée à 0 bâtiment (gardée par `avecLiseuse`) ; le CALAGE reste FERMÉ (cul-de-sac sans bâtiment)', () => {
    expect(brancheEtSuite).toContain('avecLiseuse ? ('); // LOT 3a — liseuse montée SEULEMENT si avecLiseuse (sinon colonne gauche vide → on empile le seul schéma)
    expect(brancheEtSuite).toContain('<LiseusePieces dossierId={dossierId} onValeurEcrite={onValeurLue} donneesPrechargees={donneesLiseuse} titreEnEntete imageAgrandie={imageAgrandie} onToggleImageAgrandie={() => { setPleinEcran(false); setImageAgrandie((v) => !v); }} />'); // liseuse consultable, agrandi PILOTÉ par le parent + mutuellement exclusif du schéma
    expect(src).toContain('avecLiseuse = true');                     // prop, défaut true
    // Pas de boutons/mode de calage dans la branche (le calage vit dans le rendu principal, sous bâtiment).
    expect(brancheEtSuite).not.toContain("setMode('calage')");
    expect(brancheEtSuite).not.toContain('Calage (');
  });

  it('DEUX BOUTONS « agrandir » — à 0 bâtiment, MÊME STANDARD qu\'au nominal : « agrandir le plan » = liseuse SEULE plein écran ; « agrandir le schéma » = overlay schéma dédié ; mutuellement exclusifs ; surface de dessin jamais réutilisée', () => {
    // EN PAGE : 2 colonnes (liseuse | schéma), MÊMES proportions que le nominal.
    expect(brancheEtSuite).toContain("gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)'");
    // « agrandir le plan » (bouton de la liseuse → imageAgrandie) : la LISEUSE SEULE passe en plein écran (position:fixed), UNE colonne, schéma retiré.
    expect(brancheEtSuite).toMatch(/imageAgrandie\s*\n?\s*\?\s*\{[\s\S]*?position: 'fixed'/);
    expect(brancheEtSuite).toContain("gridTemplateColumns: 'minmax(0,1fr)'"); // UNE colonne quand le plan est seul
    expect(brancheEtSuite).toContain('{!imageAgrandie && blocSchema}');       // le schéma est RETIRÉ quand la liseuse est seule
    // l'agrandi est PORTÉ par BlocTraceEmprise et DÉLÉGUÉ à la liseuse, et MUTUELLEMENT EXCLUSIF du schéma (ferme pleinEcran).
    expect(brancheEtSuite).toContain('imageAgrandie={imageAgrandie}');
    expect(brancheEtSuite).toContain('onToggleImageAgrandie={() => { setPleinEcran(false); setImageAgrandie((v) => !v); }}');
    // « agrandir le schéma » (bouton du schéma → pleinEcran, ferme imageAgrandie) + son OVERLAY DÉDIÉ (le pleinEcran nominal est hors de cette branche).
    expect(brancheEtSuite).toContain('setImageAgrandie(false); setPleinEcran(true);');
    expect(brancheEtSuite).toContain('pleinEcran && boite && (');
    expect(brancheEtSuite).toContain('Schéma de la parcelle agrandi');
    // 🔴 CONDITION (inchangée) : on NE réutilise NI le conteneur de coordonnées NI la conversion de la surface de dessin dans cette branche.
    expect(brancheEtSuite).not.toContain('pdfContainerRef');
    expect(brancheEtSuite).not.toContain('cliquerPdf');
    expect(brancheEtSuite).not.toContain('onCliquer=');   // liseuse ET schéma restent PASSIFS (lecture seule, aucun point posé)
  });

  it('LOT 90 — message RECADRÉ : consulter les plans + « + ajouter un bâtiment » débloque tracé/enregistrement', () => {
    expect(brancheEtSuite).toContain('consulter');
    expect(brancheEtSuite).toContain('+ ajouter un bâtiment');
    // il ne dit plus « rien à tracer pour l’instant » comme SEUL contenu à la place du schéma
    expect(brancheEtSuite).not.toContain('rien à tracer pour l’instant');
  });

  it('HONNÊTETÉ : si aucun cadre (ni parcelle ni empreinte) → dire ce qui manque, jamais un cadre vide muet', () => {
    expect(brancheEtSuite).toContain('Rien à dessiner pour l’instant');
    expect(brancheEtSuite).toContain('empreinte non figée');
  });

  it('LOT 90 — En cours (SuiviDemandes) : BlocTraceEmprise reçoit avecLiseuse={false} (liseuse standalone déjà présente → pas de doublon)', () => {
    const sd = readFileSync(join(ici, 'SuiviDemandes.tsx'), 'utf8');
    expect(sd).toContain('avecLiseuse={false}');
  });
});

/**
 * INCRÉMENT 2 — la barre de commandes de la PLANCHE (LiseusePieces) est FACTORISÉE en un composant présentationnel partagé
 * (BarreVisionneusePieces) monté AUSSI sous le canvas du TRACÉ (BlocTraceEmprise). Parité SANS duplication (deux copies divergeraient —
 * c'est le défaut qu'on vient de corriger). RÈGLE ABSOLUE : la barre ne touche NI le canvas, NI afficherPage, NI la conversion de
 * coordonnées, et ne déclenche AUCUN rechargement (qui réinitialiserait le calage). Gardes par lecture de source (composant client lourd).
 */
describe('INCRÉMENT 2 — barre de commandes PARTAGÉE portée sous le canvas du tracé', () => {
  const liseuse = readFileSync(join(ici, 'LiseusePieces.tsx'), 'utf8');

  it('PARITÉ SANS DUPLICATION : le MÊME composant présentationnel est monté dans les DEUX visionneuses', () => {
    expect(src).toContain("import { BarreVisionneusePieces } from './BarreVisionneusePieces'");
    expect(liseuse).toContain("import { BarreVisionneusePieces } from './BarreVisionneusePieces'");
    expect(src).toContain('<BarreVisionneusePieces');
    expect(liseuse).toContain('<BarreVisionneusePieces');
  });

  it('LES 4 GROUPES DE FONCTIONS sont câblés dans le tracé : lien source, nav pages, best-of (ajout+retrait), analyse IA (fichier+page+annulation)', () => {
    expect(src).toContain('onOuvrirDocument={() => void ouvrirDocumentComplet()}');
    expect(src).toContain('onPagePrecedente={() => changerPage(-1)}');
    expect(src).toContain('onPageSuivante={() => changerPage(1)}');
    expect(src).toContain('onAjouterBestOf=');
    expect(src).toContain('onRetirerBestOf=');
    expect(src).toContain('onAnalyseFichier={() => void reperer()}');
    expect(src).toContain('onAnalysePage={() => void analyserPage()}');
    expect(src).toContain('onAnnulerValeur={() => void annulerValeurPage()}');
  });

  it('ZÉRO NOUVELLE ROUTE : les handlers réutilisent les actions serveur EXISTANTES', () => {
    // (exclure/desinclure sont passées via une variable ternaire → on cherche la chaîne d'action, pas la forme `action: '…'`.)
    for (const a of ['reperer_planches', 'lire_valeurs_page', 'annuler_lecture_page', 'exclure_page_bestof', 'desinclure_page_bestof', 'inclure_page_bestof', 'url_piece'])
      expect(src).toContain(`'${a}'`);
  });

  it('LIEN → NOUVEL ONGLET : le document complet s’ouvre dans un onglet séparé (fragment #page=N non signé), jamais un onglet vide sur erreur', () => {
    expect(src).toContain("window.open(page > 0 ? `${body.url}#page=${page}` : body.url, '_blank', 'noopener,noreferrer')");
  });

  it('DONNÉES DÉJÀ RENVOYÉES, désormais LUES ici (aucune requête neuve) : audits d’analyse + overrides best-of du même GET /emprise', () => {
    expect(src).toContain('setRuns(j.reperageRuns ?? {})');
    expect(src).toContain('setLectures(j.lecturesPages ?? {})');
    expect(src).toContain('setExclus(new Set((j.exclusionsBestOf ?? [])');
    expect(src).toContain('setInclus(new Set((j.inclusionsBestOf ?? [])');
    expect(src).toContain('setOrigineSansIa(j.origineExtractionSansIa ?? null)');
  });

  it('NAVIGATION best-of = bande AVEC overrides (LOT 61/92) ; la barre pilote la NAV, jamais le viewport', () => {
    expect(src).toContain('bandeAvecOverrides(construireBandePlans(pieces), pieces, exclus, inclus)');
  });

  it('RÈGLE ABSOLUE — aucun handler de la barre ne relance un chargement ni ne touche le rendu/les coordonnées (calage préservé)', () => {
    const iBarre = src.indexOf('LA BARRE DE COMMANDES PARTAGÉE');
    const iCalage = src.indexOf('const cliquerPdf', iBarre);
    expect(iBarre).toBeGreaterThan(-1);
    expect(iCalage).toBeGreaterThan(iBarre);
    const handlers = src.slice(iBarre, iCalage);
    // On cible des APPELS (pas la prose : la bannière du bloc NOMME ces invariants pour les documenter).
    expect(handlers).not.toContain('setRechargeLocal('); // un refetch réinitialiserait angle/sommets/sélection → INTERDIT
    expect(handlers).not.toContain('afficherPageRef');   // aucune interaction avec le rendu du canvas
    expect(handlers).not.toContain('.convertToPdfPoint('); // aucune conversion de coordonnées écran→PDF
    expect(handlers).not.toContain('setApercu(');        // ne republie jamais apercu/ratio (propriété du seul afficherPage)
  });
});

/**
 * LOT « paire unique » — Arno : il ne doit rester qu'UNE SEULE paire ‹ précédent / suivant › visible, SOUS l'image, à l'extrême
 * gauche/droite, et elle reprend le FONCTIONNEMENT des boutons du haut (navigation entre PLANS du best-of). Tout le bloc d'information
 * et « voir toutes les pièces » descendent sous l'image. La navigation entre PAGES reste ACCESSIBLE mais en contrôle DISCRET, nettement
 * distinct (flèches ◁ ▷). Même disposition dans les DEUX visionneuses (slots passés au composant partagé). Gardes par lecture de source.
 */
describe('LOT « paire unique » — une seule paire ‹/› (plans) sous l’image, pages en contrôle discret, disposition partagée', () => {
  const barre = readFileSync(join(ici, 'BarreVisionneusePieces.tsx'), 'utf8');
  const liseuse = readFileSync(join(ici, 'LiseusePieces.tsx'), 'utf8');
  const rendu = readFileSync(join(ici, 'TraceEmpriseRendu.tsx'), 'utf8');

  it('DISPOSITION PARTAGÉE : les DEUX visionneuses descendent la nav primaire + « voir toutes les pièces » via les MÊMES slots', () => {
    for (const f of [src, liseuse]) {
      expect(f).toContain('nav={nav}');
      expect(f).toContain('slotNav={slotNav}');
      expect(f).toContain('slotPieces={slotPieces}');
    }
  });

  it('LA PAIRE UNIQUE reprend le FONCTIONNEMENT des boutons du haut = navigation entre PLANS (BandePlans → appliquerPlan), dans les deux', () => {
    for (const f of [src, liseuse]) {
      expect(f).toContain('<BandePlans');                    // best-of : la paire primaire = plans
      expect(f).toContain('appliquerPlan(');                 // ‹ / › pilotent bien la navigation entre PLANS
      expect(f).toContain('<NavPieceLibre');                 // mode pièce libre : la paire primaire feuillette les pages
    }
    // la nav n'est plus AU-DESSUS du canvas : les composants de nav sont construits en slots (const slotNav), pas dans la colonne PDF.
    expect(src).toContain('const slotNav =');
    expect(liseuse).toContain('const slotNav =');
  });

  it('LA BARRE porte l’UNIQUE paire (slotNav) EN TÊTE, puis le contrôle de PAGE DISCRET (masqué en pièce libre), puis « voir toutes les pièces »', () => {
    const iNav = barre.indexOf('{slotNav}');
    const iPage = barre.indexOf("nav !== 'piece' && nbPagesPiece > 1");
    const iPieces = barre.indexOf('{slotPieces}');
    expect(iNav).toBeGreaterThan(-1);
    expect(iPage).toBeGreaterThan(iNav);      // le contrôle de page vient APRÈS la paire de plans
    expect(iPieces).toBeGreaterThan(iPage);   // « voir toutes les pièces » ensuite
    // contrôle de page DISCRET et distinct : glyphes ◁ ▷ (jamais les mêmes ‹ / › que la paire de plans), libellé « pages de ce fichier ».
    expect(barre).toContain('pages de ce fichier');
    expect(barre).toContain('◁');
    expect(barre).toContain('▷');
    // et il reste ACCESSIBLE + borné (aria propres, désactivés en butée).
    expect(barre).toContain('aria-label="Page précédente du fichier"');
    expect(barre).toContain('aria-label="Page suivante du fichier"');
    expect(barre).toContain('disabled={page <= 1}');
    expect(barre).toContain('disabled={page >= nbPagesPiece}');
  });

  it('L’ORDRE gauche/droite de la paire unique est porté par le composant partagé BandePlans : « ‹ précédent » AVANT « suivant › », en space-between', () => {
    const iBande = rendu.indexOf('export function BandePlans');
    const iFin = rendu.indexOf('export function bornerPage');
    const bloc = rendu.slice(iBande, iFin);
    expect(bloc).toContain("justifyContent: 'space-between'");     // extrême gauche / extrême droite
    // on cible le MARKUP des boutons (>…</button>) pour ne pas matcher la prose des commentaires (« ‹ précédent / suivant › »).
    const iPrec = bloc.indexOf('>‹ précédent</button>');
    const iInfo = bloc.indexOf('>plan {i + 1} sur {bande.length}<');
    const iSuiv = bloc.indexOf('>suivant ›</button>');
    expect(iPrec).toBeGreaterThan(-1);
    expect(iInfo).toBeGreaterThan(iPrec);   // le bloc d'information est ENTRE les deux boutons
    expect(iSuiv).toBeGreaterThan(iInfo);   // « suivant » à l'extrême droite, après l'information
  });

  it('NavPieceLibre (mode pièce libre) : la paire de PAGES reste à l’extrême gauche/droite (space-between) ; le RETOUR a quitté NavPieceLibre (déplacé dans la ligne de statut de la barre)', () => {
    const iNav = rendu.indexOf('export function NavPieceLibre');
    const iFin = rendu.indexOf('export type StatutBatiment');
    const bloc = rendu.slice(iNav, iFin);
    expect(bloc).toContain("justifyContent: 'space-between'");
    const iPrec = bloc.indexOf('>‹ page précédente</button>');
    const iSuiv = bloc.indexOf('>page suivante ›</button>');
    expect(iPrec).toBeGreaterThan(-1);
    expect(iSuiv).toBeGreaterThan(iPrec);
    // le bouton de retour n'est plus rendu par NavPieceLibre (on cible l'aria-label du bouton, pas la prose des commentaires).
    expect(bloc).not.toContain('aria-label="Revenir au best-of des plans"');
  });
});

/**
 * DEMANDES 1-5 (lot « aides de lecture ») — alignement des deux images, réorganisation de la colonne gauche (image → barre → « Étape 1 »
 * en dernier), repère best-of/fichier + badges par page dans la barre partagée, et correction du sélecteur de pièces (non affichables
 * listées). Gardes par lecture de source (composant client lourd) ; le comportement best-of/fichier est prouvé en montage jsdom ailleurs.
 */
describe('DEMANDES 1-5 — alignement, ordre colonne gauche, repères best-of/fichier, bug sélecteur', () => {
  const barre = readFileSync(join(ici, 'BarreVisionneusePieces.tsx'), 'utf8');
  const liseuse = readFileSync(join(ici, 'LiseusePieces.tsx'), 'utf8');

  it('DEMANDE 2 — COLONNE GAUCHE : l’image d’abord, puis la barre (nav + fonctions), puis « Étape 1 — caler la vue » EN DERNIER', () => {
    const iImage = src.indexOf('ref={pdfContainerRef}');
    const iBarre = src.indexOf('<BarreVisionneusePieces');
    // « Étape 1 » = le guide en POSITION INITIALE (bas de colonne gauche), rendu quand aucun processus n'est en cours.
    const iEtape1 = src.indexOf('tracable && !procEnCours && <div className="svv-guide-fondu">');
    expect(iImage).toBeGreaterThan(-1);
    expect(iBarre).toBeGreaterThan(iImage);   // la barre est SOUS l'image
    expect(iEtape1).toBeGreaterThan(iBarre);  // « Étape 1 » APRÈS la barre = dernière position de la colonne
  });

  it('DEMANDE 1 (9decccf) — ALIGNEMENT : dans la colonne droite le SCHÉMA passe AVANT la rotation/guidage → même hauteur que l’image', () => {
    const iSchema = src.indexOf('onCliquer={retouche ? cliquerRetouche'); // le schéma interactif (calage)
    // le guide côté schéma (rendu pendant le processus) est DESCENDU sous le schéma ; les options aussi.
    const iGuidageSchema = src.indexOf('tracable && procEnCours && <div className="svv-guide-fondu"');
    const iOptions = src.indexOf('<OptionsVisibiliteSchema', iSchema); // celui de la branche principale (après le schéma interactif)
    expect(iSchema).toBeGreaterThan(-1);
    expect(iGuidageSchema).toBeGreaterThan(iSchema);  // rotation/bandeau/guidage DESCENDUS sous le schéma
    expect(iOptions).toBeGreaterThan(iSchema);        // options DESCENDUES sous le schéma
  });

  it('PARITÉ — les DEUX visionneuses remontent la ligne d’outils (zoom + « mode grandes images ») et passent onRetourBestOf à la barre', () => {
    for (const f of [src, liseuse]) {
      expect(f).toContain('const ligneOutils =');            // ligne d'outils au-dessus de l'image (ex-slotActions)
      expect(f).toContain('mode grandes images');            // « Agrandir l'image » RENOMMÉ
      expect(f).toContain('onRetourBestOf={retourBestOf}');
      expect(f).not.toContain('slotActions');                // slotActions supprimé (plus dans la barre)
    }
  });

  it('DEMANDE 1 (ce lot) — LIGNE D’OUTILS au-dessus des DEUX images (tracé) : zoom + « mode grandes images » à gauche, « Agrandir le schéma » à l’extrême droite', () => {
    const iLigneDef = src.indexOf('const ligneOutils =');
    const iFinDef = src.indexOf('const vue = affichageTrace', iLigneDef);
    const bloc = src.slice(iLigneDef, iFinDef);
    expect(bloc).toContain("gridColumn: '1 / -1'");            // span les 2 colonnes (au-dessus des deux images)
    expect(bloc).toContain("justifyContent: 'space-between'"); // gauche / extrême droite
    const iZoom = bloc.indexOf('<ZoomPdf');
    const iMode = bloc.indexOf('mode grandes images');
    const iSchemaBtn = bloc.indexOf('⤢ Agrandir le schéma');
    expect(iZoom).toBeGreaterThan(-1);
    expect(iMode).toBeGreaterThan(iZoom);          // zoom PUIS « mode grandes images » (groupe gauche)
    expect(iSchemaBtn).toBeGreaterThan(iMode);     // « Agrandir le schéma » à l'extrême droite (après le groupe gauche)
    // la ligne est RENDUE en tête de grille, AVANT l'image.
    const iRender = src.indexOf('{ligneOutils}');
    const iImage = src.indexOf('ref={pdfContainerRef}');
    expect(iRender).toBeGreaterThan(-1);
    expect(iRender).toBeLessThan(iImage);
  });

  it('LIGNE DE STATUT (ce lot) — statut de l’IMAGE (« Image best-of » / « Image fichier ») + retour au best-of (onRetourBestOf) sur la ligne du titre', () => {
    expect(barre).toContain('Image best-of');
    expect(barre).toContain('Image fichier');
    expect(barre).toContain('onClick={onRetourBestOf}');
    expect(barre).toContain("'Best-of des plans proposés'"); // le titre est désormais dans la barre
    // l'ancien bandeau « Vous parcourez… » (doublon du statut d'image) a été SUPPRIMÉ.
    expect(barre).not.toContain('Vous parcourez le');
  });

  it('CAPSULE IA — QUATRE états distincts (valeurs / sans valeur / échec / non analysée), dérivés de l’audit de page (zéro route)', () => {
    expect(barre).toContain('Page analysée IA');            // valeurs → fond bleu + blanc
    expect(barre).toContain('analysée, aucune valeur');     // sans valeur (bug cerfa corrigé) — distinct de « non analysée »
    expect(barre).toContain('analyse échouée');             // échec (jamais silencieux)
    expect(barre).toContain('non analysée IA');             // jamais analysée
    // valeurs = lecture envoyée ET nb_valeurs > 0 ; sinon « sans valeur » : la distinction lève « analysée → non analysée ».
    expect(barre).toContain('lectureCourante.envoyee && lectureCourante.nbValeurs > 0');
    // couleurs FIXES pour valeurs (bleu) et échec (ambre) → lisibles clair ET sombre.
    expect(barre).toContain("background: '#1a4d8f', color: '#fff'");
    expect(barre).toContain("background: '#8a5a00', color: '#fff'");
  });

  it('DEMANDE 5 — la visionneuse de tracé lit `piecesNonSupportees` du GET et les passe au sélecteur (plus d’écartement silencieux)', () => {
    expect(src).toContain('setPiecesNonSupportees(j.piecesNonSupportees ?? [])');
    expect(src).toContain('nonSupportees={piecesNonSupportees}');
  });
});

/**
 * FIX « ascenseur du guide » — le bloc « Étape 1 — caler la vue » ne doit plus faire l'ascenseur à chaque clic : sa POSITION suit
 * l'existence d'un travail en cours (état `procEnCours`, décision pure `guideCalageSousSchema`), pas le dernier côté cliqué. La logique
 * par phase (a-e) est prouvée en unitaire sur la fonction pure (TraceEmpriseRendu.test.ts) ; ici on garde le CÂBLAGE et l'unicité (f)
 * par lecture de source — BlocTraceEmprise n'est jamais monté (composant client lourd, pipeline de coordonnées gelé).
 */
describe('FIX « ascenseur du guide » — câblage : position pilotée par procEnCours, un seul guide, apparition sobre', () => {
  it('(f) UN SEUL guide à la fois : deux sites MUTUELLEMENT EXCLUSIFs (!procEnCours ⊕ procEnCours), plus AUCUN gating par guidage.sur', () => {
    expect(src).toContain('tracable && !procEnCours && <div className="svv-guide-fondu"><GuidageTraceBox'); // position initiale (repos)
    expect(src).toContain('tracable && procEnCours && <div className="svv-guide-fondu"');                   // sous le schéma (en cours), conteneur groupé
    expect((src.match(/<GuidageTraceBox/g) ?? []).length).toBe(2); // exactement deux exemplaires dans le source, jamais rendus ensemble
    // le gating par « quel côté cliquer » (guidage.sur) a DISPARU des conditions de rendu → fin de l'ascenseur.
    expect(src).not.toContain("guidage.sur === 'plan' && <GuidageTraceBox");
    expect(src).not.toContain("guidage.sur === 'schema' && <GuidageTraceBox");
  });

  it('la position est pilotée par l’ÉTAT « processus en cours » (fonction pure), armé à la pose d’un point, désarmé à la VALIDATION', () => {
    expect(src).toContain('guideCalageSousSchema(creationEnCours, planEnAttente !== null, paires.length, sommets.length)');
    expect(src).toContain('if (!creationEnCours && enPose) setCreationEnCours(true)'); // armement pendant le rendu (pas d'effet ; cliquerPdf non touché)
    expect(src).toContain('setSommets([]); setCreationEnCours(false)');                 // désarmement à la validation (enregistrer)
  });

  it('apparition SOBRE : classe .svv-guide-fondu, fondu DÉSACTIVÉ sous prefers-reduced-motion', () => {
    const css = readFileSync(join(ici, '../../../../globals.css'), 'utf8');
    expect(src).toContain('className="svv-guide-fondu"');
    expect(css).toContain('.svv-guide-fondu');
    expect(css).toContain('prefers-reduced-motion: no-preference');
  });
});

/**
 * SUITE LOT 7b47817 — un SECOND bloc (barre d'outils calage/tracé + encadré de contrôle « résidu + échelle implicite/déclarée » +
 * aire) suit EXACTEMENT le même sort que le guide : au repos à sa position actuelle, et SOUS LE SCHÉMA, GROUPÉ avec le guide, pendant
 * tout le processus. UNE seule source de vérité (procEnCours) ; deux sites de rendu mutuellement exclusifs. Gardes par lecture de source.
 */
describe('SUITE LOT 7b47817 — le bloc outils/contrôle suit procEnCours, groupé avec le guide', () => {
  it('SOURCE UNIQUE : blocOutilsCalage défini UNE fois, rendu à DEUX sites (repos vs en cours), aucune 3e source, aucun état parallèle', () => {
    expect((src.match(/const blocOutilsCalage =/g) ?? []).length).toBe(1);          // une seule définition
    expect((src.match(/blocOutilsCalage/g) ?? []).length).toBe(3);                  // 1 déf + 2 rendus, jamais plus
    expect(src).toContain('{!procEnCours && blocOutilsCalage}');                    // au repos : position actuelle (inchangée)
    // réutilise procEnCours (même état/décision que le guide) : aucun drapeau dédié à ce bloc.
    expect(src).not.toMatch(/const \[[a-zA-Z]*[Oo]util/);
  });

  it('GROUPÉS pendant le processus : dans le conteneur procEnCours, le guide PUIS le bloc (même ordre, sous le schéma), jamais séparés', () => {
    const iGroupe = src.indexOf('tracable && procEnCours && <div className="svv-guide-fondu"');
    const iGuide = src.indexOf('<GuidageTraceBox', iGroupe);
    const iBloc = src.indexOf('{blocOutilsCalage}', iGroupe);
    const iFinGroupe = src.indexOf('<OptionsVisibiliteSchema', iGroupe); // borne : le conteneur groupé précède les options de visibilité (sous le schéma)
    expect(iGuide).toBeGreaterThan(iGroupe);
    expect(iBloc).toBeGreaterThan(iGuide);          // ordre lisible : guide au-dessus, bloc en dessous
    expect(iBloc).toBeLessThan(iFinGroupe);         // le bloc est BIEN dans le conteneur groupé (avant les options sous le schéma)
  });

  it('(g) le RÉSIDU de calage + l’échelle implicite/déclarée + l’aire vivent DANS ce bloc → restent lisibles pendant le tracé', () => {
    const iDef = src.indexOf('const blocOutilsCalage =');
    const iFin = src.indexOf('const vue = affichageTrace', iDef);
    const bloc = src.slice(iDef, iFin);
    expect(bloc).toContain('Calage ({paires.length}/2)');
    expect(bloc).toContain('Tracé ({sommets.length})');
    expect(bloc).toContain('échelle 1:');
    expect(bloc).toContain('<BandeauCalage calage={vc}');          // encadré de contrôle : Calage ✓ + résidu + échelle implicite/déclarée
    expect(bloc).toContain('<BandeauVraisemblance aireM2={aire}'); // Aire — tracez un contour fermé
  });
});

/**
 * DEMANDES 1-3 (ce lot) — la liste « voir toutes les pièces » du TRACÉ passe au MÊME composant explicite que la planche
 * (ListePiecesAnalyse) : un seul clic l'ouvre (fin du <select> à re-cliquer), groupée par catégorie, best-of en bleu. Les deux
 * visionneuses ne divergent pas. Gardes par lecture de source (BlocTraceEmprise n'est jamais monté).
 */
describe('DEMANDES 1-3 — liste des pièces unifiée (ListePiecesAnalyse) côté tracé', () => {
  it('DEMANDE 1 — le tracé rend une LISTE EXPLICITE (ListePiecesAnalyse), plus le <select> SelecteurPiecePlan (qui exigeait un 2e clic)', () => {
    expect(src).toContain('<ListePiecesAnalyse');
    expect(src).not.toContain('<SelecteurPiecePlan'); // le sélecteur natif (double clic) a disparu du tracé
  });
  it('DEMANDES 2/3 — le tracé calcule analyseParPiece + piecesBestOf et les passe à la liste (groupement + marquage bleu, comme la planche)', () => {
    expect(src).toContain('const analyseParPiece = useMemo');
    expect(src).toContain('const piecesBestOf = useMemo(() => new Set(bande.map((pl) => pl.pieceId))');
    expect(src).toContain('piecesBestOf={piecesBestOf}');
    expect(src).toContain('nonSupportees={piecesNonSupportees}'); // acquis 9decccf conservé
  });
});

/**
 * BUG CERFA « analysée → non analysée » — côté TRACÉ, `analyserPage` NE REFETCH PAS (préserve le calage). La capsule ne pouvait donc
 * pas refléter l'analyse. CORRECTION : mise à jour OPTIMISTE de l'audit local (`setLectures`) depuis la réponse du service, et `echec`
 * transitoire sur panne (capsule « analyse échouée », jamais silencieux). Garde par lecture de source (BlocTraceEmprise non monté).
 */
describe('BUG CERFA (côté tracé) — capsule fidèle après analyse sans refetch', () => {
  it('analyserPage met à jour l’audit local OPTIMISTIQUEMENT (setLectures) depuis resume.envoyee/ecrit, sans rechargement (calage préservé)', () => {
    const iAnalyse = src.indexOf('const analyserPage = useCallback');
    const bloc = src.slice(iAnalyse, iAnalyse + 2400); // le corps de analyserPage tient dans cette fenêtre
    expect(bloc).toContain('setLectures((prev) => ({ ...prev, [pieceId]:'); // upsert optimiste de la page
    expect(bloc).toContain('const envoyee = body.resume?.envoyee !== false');
    expect(bloc).toContain('const nbValeurs = body.resume?.ecrit === true ? 1 : 0');
    expect(bloc).not.toContain('setRechargeLocal'); // toujours PAS de refetch ici (calage)
  });
  it('les 4 chemins d’ÉCHEC arment `echec` (capsule « analyse échouée »), jamais silencieux', () => {
    const iAnalyse = src.indexOf('const analyserPage = useCallback');
    const bloc = src.slice(iAnalyse, iAnalyse + 2400);
    // 401, 409, réponse !ok, exception réseau → tous via `echouer(...)`.
    expect((bloc.match(/echouer\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(bloc).toContain("setLectureRes({ cle, texte, ecrit: false, echec: true })");
  });
});
