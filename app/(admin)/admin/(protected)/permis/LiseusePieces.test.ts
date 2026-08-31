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

describe('LOT 14b — montée paresseuse, indépendance du tracé', () => {
  it('à la simple montée (avant effet), affiche un état de chargement — pas de <canvas>, pas de fetch peint', () => {
    // renderToStaticMarkup n'exécute pas les effets : on voit l'état initial (chargement), donc AUCUN rendu PDF n'est déclenché au rendu.
    const html = renderToStaticMarkup(h(LiseusePieces, { dossierId: 123 }));
    expect(html).toContain('Chargement de la liseuse');
    expect(html).not.toContain('<canvas');
  });

  it('BlocTraceEmprise.tsx et TraceEmpriseRendu.tsx n’ont AUCUNE dépendance sur la liseuse (tracé indépendant)', () => {
    expect(TRACE).not.toContain('LiseusePieces');
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
    expect(SRC).toContain('voisinsAPrecharger(bande.map');       // dérive les voisins de la bande best-of + plan courant
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
