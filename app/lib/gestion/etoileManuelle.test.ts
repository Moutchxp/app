import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES, POINT 1 — L'ÉTOILE EST UN CHOIX, JAMAIS UNE CONSÉQUENCE ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « l'étoile est un choix MANUEL, jamais posé par une automatisation. »
 *
 * ═══ CE QUE LE DIAGNOSTIC DU 03/10 A TROUVÉ ═════════════════════════════════════════════════════════════════════
 *
 * L'étoile rouge de l'échange 36671 vient d'un CLIC, et le journal le nomme :
 *
 *     gestion_journal 43268 · message 57464 · « étoile ajoutée dans Gmail »
 *                           · a.jorel@sansvisavis.com · 03/10/2026 11:01:20.116
 *     gestion_message.etoile_le = 11:01:20.122  (le miroir, 6 ms plus tard)
 *
 * Aucune automatisation n'était en cause : la relève journalise sous « relève automatique », et aucune de ses
 * lignes ne touche l'étoile. Le clic venait d'un script de mesure du lot précédent qui cherchait un bouton par
 * `aria-label` commençant par « Ajouter » — et « Ajouter une étoile » passe avant « Ajouter … au Drive ».
 *
 * ═══ 🔴 CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EST STATIQUE ══════════════════════════════════════════════════
 *
 * Le code était déjà juste. Un test de comportement n'aurait donc rien prouvé de neuf ; ce qu'il faut tenir, c'est
 * qu'AUCUN CHEMIN NOUVEAU ne vienne poser `STARRED` demain, dans une passe, un envoi, un transfert ou un héritage
 * de conversation. Cela ne se vérifie pas en appelant une fonction : cela se vérifie en lisant TOUT le module.
 *
 * ⚠️ ON LIT LE CODE, PAS LA PROSE : les encadrés nomment justement ce qu'ils s'interdisent, et les compter ferait
 * échouer le test sur sa propre documentation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const RACINE = 'app/lib/gestion';

/** Le source débarrassé de ses commentaires — la même préparation que les autres gardes du dépôt. */
function codeDe(chemin: string): string {
  return readFileSync(chemin, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
    .join('\n');
}

/** Tous les fichiers du module gestion, récursivement, hors épreuves. */
function sourcesDuModule(): string[] {
  const out: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) { parcourir(chemin); continue; }
      if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
      if (/\.(test|itest)\.tsx?$/.test(e.name)) continue;
      out.push(chemin);
    }
  };
  parcourir(RACINE);
  return out;
}

