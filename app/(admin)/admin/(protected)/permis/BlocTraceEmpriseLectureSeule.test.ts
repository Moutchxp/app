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
    // liseuse consultable, agrandi PILOTÉ par le parent (parité) — fragments sémantiques (la forme exacte de l'appel évolue avec le niveau 3).
    expect(brancheEtSuite).toContain('<LiseusePieces key="liseuse" dossierId={dossierId}');
    expect(brancheEtSuite).toContain('onValeurEcrite={onValeurLue}');
    expect(brancheEtSuite).toContain('donneesPrechargees={donneesLiseuse}');
    expect(src).toContain('avecLiseuse = true');                     // prop, défaut true
    // Pas de boutons/mode de calage dans la branche (le calage vit dans le rendu principal, sous bâtiment).
    expect(brancheEtSuite).not.toContain("setMode('calage')");
    expect(brancheEtSuite).not.toContain('Calage (');
  });

  it('PARITÉ MODE XL — à 0 bâtiment, « mode XL » ouvre un OVERLAY 2 colonnes (liseuse | schéma), piloté par BlocTraceEmprise, sans toucher la surface de dessin', () => {
    // overlay plein écran 2 colonnes, GATED par imageAgrandie (même structure que le nominal)
    expect(brancheEtSuite).toMatch(/imageAgrandie\s*\n?\s*\?\s*\{[\s\S]*?position: 'fixed'/);
    expect(brancheEtSuite).toContain("gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)'"); // 2 colonnes liseuse | schéma
    // l'agrandi est PORTÉ par BlocTraceEmprise et DÉLÉGUÉ à la liseuse (état + toggle) — pas l'imageAgrandie interne de la liseuse.
    //   LOT 3 — le flag niveau 2 retombe à l'entrée du niveau 3 (plan seul) → `imageAgrandie && !planSeul`.
    expect(brancheEtSuite).toContain('imageAgrandie={imageAgrandie && !planSeul}');
    expect(brancheEtSuite).toContain('onToggleImageAgrandie={');
    // 🔴 CONDITION : on NE réutilise NI le conteneur de coordonnées NI la conversion de la surface de dessin dans cette branche.
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

  it('LOT 3 (demandes 1-2) — NIVEAU 3 à 0 bâtiment : entrée CONSULTATION + message d’empêchement porté par la liseuse ; conteneur plein écran une colonne', () => {
    // Le niveau 3 (planSeul) ouvre un conteneur plein écran UNE colonne (flex column), au-dessus des niveaux 1-2 (zIndex 1001), SANS schéma.
    expect(brancheEtSuite).toMatch(/planSeul\s*\n?\s*\?\s*\{[\s\S]*?zIndex: 1001[\s\S]*?flexDirection: 'column'/);
    expect(brancheEtSuite).toContain('{!planSeul && blocSchema}');            // le schéma disparaît au niveau 3 (le plan prend toute la largeur)
    // Le bouton d'entrée (⤢ mode XXL) est délégué à la liseuse via onOuvrirPlanSeul ; le RETOUR au niveau 2 (mode XL) via onQuitterPlanSeul.
    expect(brancheEtSuite).toContain('onOuvrirPlanSeul={() => setPlanSeul(true)}');
    expect(brancheEtSuite).toContain('onQuitterPlanSeul={() => setPlanSeul(false)}');
    expect(brancheEtSuite).toContain('planSeul={planSeul}');
    // DEMANDE 2 — message EXACT, à l'emplacement des boutons de tracé (ici porté par la liseuse, aucun tracé possible sans bâtiment).
    expect(brancheEtSuite).toContain('messagePlanSeul="Impossible de tracer un polygone sans bâtiment renseigné"');
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

  it('PARITÉ — les DEUX visionneuses ont une barre d’outils (zoom + « mode XL ») au-dessus de l’image et passent onRetourBestOf à la barre', () => {
    for (const f of [src, liseuse]) {
      expect(f).toMatch(/const (ligneOutils|barreGauchePlan) =/); // barre au-dessus de l'image (LiseusePieces : ligneOutils ; BlocTraceEmprise : barreGauchePlan)
      expect(f).toContain('mode XL');            // bascule d'affichage (ex-« mode grandes images »)
      expect(f).toContain('onRetourBestOf={retourBestOf}');
      expect(f).not.toContain('slotActions');                // slotActions supprimé (plus dans la barre)
    }
  });

  it('LOT « barres dans les cadres » — chaque colonne est une CARTE (svv-card) coiffée de SA barre EN TÊTE, DANS le cadre (parité EXACTE 470)', () => {
    // Plus AUCUN bandeau au-dessus des cadres (ni barre unique pleine largeur, ni cellules de rangée 1) : le slot de tête n'existe qu'au niveau 3.
    expect(src).not.toContain('planSeul ? barreNiveau3 : ligneOutils');
    expect(src).not.toContain('key="barre-plan"');   // les cellules de rangée 1 (77db24a) ont disparu…
    expect(src).not.toContain('key="barre-schema"');  // …la barre est DANS la carte de chaque colonne
    expect(src).toContain('<div key="topbar"'); // seul le niveau 3 garde une barre en tête (hors carte)
    // COLONNE PLAN = carte, barre À L'INTÉRIEUR en tête, AVANT l'image (pdfContainerRef).
    expect(src).toContain('<div key="colpdf" className="svv-card"');
    const iBG = src.indexOf('{!planSeul && barreGauchePlan}');
    const iImage = src.indexOf('ref={pdfContainerRef}');
    expect(iBG).toBeGreaterThan(-1);
    expect(iBG).toBeLessThan(iImage);
    // COLONNE SCHÉMA = carte, barre À L'INTÉRIEUR en tête, AVANT le SchemaParcelleTrace calé.
    expect(src).toContain('<div key="schema" className="svv-card"');
    const iBD = src.indexOf('{barreDroiteSchema}');
    const iSchemaMain = src.indexOf('calageLambert={paires.map((p) => p.lambert)}');
    expect(iBD).toBeGreaterThan(-1);
    expect(iBD).toBeLessThan(iSchemaMain);
    // BARRE GAUCHE : zoom PUIS « mode XL ».
    const iG = src.indexOf('const barreGauchePlan =');
    const g = src.slice(iG, src.indexOf('const barreDroiteSchema =', iG));
    expect(iG).toBeGreaterThan(-1);
    expect(g).toContain('<ZoomPdf');
    expect(g.indexOf('mode XL')).toBeGreaterThan(g.indexOf('<ZoomPdf'));
    // BARRE DROITE : RotationSchema PUIS « Agrandir le schéma ».
    const iD = src.indexOf('const barreDroiteSchema =');
    const d = src.slice(iD, src.indexOf('const vue = affichageTrace', iD));
    expect(iD).toBeGreaterThan(-1);
    expect(d).toContain('<RotationSchema');
    expect(d.indexOf('⤢ Agrandir le schéma')).toBeGreaterThan(d.indexOf('<RotationSchema'));
    // MÊME hauteur mini des deux barres (styleBarre partagé) → les deux panneaux démarrent à la même hauteur dans leurs cadres.
    expect(src).toContain('const styleBarre: CSSProperties');
  });

  it('3 FINITIONS — (1) « mode XL » poussé à droite au niveau 1 ; (2) barre droite sur une ligne (curseur court + groupe à droite) ; (3) messages d’empêchement EN ROUGE', () => {
    const rendu = readFileSync(join(ici, 'TraceEmpriseRendu.tsx'), 'utf8');
    const liseuse = readFileSync(join(ici, 'LiseusePieces.tsx'), 'utf8');
    // POINT 1 — barre gauche : space-between INCONDITIONNEL (plus de `imageAgrandie ? ... : 'flex-start'`) → zoom à gauche, écran à droite AUX DEUX niveaux.
    const iBG = src.indexOf('const barreGauchePlan =');
    const bg = src.slice(iBG, src.indexOf('const barreDroiteSchema', iBG));
    expect(bg).toContain("justifyContent: 'space-between'");
    expect(bg).not.toContain("imageAgrandie ? 'space-between' : 'flex-start'");
    // POINT 2 — barre droite : curseur RACCOURCI ici (prop, pas le défaut) + groupe justifié À DROITE. RotationSchema expose `largeurCurseur` (défaut 120).
    const iBD = src.indexOf('const barreDroiteSchema =');
    const bd = src.slice(iBD, src.indexOf('const vue = affichageTrace', iBD));
    expect(bd).toContain("justifyContent: 'flex-end'");
    expect(bd).toContain('largeurCurseur={48}');
    expect(rendu).toContain('largeurCurseur = 120');   // DÉFAUT inchangé → les autres appelants (blocSchema, pleinEcran) gardent 120
    expect(rendu).toContain('style={{ width: largeurCurseur }}');
    // POINT 3 — messages d'empêchement EN ROUGE (jeton d'alerte existant), textes inchangés.
    expect(src).toContain("const styleEmpechement: CSSProperties = { fontSize: 12, color: 'var(--color-svv-red)' }");
    expect(src).toContain('style={styleEmpechement}>{acces.message}');                 // barre niveau 3
    expect(src).toContain('style={{ ...styleEmpechement, maxWidth: 320 }}>{acces.message}'); // blocOutilsCalage (niveaux 1-2)
    expect(liseuse).toContain("color: 'var(--color-svv-red)' }}>{messagePlanSeul}");    // « … sans bâtiment renseigné » (0 bâtiment, niveau 3)
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

/**
 * LOT 3 (enchaînement) — le niveau 3 « plan seul » enchaîne le tracé de TOUS les bâtiments sans quitter le plein écran : une BANDE en tête
 * (sélecteur de bâtiments défilant horizontalement + bouton de validation du bâtiment actif) apparaît QUAND ① au moins un bâtiment ET ②
 * le calage est complet (`acces.disponible`). Sélecteur et bouton sont une SOURCE UNIQUE réutilisée par la vue 2 colonnes (jamais redessinés).
 * Bande et messages rouges d'empêchement ne coexistent jamais (conditions opposées disponible/non-disponible). Garde par lecture de source.
 */
describe('LOT 3 (enchaînement) — bande de bâtiments + validation en tête du niveau 3', () => {
  it('les cartouches ET la chaîne de validation sont des SOURCES UNIQUES réutilisées (jamais de second dessin)', () => {
    // Une seule définition de chaque source ; le `.map(` sur batiments et la chaîne `etapeChaine === 'enregistrer'` ne sont PAS ré-inlinés.
    expect(src).toContain('const boutonsCartouches = (avecRefActif: boolean) => batiments.map((b) =>');
    expect(src).toContain('const chaineBoutons = (');
    expect((src.match(/=> batiments\.map\(\(b\) =>/g) ?? []).length).toBe(1); // un SEUL map de cartouches (la source unique)
    expect((src.match(/etapeChaine === 'enregistrer'/g) ?? []).length).toBe(1); // une SEULE chaîne (dans chaineBoutons)
    // Réutilisation aux DEUX emplacements : vue 2 colonnes (repli) et bande du niveau 3 (défilement).
    expect(src).toContain('{boutonsCartouches(false)}'); // vue 2 colonnes, repli multi-lignes
    expect(src).toContain('{boutonsCartouches(true)}');  // bande niveau 3, ref d'auto-défilement sur l'actif
    expect((src.match(/\{chaineBoutons\}/g) ?? []).length).toBe(2); // vue 2 colonnes + bande niveau 3
  });
  it('la BANDE du niveau 3 n’apparaît QUE sous `acces.disponible` (① bâtiment + ② calage) — jamais avec les messages rouges', () => {
    const iTop = src.indexOf('<div key="topbar"');
    const iBarre = src.indexOf('{barreNiveau3}', iTop);
    const bloc = src.slice(iTop, iBarre); // la bande est AVANT barreNiveau3, dans le même conteneur
    expect(bloc).toContain('{acces.disponible && ('); // condition d'apparition = ① et ② réunies
    expect(bloc).toContain('{boutonsCartouches(true)}');
    expect(bloc).toContain('{chaineBoutons}');
    expect(bloc).toContain("overflowX: 'auto'"); // défilement horizontal (jamais de repli multi-lignes dans la bande)
  });
  it('le cartouche ACTIF de la bande est amené dans la vue par défilement DOM (scrollIntoView), sans setState-dans-effet', () => {
    expect(src).toContain('cartoucheActifRef = useRef<HTMLButtonElement>(null)');
    expect(src).toContain("cartoucheActifRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })");
    // le ref n'est posé QUE sur l'actif de la bande niveau 3 (avecRefActif), jamais sur le sélecteur de la vue 2 colonnes.
    expect(src).toContain('ref={avecRefActif && actif ? cartoucheActifRef : undefined}');
  });
});
