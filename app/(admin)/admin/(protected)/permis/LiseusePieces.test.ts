import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { LiseusePieces } from './LiseusePieces';
import { construireBandePlans, cibleBestOf, type PiecePlan } from './TraceEmpriseRendu';

/**
 * LOT 14b — LISEUSE DE PIÈCES (lecture seule). Une liseuse NEUVE, jumelle de rendu de BlocTraceEmprise (duplication du rendu pdf.js
 * ASSUMÉE), mais qui RÉUTILISE — sans les recopier — les RÈGLES de best-of de TraceEmpriseRendu. On prouve :
 *   1. même sélection / même ordre / même plan par défaut que l'existant (assertion sur les fonctions PURES PARTAGÉES) ;
 *   2. les règles ne sont pas DUPLIQUÉES (import depuis TraceEmpriseRendu, aucune réimplémentation locale) ;
 *   3. AUCUN outil de tracé/adoption/verdict dans la liseuse ; pdf.js chargé DYNAMIQUEMENT (paresseux) ;
 *   4. à la simple montée (avant tout effet), rien n'est peint : pas de <canvas> tant que les pièces ne sont pas chargées ;
 *   5. BlocTraceEmprise.tsx et TraceEmpriseRendu.tsx n'ont AUCUNE dépendance sur la liseuse (le tracé reste indépendant, bit-à-bit).
 * Les tests tournent sans canvas ni pdf.js : on ne prétend PAS vérifier le rendu PDF lui-même.
 */
const SRC = readFileSync(fileURLToPath(new URL('./LiseusePieces.tsx', import.meta.url)), 'utf8');
const TRACE = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8');
const RENDU = readFileSync(fileURLToPath(new URL('./TraceEmpriseRendu.tsx', import.meta.url)), 'utf8');

