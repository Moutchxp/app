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
