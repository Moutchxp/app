import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { libelleAvecOrigine, MOTS_ORIGINE, trierCopiesARenommer, type CopieDrive } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT RANGER-ET-NOM-FIABLES — « LE DERNIER RENOMMAGE GAGNE, PARTOUT » ════════════════════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) :
 *   ① il range un fichier, puis le renomme dans Google Drive → le nom se met bien à jour côté mail ;
 *   ② il renomme ensuite la même pièce dans la VISIONNEUSE CÔTÉ MAIL → le nom change côté mail, mais PAS dans
 *      le Drive : le fichier garde le premier nom.
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE — ET CE N'EST PAS CELLE QU'IL SOUPÇONNAIT ═══════════════════════════════════════
 *
 * Arno supposait la règle « une copie dont le nom Drive diffère de `nom_drive` est laissée tranquille ». Cette
 * règle existe, mais elle vit dans la REPRISE (lecture Drive → application) : le tri des copies à renommer n'a
 * JAMAIS écarté une copie pour cette raison (voir le premier test ci-dessous).
 *
 * 🔴 LE BLOCAGE ÉTAIT PLUS BÊTE, ET PLUS TOTAL : le renommage écrivait avec le compte de la RELÈVE
 * (`gestion@criterimmo.fr`), qui n'est pas membre des Drive partagés où vivent les copies. Éprouvé le
 * 01/10/2026 sur les quatre copies de la pièce 26994 (Drive « Test ») :
 *
 *     gestion@criterimmo.fr     404  404  404  404
 *     a.jorel@sansvisavis.com   200  200  200  200
 *
 * Chaque `files.update(name)` partait vers un fichier que Google déclarait introuvable.
 */
const copie = (driveFileId: string, o: Partial<CopieDrive> = {}): CopieDrive => ({
  driveFileId, dossierId: 'DOS', dossierNom: 'Test', origine: 'manuel', ...o,
} as CopieDrive);

describe('🔴🔴 aucune copie du registre n’est « figée »', () => {
  /**
   * 🔴🔴 LA RÈGLE D'ARNO, MOT POUR MOT : « Elle renomme TOUTES les copies Drive du registre de cette pièce (y
   * compris celles renommées auparavant, par l'app ou par un humain). »
   */
  it('🔴🔴 toutes les copies du registre sont renommées, quel que soit leur nom actuel', () => {
    const copies = [copie('A'), copie('B'), copie('C')];
    const registre = new Set(['A', 'B', 'C']);
    const { aRenommer, refus } = trierCopiesARenommer(copies, registre);
    expect(aRenommer.map((c) => c.driveFileId)).toEqual(['A', 'B', 'C']);
    expect(refus).toEqual([]);
  });

  /** 🔴 ET LA SÉCURITÉ NE BOUGE PAS : seulement les identifiants du REGISTRE. */
  it('🔴 un fichier hors registre n’est jamais renommé', () => {
    const { aRenommer, refus } = trierCopiesARenommer([copie('A'), copie('INCONNU')], new Set(['A']));
    expect(aRenommer.map((c) => c.driveFileId)).toEqual(['A']);
    expect(refus[0].motif).toContain('n’est pas une copie que ce programme a créée');
  });

  /** 🔴🔴 ET JAMAIS SOUS « Documents clients scannés », à aucune profondeur. */
  it('🔴🔴 une copie dont le chemin touche la production est refusée', () => {
    const sousArchive = copie('A', { dossierNom: 'Documents clients scannés' });
    const { aRenommer, refus } = trierCopiesARenommer([sousArchive], new Set(['A']));
    expect(aRenommer).toEqual([]);
    expect(refus).toHaveLength(1);
  });

  /** ⚠️ UNE COPIE CITÉE DEUX FOIS N'EST RENOMMÉE QU'UNE : deux écritures identiques se compteraient deux fois. */
  it('⚠️ une pièce à plusieurs copies, dont un doublon d’identifiant', () => {
    const { aRenommer } = trierCopiesARenommer([copie('A'), copie('A'), copie('B')], new Set(['A', 'B']));
    expect(aRenommer.map((c) => c.driveFileId)).toEqual(['A', 'B']);
  });
});

/**
 * ══ 🔴🔴 LE CORRECTIF : ON RENOMME AU NOM DE LA PERSONNE QUI RENOMME ═══════════════════════════════════════
 */
describe('🔴🔴 l’identité Google, sur les trois chemins de renommage', () => {
  it('🔴 le module accepte un sujet, et retombe sur la relève à défaut', () => {
    const src = readFileSync('app/lib/gestion/renommagePieceReel.ts', 'utf8');
    expect(src).toContain('sujet?: string | null;');
    expect(src).toContain("jetonPourSubject((o.sujet ?? '').trim() || COMPTE_RELEVE, deps)");
    // ⚠️ LE COMPTE DE LA RELÈVE RESTE LE REPLI : les passes de fond tournent sans personne devant l'écran.
    expect(src).toContain("const COMPTE_RELEVE = 'gestion@criterimmo.fr';");
  });

  it('🔴 la visionneuse du mail passe l’adresse de qui renomme', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/nom/route.ts', 'utf8');
    expect(route).toContain('etatAccesDrive(request)');
    expect(route).toContain("sujet: acces.etat === 'ok' ? acces.adresse : null,");
  });

  /** 🔴 ET LA REPRISE DEPUIS GOOGLE DRIVE ALIGNE LES AUTRES COPIES AVEC LA MÊME ADRESSE. */
  it('🔴 la reprise depuis Drive aligne au nom de celui qui regarde', () => {
    const src = readFileSync('app/lib/gestion/relectureNomsDrive.ts', 'utf8');
    expect(src).toContain("sansDrive: false, sansJournal: true, sujet, origine: 'google_drive',");
  });

  /**
   * ⚠️ UN COLLABORATEUR SANS ACCÈS DRIVE NE PERD PAS SON GESTE : le nom d'usage est écrit, le refus Drive est
   * dit en clair. Annuler l'écriture locale parce que Google se tait ferait perdre un geste qu'on a fait.
   */
  it('⚠️ Google muet ne fait pas perdre le renommage local', () => {
    const src = readFileSync('app/lib/gestion/renommagePieceReel.ts', 'utf8');
    expect(src).toContain('LE NOM EST QUAND MÊME CHANGÉ CHEZ NOUS');
  });
});

