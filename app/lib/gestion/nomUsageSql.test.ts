import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
    /* ⚠️ LE FRAGMENT S'ARRÊTE AVANT LA PARENTHÈSE FERMANTE, DEPUIS LE LOT PHOTOS-ET-INTERNE-INVERSE : l'appel
       porte maintenant un 3e argument (le repère d'une pièce sans nom). Ce qui est tenu ici est le NOM CHERCHÉ,
       et lui seul — figer la fin de l'appel aurait fait rougir ce garde à chaque argument ajouté, pour une
       raison qui n'a rien à voir avec ce qu'il surveille. */
    expect(src).toContain('deps.gmail(p.messageIdRfc, p.nomOrigine ?? p.nomFichier');
    expect(readFileSync('app/lib/gestion/octetsPieceCablage.ts', 'utf8')).toContain('sqlNomOrigine');
  });

  /**
   * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA LISTE CI-DESSUS NE SUFFISAIT PAS ══════════════════════════════
   *
   * ELLE ÉNUMÈRE CE QU'ON CONNAÎT, et c'est précisément sa limite : un repo AJOUTÉ demain lirait `nom_fichier`
   * en clair sans faire rougir quoi que ce soit. C'est exactement ce qui s'est produit — `classementBien.ts`
   * (la liste « Classer chaque pièce jointe séparément ») affichait encore le nom d'origine, et rien ne le
   * disait. Arno l'a vu à l'écran ; aucun test ne l'avait vu.
   *
   * 🔴 D'OÙ UN BALAYAGE, ET NON UNE LISTE : tout fichier du module qui lit `nom_fichier` DE `gestion_piece`
   * passe par le fragment, ou figure dans le tableau d'exceptions ci-dessous AVEC SA RAISON. Ajouter une ligne
   * à ce tableau est un geste conscient ; oublier un repo ne l'est pas.
   *
   * ⚠️ ON NE REGARDE QUE LES LECTURES. Un `INSERT … (nom_fichier)` écrit le nom REÇU : c'est sa définition même,
   * et il ne s'affiche nulle part.
   */
  const EXCEPTIONS: Record<string, string> = {
    // Le HTML d'un message référence ses images par le nom sous lequel elles sont ARRIVÉES (`cid:`). Chercher
    // le nom d'usage n'y résoudrait plus rien, et les images intégrées disparaîtraient du message.
    'carteRepo.ts': 'résolution des « cid: » par le nom d’origine',
    // « ._truc » est le jumeau technique que macOS pose À CÔTÉ du fichier : il se reconnaît au nom d'ARRIVÉE.
    // Un nom d'usage peut commencer par « ._ » sans que la pièce soit un jumeau, et inversement.
    'boiteRepo.ts': 'filtre des jumeaux macOS « ._ », sur le nom d’arrivée',
    'triPiecesRepo.ts': 'filtre des jumeaux macOS « ._ », sur le nom d’arrivée',
    // « image001.png », « ._x » : une signature et un jumeau se reconnaissent au nom FABRIQUÉ par le logiciel
    // d'en face. Renommer une pièce ne doit pas la faire (re)devenir une signature, ni cesser d'en être une.
    'lisibilite.ts': 'reconnaissance des signatures et des jumeaux, sur le nom d’arrivée',
    'piecesRepo.ts': 'filtre des jumeaux macOS « ._ », sur le nom d’arrivée',
    // La capture ÉCRIT le nom reçu ; elle ne l'affiche jamais.
    'captureRepo.ts': 'écriture du nom reçu à la capture',
    // Le vidage compare des empreintes et des tailles ; le nom n'y sert qu'au journal du script.
    'vidageRepo.ts': 'journal d’un script de maintenance, hors écran',
    // Plan de classement : script hors ligne, le nom nourrit une règle de reconnaissance — pas un affichage.
    'classementRepo.ts': 'reconnaissance de rubrique dans un script de plan, hors écran',
    // Les pièces d'un BROUILLON ont leur propre table et leur propre nom, recopié du nom d'usage à l'insertion.
    'brouillonPieceRepoBase.ts': 'table des pièces de brouillon, nom recopié à l’insertion',
    'fileEnvoiRepo.ts': 'table des pièces de brouillon, nom recopié à l’insertion',
    // 🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — MÊME TABLE, MÊME RAISON : il lit la ligne du BROUILLON pour
    //    en tirer les octets d'une vignette. Le nom qu'il rend sert à fabriquer l'image (le générateur regarde
    //    l'extension), jamais à être affiché — l'écran, lui, tient déjà le nom que la liste lui a donné.
    'brouillonPieceOctets.ts': 'table des pièces de brouillon, nom recopié à l’insertion',
    // Le fragment lui-même, et ses alentours : c'est ici qu'on a le droit de nommer la colonne.
    'nomUsageSql.ts': 'le fragment lui-même',
    'nomUsageRepo.ts': 'le registre des noms, qui passe déjà par le fragment',
  };

  it('🔴🔴 AUCUN repo du module ne lit `nom_fichier` en clair sans raison écrite', () => {
    const dossier = 'app/lib/gestion';
    const coupables: string[] = [];
    for (const nom of readdirSync(dossier)) {
      if (!nom.endsWith('.ts') || nom.endsWith('.test.ts') || nom.endsWith('.itest.ts')) continue;
      const src = readFileSync(`${dossier}/${nom}`, 'utf8');
      // On regarde le CODE, pas la prose : les encadrés de ce module parlent beaucoup de `nom_fichier`.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
      if (!/\bnom_fichier\b/.test(code)) continue;
      if (EXCEPTIONS[nom] !== undefined) continue;
      // Nommer la colonne est permis quand le fichier passe AUSSI par le fragment : c'est le cas d'un SELECT
      // qui rend `… AS nom_fichier`, et d'un INSERT qui écrit le nom reçu juste à côté.
      if (code.includes('sqlNomAffiche') || code.includes('nomsCherchablesAvec')) continue;
      coupables.push(nom);
    }
    expect(coupables).toEqual([]);
  });
});
