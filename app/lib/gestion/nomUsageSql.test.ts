import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { nomsCherchablesAvec, sqlNomAffiche, sqlNomOrigine, sqlNomsCherchables } from './nomUsageSql';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE REPLI, ET CE QU'IL NE NOMME PAS ══════════════════════════════════════
 *
 * `nom_fichier` est lu à soixante-cinq endroits du module. Ce fragment est le seul à savoir choisir entre le nom
 * d'usage et le nom d'origine — c'est pour cela qu'il existe, et c'est ce que ce fichier tient.
 */
let migration286 = false;
vi.mock('./schema', () => ({ nomUsageDisponible: async () => migration286 }));

describe('🔴 le repli « nom d’usage, sinon nom d’origine »', () => {
  it('🔴 AVEC la migration 286 : la colonne est nommée, et un nom blanc ne l’emporte pas', async () => {
    migration286 = true;
    const sql = await sqlNomAffiche('p');
    expect(sql).toContain('p.nom_usage');
    expect(sql).toContain('p.nom_fichier');
    // ⚠️ `nullif(btrim(…), '')` : une chaîne blanche en base ne doit pas faire disparaître le nom à l'écran.
    expect(sql).toContain("nullif(btrim(p.nom_usage), '')");
  });

  /**
   * 🔴🔴 SANS LA MIGRATION, LA COLONNE N'EST NOMMÉE NULLE PART. La nommer ferait échouer la lecture des pièces
   * ENTIÈRE — donc l'affichage de tout le courrier, pas seulement le nom. Règle du module depuis le lot 4a.
   */
  it('🔴🔴 SANS la migration 286 : `nom_usage` n’apparaît pas, et le SQL est celui d’avant', async () => {
    migration286 = false;
    expect(await sqlNomAffiche('p')).toBe('p.nom_fichier');
    expect(await sqlNomsCherchables('p')).toBe('p.nom_fichier');
  });

  it('le nom d’ORIGINE ne dépend d’aucune sonde : la colonne existe depuis toujours', () => {
    expect(sqlNomOrigine('p')).toBe('p.nom_fichier');
    expect(sqlNomOrigine('gestion_piece')).toBe('gestion_piece.nom_fichier');
  });

  it('l’alias est respecté — deux tables de pièces dans une même requête ne se mélangent pas', async () => {
    migration286 = true;
    expect(await sqlNomAffiche('pn')).toContain('pn.nom_usage');
    expect(await sqlNomAffiche('pn')).not.toContain('p.nom_usage');
  });
});

/**
 * 🔴 LA RECHERCHE TROUVE PAR LES DEUX NOMS. On cherche sous le nom qu'on a donné (« Quittance juillet »), mais
 * aussi sous celui du correspondant (« scan_0042 ») quand c'est ce dont on se souvient — ou ce qu'on lit dans le
 * mail, qui n'a pas changé. N'en garder qu'un rendrait la pièce introuvable une fois sur deux.
 */
describe('🔴 la recherche porte sur les DEUX noms', () => {
  it('avec la migration : les deux colonnes, concaténées', () => {
    const sql = nomsCherchablesAvec(true, 'pn');
    expect(sql).toContain('pn.nom_fichier');
    expect(sql).toContain('pn.nom_usage');
  });

  it('sans elle : le nom d’origine seul, comme avant ce lot', () => {
    expect(nomsCherchablesAvec(false, 'pn')).toBe('pn.nom_fichier');
  });

  /**
   * ⚠️ `concat_ws` ET PAS `||` : un `||` avec une colonne NULL rend NULL, et la pièce deviendrait introuvable
   * PAR SON NOM D'ORIGINE dès qu'elle n'a pas de nom d'usage — c'est-à-dire dans le cas le plus courant.
   */
  it('⚠️ un nom d’usage NULL ne doit pas effacer le nom d’origine', () => {
    expect(nomsCherchablesAvec(true)).toContain('concat_ws');
    expect(nomsCherchablesAvec(true)).not.toMatch(/nom_fichier\s*\|\|/);
  });
});

/**
 * ══ 🔴🔴 LE NOM D'USAGE EST SERVI PARTOUT OÙ ARNO L'A DEMANDÉ ═══════════════════════════════════════════════
 *
 * « Le nom d'usage est affiché PARTOUT : ligne du message, carte “N pièces jointes”, récap de la conversation,
 * visionneuse, pièces à ranger, fiche bien / vie du bien, recherche. »
 *
 * ⚠️ ON ÉPROUVE QUE CHAQUE REPO PASSE PAR LE FRAGMENT, pas la forme de son SQL : c'est le passage obligé qui
 * garantit qu'une pièce renommée ne reparaît pas sous son ancien nom quelque part. Un oubli ici ne se verrait
 * qu'à l'écran, sur un seul des dix endroits, des semaines plus tard.
 */
describe('🔴 chaque endroit qui affiche un nom de pièce passe par le fragment', () => {
  const ENDROITS: [string, string][] = [
    ['la conversation, la carte et le récap', 'app/lib/gestion/carteRepo.ts'],
    ['la carte « N pièces jointes » de la liste', 'app/lib/gestion/boiteRepo.ts'],
    ['les pièces à ranger', 'app/lib/gestion/triPiecesRepo.ts'],
    ['la vie du bien', 'app/lib/gestion/historiqueRepo.ts'],
    ['la fiche bien', 'app/lib/gestion/rattachementRepo.ts'],
    ['l’archive « Tout télécharger »', 'app/lib/gestion/piecesRepo.ts'],
    ['le transfert et la réponse', 'app/lib/gestion/brouillonPieceRepoBase.ts'],
    ['le lecteur d’octets', 'app/lib/gestion/octetsPieceCablage.ts'],
  ];

  for (const [quoi, fichier] of ENDROITS) {
    it(`🔴 ${quoi}`, () => {
      expect(readFileSync(fichier, 'utf8')).toContain('sqlNomAffiche');
    });
  }

  it('🔴 la recherche passe par le fragment des DEUX noms', () => {
    expect(readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8')).toContain('nomsCherchablesAvec');
  });

  /**
   * 🔴🔴 ET LE DERNIER RECOURS GMAIL GARDE LE NOM D'ORIGINE. Gmail ne permet pas de renommer une pièce jointe :
   * là-bas, elle porte TOUJOURS le nom sous lequel elle est arrivée. Y chercher le nom d'usage ne trouverait
   * rien, et la pièce serait déclarée introuvable alors qu'elle est là.
   */
  it('🔴🔴 le dernier recours Gmail cherche par le nom d’ORIGINE', () => {
    const src = readFileSync('app/lib/gestion/octetsPiece.ts', 'utf8');
    expect(src).toContain('deps.gmail(p.messageIdRfc, p.nomOrigine ?? p.nomFichier)');
    expect(readFileSync('app/lib/gestion/octetsPieceCablage.ts', 'utf8')).toContain('sqlNomOrigine');
  });
});