/**
 * ══ 🔴 L'ORIGINE DU GESTE, DANS LE JOURNAL ═════════════════════════════════════════════════════════════════
 *
 * Arno : « Journal de chaque renommage : origine (visionneuse mail, visionneuse Drive, Google Drive, rangement),
 * ancien et nouveau nom, ids touchés. »
 */
describe('🔴 le journal dit par quel geste on a renommé', () => {
  it('🔴 les quatre origines qu’Arno nomme', () => {
    expect(Object.keys(MOTS_ORIGINE).sort())
      .toEqual(['google_drive', 'rangement', 'visionneuse_drive', 'visionneuse_mail']);
    expect(MOTS_ORIGINE.visionneuse_mail).toBe('visionneuse du mail');
    expect(MOTS_ORIGINE.google_drive).toBe('Google Drive');
  });

  it('🔴 l’origine entre dans le libellé, à côté de l’auteur', () => {
    expect(libelleAvecOrigine('a.jorel@sansvisavis.com', 'visionneuse_mail'))
      .toBe('a.jorel@sansvisavis.com (visionneuse du mail)');
    expect(libelleAvecOrigine('Google Drive', 'google_drive')).toBe('Google Drive (Google Drive)');
  });

  /** ⚠️ SANS ORIGINE, LE LIBELLÉ NE CHANGE PAS : les lignes d'avant ce lot se relisent à l'identique. */
  it('⚠️ sans origine, rien ne change', () => {
    expect(libelleAvecOrigine('a.jorel@sansvisavis.com')).toBe('a.jorel@sansvisavis.com');
  });

  /**
   * 🔴🔴 ET LE SERVEUR NE CROIT PAS LE NAVIGATEUR SUR PAROLE. Une origine inventée retombe sur la visionneuse du
   * mail : un journal se relit, et ce qu'on y lit doit vouloir dire quelque chose.
   */
  it('🔴🔴 une origine inconnue n’entre jamais au journal', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/nom/route.ts', 'utf8');
    expect(route).toContain("connues.find((x) => x === brut) ?? 'visionneuse_mail'");
  });
});

/**
 * ══ 🔴🔴 « DÉJÀ À CE NOM » N'EST PAS UN REFUS — DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE ═══════════════════════════
 *
 * 01/10/2026, étape « renommage dans Google Drive » du scénario d'Arno : le nom était bien repris par la pièce,
 * mais les TROIS autres copies gardaient l'ancien. La reprise écrit le nom d'usage, PUIS appelle `renommerPiece`
 * pour aligner les copies — ce second appel réécrivait le MÊME nom, l'écriture (arbitre depuis le lot précédent)
 * ne touchait aucune ligne et rendait `false`, lu comme « la migration 286 manque ». On abandonnait avant
 * d'avoir renommé quoi que ce soit.
 *
 * 🔴 UN BOOLÉEN NE POUVAIT PAS DIRE LA DIFFÉRENCE entre « je n'ai pas pu » et « c'était déjà fait ».
 */
describe('🔴🔴 l’écriture du nom d’usage rend TROIS réponses', () => {
  const repo = readFileSync('app/lib/gestion/nomUsageRepo.ts', 'utf8');

  it('🔴 « écrit », « inchangé », « indisponible »', () => {
    expect(repo).toContain("export type IssueNomUsage = 'ecrit' | 'inchange' | 'indisponible';");
    expect(repo).toContain("return (rowCount ?? 0) > 0 ? 'ecrit' : 'inchange';");
    expect(repo).toContain("if (!(await nomUsageDisponible())) return 'indisponible';");
  });

  /** 🔴 SEULE L'ABSENCE DE COLONNE ARRÊTE LE RENOMMAGE : « déjà bon » doit continuer vers l'alignement. */
  it('🔴🔴 `renommerPiece` n’abandonne que si la colonne manque', () => {
    const src = readFileSync('app/lib/gestion/renommagePieceReel.ts', 'utf8');
    expect(src).toContain("if (await ecrireNomUsage(o.pieceId, nom) === 'indisponible') {");
    expect(src).not.toContain('if (!(await ecrireNomUsage(o.pieceId, nom)))');
  });

  /**
   * 🔴 ET LA REPRISE NE JOURNALISE QUE LE GESTE NEUF. Observé en vrai : deux requêtes parties presque ensemble
   * avaient écrit DEUX lignes identiques pour un seul renommage.
   */
  it('🔴 un nom déjà adopté aligne les copies, mais n’écrit pas une seconde ligne de journal', () => {
    const src = readFileSync('app/lib/gestion/relectureNomsDrive.ts', 'utf8');
    expect(src).toContain("const neuf = ecriture === 'ecrit';");
    expect(src).toContain('if (neuf) {');
  });
});