// Jeu de pièces représentatif : 2 plans PROPOSÉS (masse à 2 planches, étage à 1 planche) + 1 pièce NON proposée (un Cerfa).
const PIECES: PiecePlan[] = [
  { id: 10, nomFichier: 'PCMI2-plan-de-masse.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 2, echelle: '1/200' }, { page: 3, echelle: '1/500' }] },
  { id: 11, nomFichier: 'PCMI4-plan-etage.pdf', propose: true, famille: 'etage', confirme: true, planches: [{ page: 1, echelle: null }] },
  { id: 12, nomFichier: 'cerfa.pdf', propose: false, famille: null },
];

describe('LOT 14b — règles best-of PARTAGÉES (même sélection/ordre/plan par défaut que l’existant)', () => {
  it('n’expose que les pièces proposées, éclatées par planche, dans l’ordre d’entrée (masse → étage)', () => {
    const bande = construireBandePlans(PIECES);
    // La pièce NON proposée (Cerfa) est absente de la bande ; chaque planche des proposées est une entrée.
    expect(bande.map((p) => [p.pieceId, p.page])).toEqual([[10, 2], [10, 3], [11, 1]]);
    expect(bande.some((p) => p.pieceId === 12)).toBe(false);
  });

  it('le plan par défaut ouvert = le premier de la bande (le mieux classé)', () => {
    const bande = construireBandePlans(PIECES);
    // La liseuse ouvre sur bande[0] (cf. LiseusePieces : setPieceId(b[0]?.pieceId), setPage(b[0]?.page)).
    expect({ pieceId: bande[0].pieceId, page: bande[0].page }).toEqual({ pieceId: 10, page: 2 });
    // Navigation best-of bornée par cibleBestOf (règle partagée) : « suivant » depuis 0 → index 1 ; débordement clampé au dernier.
    expect(cibleBestOf(bande, 1).plan).toEqual({ index: 1, pieceId: 10, page: 3 });
    expect(cibleBestOf(bande, 99).plan).toEqual({ index: 2, pieceId: 11, page: 1 });
  });

  it('aucune pièce → bande vide, best-of sans plan (la liseuse affichera « aucune pièce »)', () => {
    expect(construireBandePlans([])).toEqual([]);
    expect(cibleBestOf([], 0)).toEqual({ nav: 'bestof', plan: null });
  });
});

describe('LOT 14b — zéro duplication des RÈGLES, rendu neuf isolé', () => {
  it('IMPORTE les règles best-of depuis TraceEmpriseRendu (ne les recopie pas)', () => {
    expect(SRC).toMatch(/import\s*\{[\s\S]*construireBandePlans[\s\S]*cibleBestOf[\s\S]*\}\s*from\s*'\.\/TraceEmpriseRendu'/);
    // Aucune réimplémentation locale des règles : pas de `function construireBandePlans` / `cibleBestOf` défini ici.
    expect(SRC).not.toMatch(/function\s+construireBandePlans/);
    expect(SRC).not.toMatch(/function\s+cibleBestOf/);
  });

  it('charge pdf.js DYNAMIQUEMENT (paresseux) — jamais en import de tête de module', () => {
    expect(SRC).toContain("await import('pdfjs-dist/legacy/build/pdf.mjs')");
    // LOT 22 : le RUNTIME pdf.js reste importé dynamiquement ; le seul import de tête est un `import type` (erasé au runtime, aucun coût).
    const importsPdfjs = SRC.split('\n').filter((l) => /from\s*'pdfjs-dist/.test(l) && l.trimStart().startsWith('import'));
    expect(importsPdfjs.every((l) => l.trimStart().startsWith('import type'))).toBe(true);
  });

  it('AUCUN outil de tracé/adoption/verdict dans la liseuse (lecture seule stricte)', () => {
    for (const interdit of ['onVerdict', 'setSommets', 'setPaires', 'sommets', 'paires', 'AdoptionGroupes', 'BandeauProjection', 'convertToPdfPoint', 'enregistrer', 'planEnAttente']) {
      expect(SRC, `la liseuse ne doit pas contenir « ${interdit} »`).not.toContain(interdit);
    }
  });
});

describe('LOT 92 — ajouter/retirer une PAGE au best-of depuis l’aperçu (garde par lecture de source)', () => {
  it('bouton TOGGLE grain PAGE : « ajouter cette page » hors best-of, « retirer » dedans — jamais un bouton muet', () => {
    expect(SRC).toContain('＋ ajouter cette page au best-of');
    expect(SRC).toContain('✕ retirer du best-of');
    expect(SRC).toMatch(/pageDansBestOf \?/); // toggle selon l'appartenance de LA PAGE affichée
  });
  it('l’ajout agit sur LA PAGE COURANTE (pieceId, page), jamais le fichier entier', () => {
    expect(SRC).toContain('ajouterAuBestOf(pieceId, page)');
    expect(SRC).toContain("action: 'inclure_page_bestof'");
  });
  it('best-of visible = bande AUTO + overrides (source unique bandeAvecOverrides), état `inclus` persisté', () => {
    expect(SRC).toContain('bandeAvecOverrides(bande, pieces, exclus, inclus)');
    expect(SRC).toContain('const [inclus, setInclus]');
    expect(SRC).toContain('inclusionsBestOf');
  });
  it('retrait d’une page AJOUTÉE = désinclusion (retour au calcul auto) ; d’une page AUTO = exclusion (réintégrable)', () => {
    expect(SRC).toMatch(/pl\.manuel \? 'desinclure_page_bestof' : 'exclure_page_bestof'/);
  });
  it('RÉVERSIBILITÉ : liste des pages ajoutées, chacune retirable (miroir des retirées)', () => {
    expect(SRC).toMatch(/ajoutee?s\.length > 0/);
    expect(SRC).toContain('ajoutée');
  });
  it('migration 194 (inclusion) livrée, MIROIR de 190, avec résilience 42P01 documentée', () => {
    const mig = readFileSync(fileURLToPath(new URL('../../../../../db/migrations/194_best_of_inclusion.sql', import.meta.url)), 'utf8');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS permis_best_of_inclusion');
    expect(mig).toContain('PRIMARY KEY (piece_id, page)');
    expect(mig).toMatch(/RÉSILIENT|resilient|42P01/i);
  });
});

describe('LOT 94 — barre de commandes SOUS l’aperçu : navigation de PAGES, bascule best-of déplacée, deux boutons d’analyse (garde par lecture de source)', () => {
  it('① la navigation de PAGES n’apparaît que si le fichier a PLUSIEURS pages, et est bornée (boutons désactivés, pas masqués)', () => {
    expect(SRC).toMatch(/nbPagesPiece > 1 && \(/);              // la ligne de navigation de pages est conditionnée au multipage
    expect(SRC).toContain('page {page} sur {nbPagesPiece}');    // indicateur de page courante ENTRE les deux boutons
    expect(SRC).toMatch(/disabled=\{page <= 1\}/);              // début de fichier → « précédent » désactivé (pas masqué)
    expect(SRC).toMatch(/disabled=\{page >= nbPagesPiece\}/);   // fin de fichier → « suivant » désactivé (pas masqué)
    expect(SRC).toContain("justifyContent: 'space-between'");   // « précédent » à l'extrême gauche, « suivant » à l'extrême droite
    expect(SRC).toContain('changerPage(-1)');
    expect(SRC).toContain('changerPage(1)');
  });
  it('① DEUX AXES DISTINCTS conservés : la nav de PAGES (barre) coexiste avec la nav de PLANS best-of (BandePlans, colonne gauche) — l’une ne remplace pas l’autre', () => {
    expect(SRC).toContain('<BandePlans');                        // l'axe best-of (« plan i sur N ») reste en colonne gauche
    expect(SRC).toContain('Page précédente du fichier');         // l'axe pages porte un libellé PROPRE, distinct de « Plan précédent »
    expect(SRC).toContain('Page suivante du fichier');
  });
  it('② la bascule best-of est DÉPLACÉE dans la barre (hors canvas → tokens de thème), plus AUCUNE surimpression sur l’aperçu', () => {
    // le toggle grain page reste piloté par pageDansBestOf et réutilise ajouter/retirer du LOT 92 (aucune 2e source de vérité).
    expect(SRC).toContain('＋ ajouter cette page au best-of');
    expect(SRC).toContain('✕ retirer du best-of');
    expect(SRC).toContain('ajouterAuBestOf(pieceId, page)');
    expect(SRC).toContain('retirerDuBestOf(planAffiche!)');
    // plus de bouton EN SURIMPRESSION : le toggle n'est plus positionné en absolu sur le canvas (fond translucide sombre supprimé).
    expect(SRC).not.toContain("background: 'rgba(20,20,20,0.62)'");
    // hors canvas = tokens de thème, jamais une couleur blanche en dur pour le texte du toggle.
    expect(SRC).not.toContain("color: '#ffffff'");
  });
  it('③ « analyse du fichier complet » = le bouton de repérage du LOT 62 déplacé + renommé (même reperer, même verrou), coût annoncé', () => {
    expect(SRC).toContain('analyse du fichier complet');
    expect(SRC).toContain('void reperer()');                     // MÊME action que le LOT 62 (aucun nouveau coût)
    expect(SRC).not.toContain('Repérer les planches de cette pièce'); // l'ancien libellé a bien disparu
    expect(SRC).toContain('de l’ordre de 2 centimes pour une vingtaine de pages'); // coût annoncé AVANT le clic
  });
  it('④ « analyse de la page » est DÉSACTIVÉE et ANNONCÉE, JAMAIS câblée sur l’analyse du fichier entier', () => {
    expect(SRC).toContain('analyse de la page');
    expect(SRC).toContain("l'analyse au grain page reste à construire");
    // on isole l'ÉLÉMENT bouton désactivé (de son attribut `disabled aria-disabled` jusqu'à son libellé) et on vérifie l'absence
    //   de handler : « analyse de la page » n'est JAMAIS câblée sur reperer (Arno paierait pour tout le fichier).
    const debut = SRC.indexOf('disabled aria-disabled="true"');
    const bloc = SRC.slice(debut, SRC.indexOf('analyse de la page', debut));
    expect(debut).toBeGreaterThan(-1);
    expect(bloc).not.toContain('onClick');
    expect(bloc).not.toContain('reperer');
  });
});

describe('LOT 91 — aperçu collant + liste bornée : l’aperçu reste en face de la ligne cliquée (garde par lecture de source)', () => {
  it('le panneau d’APERÇU est COLLANT (position sticky, ancré en haut de sa colonne)', () => {
    expect(SRC).toMatch(/flex: '2 1 300px'[\s\S]{0,80}position: 'sticky'/); // la colonne aperçu porte position sticky
    expect(SRC).toContain("alignSelf: 'flex-start'");
    expect(SRC).toContain("top: '.5rem'");
  });
  it('la liste « voir toutes les pièces » est BORNÉE (défilement interne) → ne repousse plus l’aperçu de ~70 lignes', () => {
    expect(SRC).toMatch(/maxHeight: '60vh'[\s\S]{0,40}overflowY: 'auto'/);
  });
  it('aucune pièce sélectionnée → message explicite (jamais un cadre vide muet, règle LOT 71)', () => {
    expect(SRC).toContain('Aucun aperçu ouvert');
    expect(SRC).toMatch(/pieceId === null &&/); // gardé par l'absence de sélection
  });
  it('AUCUNE animation introduite (prefers-reduced-motion) : ni transition ni scroll animé sur ces conteneurs', () => {
    // le collant/bornage repose sur position:sticky + overflow natif ; aucun scrollIntoView/behavior smooth ajouté.
    expect(SRC).not.toContain('scrollIntoView');
    expect(SRC).not.toContain("behavior: 'smooth'");
  });
});

describe('LOT 14b — montée paresseuse, indépendance du tracé', () => {
  it('à la simple montée (avant effet), affiche un état de chargement — pas de <canvas>, pas de fetch peint', () => {
    // renderToStaticMarkup n'exécute pas les effets : on voit l'état initial (chargement), donc AUCUN rendu PDF n'est déclenché au rendu.
    const html = renderToStaticMarkup(h(LiseusePieces, { dossierId: 123 }));
    expect(html).toContain('Chargement de la liseuse');
    expect(html).not.toContain('<canvas');
  });

  it('LOT 90 — couplage UNIDIRECTIONNEL : BlocTraceEmprise MONTE la liseuse (à 0 bâtiment) mais la liseuse n’en dépend JAMAIS (pas de circularité) ; le module PUR TraceEmpriseRendu reste indépendant', () => {
    // BlocTraceEmprise réutilise la liseuse lecture seule (LOT 90) — dépendance ASSUMÉE, à sens unique.
    expect(TRACE).toContain('LiseusePieces');
    // La liseuse n'IMPORTE JAMAIS le tracé (aucune circularité ; « BlocTraceEmprise » n'apparaît que dans ses commentaires).
    expect(SRC).not.toMatch(/from\s*'\.\/BlocTraceEmprise'/);
    // Le module PUR de rendu (jamais d'I/O) reste indépendant de la liseuse.
    expect(RENDU).not.toContain('LiseusePieces');
  });
});

describe('LOT 22/23 — liseuse rapide : cache LRU par pièce, une seule page, aucun re-rendu sans changement d’état', () => {
  it('le DOCUMENT pdf.js est mis en CACHE par pièce → un changement de PAGE ne re-télécharge pas', () => {
    expect(SRC).toContain('cacheRef');                            // LOT 23 : cache LRU (Map par pièce) remplace la case unique docRef
    expect(SRC).not.toContain('docRef');                          // l'ancienne case unique n'existe plus
    expect(SRC).toMatch(/cacheRef\.current\.get\(pieceId\)/);     // l'affichage lit d'abord le cache (aucun réseau si présent)
    expect(SRC).toMatch(/getDocument\(url\)/);                    // téléchargement/parse UNIQUEMENT sur miss de cache (dans obtenirDoc)
  });
  it('le MODULE pdf.js est mémorisé (chargé une seule fois, pas à chaque page)', () => {
    expect(SRC).toContain('pdfjsRef');
    expect(SRC).toMatch(/if \(!pdfjsRef\.current\)/);
  });
  it('UNE SEULE page rendue : un seul getPage + un seul render, aucune boucle sur numPages pour peindre', () => {
    expect((SRC.match(/pageObj\.render\(/g) ?? []).length).toBe(1);
    expect((SRC.match(/\.getPage\(/g) ?? []).length).toBe(1);
    expect(SRC).not.toMatch(/for\s*\([^)]*numPages/); // jamais une boucle de rendu sur toutes les pages
  });
  it('le rendu ne se recalcule qu’au changement de PIÈCE / PAGE (jamais à chaque re-render React) : deps [pieceId, page, etat]', () => {
    expect(SRC).toMatch(/void afficherPageRef\.current\(\)[\s\S]*\}, \[pieceId, page, etat\]\)/);
  });
  it('LECTURE SEULE : aucune couche texte ni annotations pdf.js (inutile, coûteuse)', () => {
    for (const inutile of ['textLayer', 'TextLayer', 'getTextContent', 'annotationLayer', 'AnnotationLayer']) {
      expect(SRC, `la liseuse ne doit pas activer « ${inutile} »`).not.toContain(inutile);
    }
  });
});

describe('LOT 23 — préchargement des voisins + cache LRU borné + retour visuel (assertions de COMPORTEMENT, pas de forme)', () => {
  it('précharge les pièces VOISINES du best-of en tâche de fond (requestIdleCallback), séquentiel, importé sans le recopier', () => {
    // La RÈGLE de sélection des voisins est la fonction PURE partagée (testée à part), IMPORTÉE — jamais réimplémentée dans le composant.
    expect(SRC).toMatch(/import\s*\{[\s\S]*voisinsAPrecharger[\s\S]*\}\s*from\s*'\.\/prechargeLiseuse'/);
    expect(SRC).not.toMatch(/function\s+voisinsAPrecharger/);
    expect(SRC).toContain('voisinsAPrecharger(bandeVisible.map'); // LOT 61 — voisins de la bande best-of VISIBLE (moins les pages retirées) + plan courant
    expect(SRC).toContain('requestIdleCallback');                // tâche de fond quand le thread est oisif
    expect(SRC).toMatch(/precharge:\s*true/);                    // les voisins sont marqués « préchargé »
    // SÉQUENTIEL : une boucle for-of qui AWAIT chaque voisin (le suivant n'est chargé qu'après le précédent).
    expect(SRC).toMatch(/for \(const id of voisins\)[\s\S]*await obtenirDoc\(id/);
  });
  it('ANNULATION propre au changement de plan/dossier et au démontage (cleanup de l’effet + purge au changement de dossier)', () => {
    expect(SRC).toMatch(/return \(\) => \{ ctrl\.annule = true; annulerIdle\(handle\); \};/); // cleanup de l'effet de préchargement
    expect(SRC).toMatch(/if \(ctrl\.annule\) return;/);                                       // la boucle s'arrête net si annulée (cleanup a posé ctrl.annule)
    expect(SRC).toMatch(/useEffect\(\(\) => \(\) => purgerCache\(\), \[dossierId, purgerCache\]\)/); // purge (destroy) au changement de DOSSIER + démontage
    // LOT 24 — le garde de cycle de vie n'est plus un flag « collant » : plus AUCUN usage de monteRef.current (remplacé par un garde de FRAÎCHEUR live).
    expect(SRC).not.toMatch(/monteRef\.current/);
  });
  it('cache LRU BORNÉ : éviction via la règle pure, destroy() des documents évincés, jamais illimité', () => {
    expect(SRC).toContain('rangerEtEvincer');                    // décision d'éviction déléguée à la fonction pure testée
    expect(SRC).toContain('MAX_DOCS_CACHE');                     // borne centralisée (pas un nombre magique dispersé)
    expect(SRC).toMatch(/for \(const k of evincees\)[\s\S]*\.doc\.destroy\(\)/); // les évincés sont bien détruits (worker libéré)
  });
  it('MESURES VISIBLES : console.info (jamais console.debug masqué), préfixe [Liseuse], octets + origine', () => {
    expect(SRC).not.toMatch(/console\.debug\(/);                 // console.debug (Verbose, masqué par défaut) banni du code
    expect(SRC).toMatch(/console\.info\(`\[Liseuse\]/);
    expect(SRC).toContain('${origine} · ${octets} o');          // chaque ligne d'affichage porte l'ORIGINE (réseau/cache/préchargé) et les OCTETS
    expect(SRC).toContain('préchargé pièce ${id} — ${o} o');    // ligne de préchargement en tâche de fond
  });
  it('RETOUR VISUEL : « Chargement… N % » alimenté par onProgress, sans faire sauter la mise en page', () => {
    expect(SRC).toContain('Chargement…');
    expect(SRC).toMatch(/onProgress:\s*\(loaded,\s*total\)/);    // pourcentage dérivé de loaded/total de pdf.js
    expect(SRC).toMatch(/setChargeReseau\(\{ pct:/);
    expect(SRC).toContain("position: 'absolute', inset: 0");     // overlay qui recouvre sans déplacer (le conteneur garde sa hauteur)
  });
});

describe('LOT 65 — ouvrir le document complet (nouvel onglet), lien signé AU CLIC', () => {
  it('le nom est un lien EXPLICITE (souligné, libellé « ouvrir … dans un nouvel onglet »), pas un survol surprise', () => {
    expect(SRC).toContain('dans un nouvel onglet');
    expect(SRC).toContain("aria-label={`Ouvrir ${nomCourant} dans un nouvel onglet`}"); // a11y : dit CE qui s'ouvre
    expect(SRC).toContain("textDecoration: 'underline'");
  });
  it('le lien est SIGNÉ AU CLIC (dans un handler), jamais pré-généré au rendu', () => {
    expect(SRC).toMatch(/const ouvrirDocumentComplet = useCallback\(async/); // fabrication au clic
    expect(SRC).toContain("action: 'url_piece'");
    expect(SRC).toContain('inline: true');       // ouverture dans le visionneur PDF
    expect(SRC).toContain("source: 'dossier'");  // pièce GED
  });
  it('cible la page COURANTE (#page, fragment non signé) et ouvre en nouvel onglet sans quitter l’admin (noopener)', () => {
    expect(SRC).toContain('#page=${page}');
    expect(SRC).toContain("window.open(");
    expect(SRC).toContain("'_blank', 'noopener,noreferrer'");
  });
  it('ÉCHEC HONNÊTE : 401 → reconnectez-vous ; échec → message, jamais un onglet vide (window.open UNIQUEMENT sur succès)', () => {
    expect(SRC).toContain('Session expirée — reconnectez-vous.');
    // window.open n'est atteint qu'après le garde `!res.ok || !body.url` (return avant) : aucun onglet ouvert sur erreur.
    const h = SRC.slice(SRC.indexOf('const ouvrirDocumentComplet'), SRC.indexOf('const ouvrirDocumentComplet') + 900);
    expect(h.indexOf('if (!res.ok || !body.url)')).toBeGreaterThan(-1);
    expect(h.indexOf('if (!res.ok || !body.url)')).toBeLessThan(h.indexOf('window.open('));
  });
});