describe('🔴🔴 personne ne pose une étoile tout seul', () => {
  /**
   * 🔴🔴 LE GARDE CENTRAL. `STARRED` ne s'ÉCRIT que dans `gmailAction.basculerEtoile`, et cette fonction n'est
   * atteinte que par un clic (la route `/messages/[id]/gmail` et la route `/fils/[id]/etoile`). Partout ailleurs,
   * le mot ne peut apparaître que dans une LECTURE (`libelles.includes`) ou dans une constante.
   */
  it('🔴🔴 un seul endroit du module ÉCRIT le libellé STARRED', () => {
    const ecrivains = sourcesDuModule().filter((f) => {
      const code = codeDe(f);
      // Écrire, c'est le passer à `modifier` : « ajouter » ou « retirer ».
      return /\b(ajouter|retirer)\s*:\s*\[\s*'STARRED'/.test(code);
    });
    expect(ecrivains).toEqual([join(RACINE, 'gmailAction.ts')]);
  });

  /** 🔴 ET CE SEUL ÉCRIVAIN EST LA BASCULE, c'est-à-dire le geste — pas une passe, pas une règle, pas un envoi. */
  it('🔴 l’écriture vit dans `basculerEtoile`, et nulle part ailleurs du fichier', () => {
    const code = codeDe(join(RACINE, 'gmailAction.ts'));
    const i = code.indexOf('export async function basculerEtoile');
    expect(i).toBeGreaterThan(0);
    /* ⚠️ AVANT LA BASCULE, LE MOT N'APPARAÎT QU'EN LECTURE (`libelles.includes('STARRED')`, qui dit à l'écran si
       l'étoile est là). Ce qu'on interdit, c'est l'ÉCRITURE — et c'est elle qu'on cherche. */
    const avant = code.slice(0, i);
    expect(avant).not.toMatch(/\b(ajouter|retirer)\s*:\s*\[\s*'STARRED'/);
    // Une seule paire pose/retire dans toute la fonction : c'est une bascule, pas deux gestes.
    const dedans = code.slice(i);
    expect((dedans.match(/\{\s*retirer:\s*\['STARRED'\]\s*\}\s*:\s*\{\s*ajouter:\s*\['STARRED'\]\s*\}/g) ?? []))
      .toHaveLength(1);
  });

  /**
   * 🔴🔴 LA RELÈVE NE FAIT QUE REGARDER. Elle lit ce que Gmail tient pour étoilé et fait coïncider notre colonne ;
   * elle n'écrit RIEN chez Google. Une passe qui poserait une étoile serait exactement l'automatisation qu'Arno
   * refuse — et elle passerait inaperçue, puisque le miroir la recopierait aussitôt.
   */
  it('🔴🔴 la relève lit les étoiles, elle n’en pose aucune', () => {
    const code = codeDe(join(RACINE, 'releveReelle.ts'));
    expect(code).toContain('listerEtoilesGmail');
    expect(code).not.toContain('STARRED');
    expect(code).not.toContain('modifierLibelles');
  });

  /**
   * 🔴 LE MIROIR N'EST QU'UN MIROIR. `etoileGmailRepo` écrit `etoile_le` — notre colonne — et ne parle jamais à
   * Google. C'est ce qui garantit qu'une étoile chez nous vient toujours d'une étoile là-bas.
   */
  it('🔴 le miroir n’appelle jamais Google', () => {
    const code = codeDe(join(RACINE, 'etoileGmailRepo.ts'));
    expect(code).toContain('etoile_le');
    for (const mot of ['fetch(', 'googleapis', 'modifierLibelles', 'STARRED']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /**
   * 🔴🔴 NI L'ENVOI, NI LE TRANSFERT, NI LA CAPTURE N'HÉRITENT D'UNE ÉTOILE. C'est la piste qu'Arno nommait
   * (« héritage de conversation ») : un message neuf d'un échange étoilé ne doit pas naître étoilé.
   */
  it('🔴🔴 aucun chemin d’écriture de message ne touche `etoile_le`', () => {
    for (const f of ['captureRepo.ts', 'envoiRepo.ts', 'releveReelle.ts', 'capture.ts']) {
      const chemin = join(RACINE, f);
      let code: string;
      try { code = codeDe(chemin); } catch { continue; }   // le fichier peut ne pas exister : ce n'est pas un échec
      expect(code, f).not.toContain('etoile_le');
    }
  });

  /**
   * ⚠️ ET L'INSERTION D'UN MESSAGE NE NOMME PAS LA COLONNE : elle naît donc à `NULL`, c'est-à-dire sans étoile.
   * Un défaut `now()` en base ferait étoiler tout le courrier sans qu'une ligne de code ne le dise.
   */
  it('⚠️ la colonne `etoile_le` n’a aucune valeur par défaut dans les migrations', () => {
    const dossier = 'db/migrations';
    const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.sql'));
    const porteuses = fichiers.filter((f) => readFileSync(join(dossier, f), 'utf8').includes('etoile_le'));
    expect(porteuses.length).toBeGreaterThan(0);
    for (const f of porteuses) {
      const sql = readFileSync(join(dossier, f), 'utf8');
      expect(sql, f).not.toMatch(/etoile_le[^;]*DEFAULT/i);
    }
  });
});
