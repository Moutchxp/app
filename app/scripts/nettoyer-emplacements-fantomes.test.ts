import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LA LIGNE DE COMMANDE DU NETTOYAGE — SA PORTE, ET SON MODE ═══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ RECADRÉ PAR LE LOT FANTOMES-APRES-INDEXATION, ET IL FAUT DIRE POURQUOI. Ce fichier éprouvait la RÈGLE de
 * détection, qui vivait dans le script. Elle a déménagé dans `lib/gestion/fantomesEmplacements`, parce que le
 * BALAYAGE l'appelle désormais après chaque passe `changes.list` (décision d'Arno) : deux écritures de la même
 * détection auraient fini par ne plus corriger la même chose — et c'est la ligne de commande, celle qu'on lance
 * rarement, qui aurait pris du retard.
 *
 * 🔴 LA RÈGLE EST DONC ÉPROUVÉE LÀ OÙ ELLE VIT MAINTENANT, et bien mieux qu'ici : `fantomesEmplacements.test.ts`
 * monte les QUATRE verdicts avec des doublures, sans réseau ni Drive — ce qui était impossible tant que la règle
 * était dans un script. Il reste à ce fichier ce qui appartient à la ligne de commande : sa PORTE vers Google, et
 * le fait qu'elle n'écrive rien sans qu'on le demande.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CHEMIN = 'app/scripts/nettoyer-emplacements-fantomes.ts';
const code = readFileSync(CHEMIN, 'utf8');

describe('🔒🔒 la ligne de commande ne sait pas écrire dans le Drive', () => {
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
   * 🔒🔒 UNE SEULE PORTE, ET ELLE NE SAIT QUE LIRE. Les deux usages (les métadonnées d'un fichier, le nom d'un
   * dossier) passent par la même fonction `lire`, qui ne pose aucune option de méthode — donc un `GET`. Ce test
   * compte les portes plutôt que d'énumérer les chemins : une seconde le ferait rougir.
   */
  it('🔒🔒 un seul `fetch`, et il ne sait que lire', () => {
    expect(code.match(/fetch\(/g) ?? []).toHaveLength(1);
    expect(code).toContain('const r = await fetch(`${API}/${chemin}`, { headers: h });');
  });

  /** 🔒 LES CHAMPS DEMANDÉS NE PORTENT AUCUN CONTENU : un identifiant, un nom, un parent, un état. */
  it('🔒 les champs demandés sont des métadonnées, et rien d’autre', () => {
    expect(code).toContain("const CHAMPS = 'id,name,parents,trashed'");
    expect(code).not.toContain('alt=media');
  });

  /**
   * 🔴 LE CODE HTTP REMONTE TEL QUEL, et c'est ce qui permet au module de ne conclure « disparu » que sur 404 et
   * 403. Transformer le refus en message aurait obligé à retrouver le code dans une chaîne.
   */
  it('🔴 le refus rend son code, pas un message', () => {
    expect(code).toContain('return { ok: false, statut: r.status };');
  });
});

describe('🔴🔴 rien n’est écrit sans `--appliquer`', () => {
  it('🔴🔴 le mode par défaut est la SIMULATION', () => {
    expect(code).toContain("const APPLIQUER = process.argv.includes('--appliquer')");
    // 🔴 LE DRAPEAU EST PASSÉ AU MODULE, qui porte la garde — une seule garde, au lieu de quatre recopiées.
    expect(code).toContain('appliquer: APPLIQUER,');
    expect(code).toContain("else console.log('Aucune écriture. Relancer avec --appliquer pour corriger.');");
  });

  /** 🔴 LE JOURNAL N'EST ÉCRIT QUE QUAND ON APPLIQUE : une simulation ne laisse aucune trace en base. */
  it('🔴 le journal suit le mode', () => {
    expect(code).toContain('if (APPLIQUER) await journaliserFantomes(bilan, true);');
  });

  /**
   * 🔴🔴 LA RÈGLE N'EST PLUS ICI, et c'est la propriété que ce fichier garde désormais : si quelqu'un la
   * réécrivait dans le script, les deux détections divergeraient. On l'interdit en négatif.
   */
  it('🔴🔴 la détection n’est pas réécrite ici', () => {
    expect(code).toContain("from '../lib/gestion/fantomesEmplacements'");
    for (const mot of ['gestion_piece_drive d', 'LEFT JOIN gestion_drive_empreinte', 'estDisparition']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /** ⚠️ ET AUCUNE SUPPRESSION DE LIGNE, JAMAIS — ni ici, ni dans le module. */
  it('⚠️ il ne sait pas supprimer une ligne', () => {
    for (const mot of ['DELETE FROM', 'TRUNCATE', 'DROP ']) expect(code, mot).not.toContain(mot);
  });
});
