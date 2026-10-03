import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — LE NETTOYAGE DES ENTRÉES FANTÔMES, ET CE QU'IL NE SAIT PAS FAIRE ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « nettoie les entrées fantômes existantes (simulation, nombre et exemples, puis
 * application). Une entrée fantôme = fileId dont les parents réels Drive ne correspondent plus, ou fichier à la
 * corbeille ou absent. »
 *
 * 🔴 CE FICHIER NE DOUBLE PAS LE SCRIPT, IL GARDE SES PROPRIÉTÉS — celles qu'un test de comportement ne verrait
 * pas, et qui sont les seules qui comptent pour un outil qui touche 26 555 lignes de registre :
 *   ① il ne SAIT PAS écrire dans le Drive (aucun verbe, aucun module d'écriture importé) ;
 *   ② il n'écrit RIEN sans `--appliquer` ;
 *   ③ il ne SUPPRIME JAMAIS une ligne de base — il corrige un parent, ou il DATE une disparition ;
 *   ④ il ne conclut « disparu » que sur les DEUX codes que le module PUR nomme (404, 403) — jamais sur un 503.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CHEMIN = 'app/scripts/nettoyer-emplacements-fantomes.ts';
const code = readFileSync(CHEMIN, 'utf8');

describe('🔒🔒 le nettoyage ne sait pas écrire dans le Drive', () => {
  it('🔒🔒 aucun verbe d’écriture', () => {
    for (const mot of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
      'files.copy', 'trashed: true', 'addParents', 'removeParents', 'emptyTrash']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  it('🔒 aucun module d’écriture Drive importé', () => {
    for (const mod of ['driveMouvement', 'driveCorbeilleReel', 'driveEcriture', 'driveCreation',
      'renommageDrive', 'copiePiecesReel']) {
      expect(code, mod).not.toContain(`/${mod}'`);
    }
  });

  /**
   * 🔒🔒 DEUX PORTES, ET LES DEUX NE SAVENT QUE LIRE : le `files.get` du verdict, et celui qui va chercher le NOM
   * du dossier réel. Aucune ne pose d'option de méthode, donc toutes deux sont des `GET`. Ce test compte les
   * portes plutôt que d'énumérer les chemins — une troisième le ferait rougir.
   */
  it('🔒🔒 deux `fetch`, et pas un de plus', () => {
    expect(code.match(/fetch\(/g) ?? []).toHaveLength(2);
    expect(code).toContain('{ headers: h }');
  });

  /** 🔒 LES CHAMPS DEMANDÉS NE PORTENT AUCUN CONTENU : un identifiant, un nom, un parent, un état. */
  it('🔒 les champs demandés sont des métadonnées, et rien d’autre', () => {
    expect(code).toContain("const CHAMPS = 'id,name,parents,trashed'");
    expect(code).not.toContain('alt=media');
  });
});

describe('🔴🔴 rien n’est écrit sans `--appliquer`', () => {
  it('🔴🔴 le mode par défaut est la SIMULATION', () => {
    expect(code).toContain("const APPLIQUER = process.argv.includes('--appliquer')");
    /* 🔴 LES TROIS ÉCRITURES SONT SOUS LA MÊME GARDE : une seule oubliée, et le script écrirait en simulant. */
    expect(code).toContain('if (APPLIQUER) {\n        await marquerCopieDisparue(');
    expect(code).toContain('if (APPLIQUER) {\n      const n = await deplacerCopieAuRegistre(');
  });

  /**
   * 🔴🔴 AUCUNE SUPPRESSION DE LIGNE, JAMAIS. Une ligne de `gestion_piece_drive` dit un fait daté (« nous avons
   * déposé une copie ici, ce jour-là ») et ce fait reste vrai après la disparition du fichier — c'est même le seul
   * moment où l'on a envie de le relire. On CORRIGE un parent, ou l'on DATE une disparition.
   */
  it('🔴🔴 il ne sait pas supprimer une ligne', () => {
    for (const mot of ['DELETE FROM', 'TRUNCATE', 'DROP ']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /**
   * 🔴 LE VERDICT « DISPARU » VIENT DU MODULE PUR, pas d'un test de code écrit ici. `estDisparition` ne rend `true`
   * que sur 404 et 403 : marquer sur un 429 ou un 503 effacerait du registre une copie parfaitement vivante, et
   * l'on ne la retrouverait plus jamais.
   */
  it('🔴 « disparu » se décide par `estDisparition`, pas par un seuil écrit ici', () => {
    expect(code).toContain("import { estDisparition, motifDisparition } from '../lib/gestion/copieDisparue'");
    expect(code).toContain('if (estDisparition(r.status))');
    expect(code).not.toContain('r.status === 404');
  });

  /**
   * 🔴 LA PRÉSÉLECTION EST EN BASE, LE VERDICT CHEZ GOOGLE. L'index est un REFLET : corriger la base à partir
   * d'un reflet serait corriger une base à partir d'une copie. C'est `files.get` qui donne le parent qu'on écrit.
   */
  it('🔴 le parent écrit vient de Google, pas de l’index', () => {
    expect(code).toContain('const parentReel = parents[0];');
    expect(code).toContain('deplacerCopieAuRegistre(c.driveFileId, v.parentReel, v.parentNom)');
  });

  /** ⚠️ ET LES LIGNES DÉJÀ MARQUÉES « DISPARUES » SONT HORS SUJET : on ne défait pas un constat daté. */
  it('⚠️ les lignes déjà disparues ne sont pas reprises', () => {
    expect(code).toContain('WHERE d.disparu_le IS NULL');
  });
});
