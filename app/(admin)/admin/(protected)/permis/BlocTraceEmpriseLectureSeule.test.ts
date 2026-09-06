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
    expect(brancheEtSuite).toContain('avecLiseuse && <LiseusePieces dossierId={dossierId} />'); // liseuse consultable
    expect(src).toContain('avecLiseuse = true');                     // prop, défaut true
    // Pas de boutons/mode de calage dans la branche (le calage vit dans le rendu principal, sous bâtiment).
    expect(brancheEtSuite).not.toContain("setMode('calage')");
    expect(brancheEtSuite).not.toContain('Calage (');
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
  const barre = readFileSync(join(ici, 'BarreVisionneusePieces.tsx'), 'utf8');
  const liseuse = readFileSync(join(ici, 'LiseusePieces.tsx'), 'utf8');

  it('PARITÉ SANS DUPLICATION : le MÊME composant présentationnel est monté dans les DEUX visionneuses', () => {
    expect(src).toContain("import { BarreVisionneusePieces } from './BarreVisionneusePieces'");
    expect(liseuse).toContain("import { BarreVisionneusePieces } from './BarreVisionneusePieces'");
    expect(src).toContain('<BarreVisionneusePieces');
    expect(liseuse).toContain('<BarreVisionneusePieces');
  });

  it('DISPOSITION (portée par le composant partagé, donc identique dans les 2 contextes) : « précédent » à GAUCHE, « suivant » à DROITE (space-between)', () => {
    expect(barre).toContain("justifyContent: 'space-between'");
    const iPrec = barre.indexOf('‹ page précédente');
    const iSuiv = barre.indexOf('page suivante ›');
    expect(iPrec).toBeGreaterThan(-1);
    expect(iSuiv).toBeGreaterThan(iPrec); // ordre du DOM = ordre visuel sous space-between : précédent AVANT suivant
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
