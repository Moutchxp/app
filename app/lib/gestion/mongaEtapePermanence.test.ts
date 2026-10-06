import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 2 — « CE QU'UN MAIL MONGA APPORTE EST PERMANENT » ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (06/10/2026), mot pour mot : « le devenir du mail (boîte, corbeille, inerte, supprimé, réintégré)
 * ne change JAMAIS l'étape enregistrée. Quand une référence est reliée plus tard à un événement, toutes ses
 * étapes déjà enregistrées y apparaissent. […] Aucun doublon si un même mail est relu. »
 *
 * 🔴 POURQUOI CE FICHIER EXISTE À PART. Cette règle ne tient pas dans du code TypeScript : elle tient dans DEUX
 * clauses SQL — `ON DELETE SET NULL` et un index unique. Une épreuve qui n'irait pas les lire laisserait un
 * `CASCADE` se glisser au prochain lot, et l'on ne s'en apercevrait que le jour où Gmail efface une corbeille.
 *
 * 🔴 CE QUI EST EN JEU, MESURÉ : **25 des 98 mails Monga gabarités étaient DÉJÀ à la corbeille** le 06/10/2026,
 * et Gmail efface au bout de 30 jours. Un quart de l'historique d'intervention s'effacerait tout seul.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SQL = readFileSync('db/migrations/313_gestion_monga_etape.sql', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');
const CLASSEMENT = readFileSync('app/lib/gestion/mongaClassement.ts', 'utf8');
const REPRISE = readFileSync('app/scripts/monga-etapes-reprise.ts', 'utf8');

describe('① l’étape survit au mail — la clause qui porte toute la règle', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DU POINT 2. `gestion_monga_mail` emploie `ON DELETE CASCADE` : le mail parti, la
   * ligne part. Ici le lien se dénoue et l'ÉTAPE RESTE — c'est ce qui permet d'afficher « mail supprimé — étape
   * conservée » au lieu de n'avoir plus rien à dire.
   */
  it('🔴🔴 `message_id` est en ON DELETE SET NULL, jamais en CASCADE', () => {
    expect(SQL).toMatch(/message_id\s+bigint\s+REFERENCES gestion_message\(id\) ON DELETE SET NULL/);
    const bloc = SQL.slice(SQL.indexOf('CREATE TABLE'), SQL.indexOf('CREATE UNIQUE INDEX'));
    expect(bloc).not.toContain('gestion_message(id) ON DELETE CASCADE');
  });

  /**
   * 🔴 ET L'IDENTIFIANT RFC EN DOUBLE, EXPRÈS : il survit à la suppression de la ligne `gestion_message`. Sans
   * lui, une étape dont le mail a été effacé puis RE-relevé (restauré depuis la corbeille Gmail) serait vue
   * comme neuve, et l'on aurait deux fois la même étape sur la frise.
   */
  it('🔴 `message_cle` double l’identifiant, pour survivre à la ligne du mail', () => {
    expect(SQL).toContain('message_cle        text');
    expect(SQL).toMatch(/CREATE UNIQUE INDEX[\s\S]*?gestion_monga_etape_cle_unique[\s\S]*?\(message_cle, type\)/);
  });

  /** 🔴 L'ÉTAPE VISE LA RÉFÉRENCE, pas l'événement : c'est ce qui la fait exister AVANT tout rattachement. */
  it('🔴 une étape se rattache à la référence MNG, ou à l’événement, jamais à rien', () => {
    expect(SQL).toContain('reference          text');
    expect(SQL).toMatch(/CHECK \(reference IS NOT NULL OR evenement_id IS NOT NULL\)/);
    expect(SQL).toMatch(/reference ~ '\^MNG-\[0-9\]\{4,6\}\$'/);
  });
});

describe('② aucun doublon si un même mail est relu', () => {
  /**
   * 🔴🔴 LA RELÈVE REPASSE SUR LES MÊMES MAILS À CHAQUE TOUR, et la reprise rejoue tout le corpus. Sans cette
   * unicité, chaque passage ajouterait une frise entière. Vérifié à l'exécution : 127 étapes après la première
   * application, **127 après la seconde**.
   */
  it('🔴🔴 un index unique sur (message, type), et un INSERT qui ne force pas', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX[\s\S]*?gestion_monga_etape_mail_unique[\s\S]*?\(message_id, type\)/);
    expect(REPO).toContain('ON CONFLICT DO NOTHING');
    expect(REPRISE).toContain('ON CONFLICT DO NOTHING');
  });

  /**
   * ⚠️ LA CLÉ EST (message, type), PAS (message) SEUL : un mail de relance porte à la fois son rappel et le
   * commentaire qui l'accompagne — deux étapes, un seul mail. Les confondre en perdrait une.
   */
  it('⚠️ la clé porte le TYPE, sans quoi un mail à deux étapes en perdrait une', () => {
    expect(SQL).not.toMatch(/gestion_monga_etape_mail_unique\s+ON gestion_monga_etape \(message_id\)\s/);
  });

  /**
   * ⚠️ PARTIEL SUR `source = 'monga'` : deux étapes MANUELLES du même type sur le même événement sont
   * légitimes (deux relances, deux devis acceptés successifs), et elles n'ont pas de message de toute façon.
   */
  it('⚠️ l’unicité ne s’applique qu’aux étapes venues de Monga', () => {
    expect(SQL).toMatch(/gestion_monga_etape_mail_unique[\s\S]*?WHERE message_id IS NOT NULL AND source = 'monga'/);
  });
});

describe('③ relier une référence plus tard fait apparaître tout son passé', () => {
  /**
   * 🔴🔴 C'EST LA SECONDE MOITIÉ DE LA RÈGLE D'ARNO, et elle tient dans la lecture : la frise d'un événement
   * réunit les étapes de SES RÉFÉRENCES (par `gestion_monga_lien`) et ses étapes manuelles. Rien n'est réécrit
   * au moment où l'on relie — les étapes étaient déjà là, rangées sous leur référence.
   *
   * 🔴 MESURÉ AU MOMENT DU LOT : 35 références portent 127 étapes, et **0 référence était reliée**. Tout ce
   * passé est donc en attente, et apparaîtra d'un coup au premier rattachement.
   */
  it('🔴🔴 la frise lit les étapes PAR LA RÉFÉRENCE reliée, pas par un identifiant recopié', () => {
    const f = REPO.slice(REPO.indexOf('export async function friseDeLEvenement'));
    expect(f).toContain('FROM gestion_monga_lien');
    expect(f).toContain('retire_le IS NULL');
    expect(f).toContain('e.evenement_id = $1');
  });

  /**
   * 🔴🔴 `LEFT JOIN` SUR LE MESSAGE, ET C'EST VITAL : l'étape dont le mail a été supprimé doit sortir quand
   * même, avec son fil à `null` — c'est ce qui permet d'afficher « mail supprimé — étape conservée ». Un
   * `INNER JOIN` l'aurait fait disparaître, c'est-à-dire exactement ce que ce lot répare.
   */
  it('🔴🔴 une étape dont le mail n’existe plus sort quand même de la lecture', () => {
    const f = REPO.slice(REPO.indexOf('export async function friseDeLEvenement'));
    expect(f).toContain('LEFT JOIN gestion_message m ON m.id = e.message_id');
    expect(f).not.toMatch(/\n\s+JOIN gestion_message m ON m\.id = e\.message_id/);
  });
});

describe('④ l’étape est enregistrée à l’ARRIVÉE du mail', () => {
  /** 🔴 « À l'arrivée de chaque mail Monga (relève), son contenu est lu et l'étape est ENREGISTRÉE » — Arno. */
  it('🔴 la passe de relève enregistre les étapes et pose l’ouverture', () => {
    const p = CLASSEMENT.slice(CLASSEMENT.indexOf('export async function passeMongaSurLesMails'));
    expect(p).toContain('enregistrerEtapesDuMail(');
    expect(p).toContain('poserOuvertureDeRepli(');
  });

  /**
   * ⚠️ ELLE NE JETTE JAMAIS : même règle que la passe entière — le courrier est arrivé, et un échec
   * d'enregistrement d'étape ne doit pas faire passer la relève pour ratée.
   */
  it('⚠️ un échec d’enregistrement ne fait pas échouer la relève', () => {
    const p = CLASSEMENT.slice(CLASSEMENT.indexOf('export async function passeMongaSurLesMails'));
    const i = p.indexOf('enregistrerEtapesDuMail(');
    expect(p.slice(Math.max(0, i - 400), i)).toContain('try {');
  });
});

describe('⑤ ce qu’une main peut poser, et ce qu’elle ne peut pas', () => {
  /**
   * 🔴🔴 « Une étape manuelle est modifiable et retirable ; une étape Monga ne l'est pas » (Arno). La garde est
   * dans le `WHERE` de la requête, PAS dans l'appelant : une règle métier tenue par l'écran seul finit par être
   * contournée par la deuxième route qui l'oublie.
   */
  it('🔴🔴 modifier et retirer refusent une étape Monga, en SQL', () => {
    /**
     * ⚠️ LA FONCTION SE BORNE À LA SUIVANTE, et non au premier `\n}` : ces deux-là prennent un objet déstructuré,
     * dont l'accolade fermante arrive AVANT le corps. Un découpage naïf lisait donc la seule signature, et
     * l'épreuve échouait en annonçant une garde absente qui était bien là.
     */
    for (const fn of ['modifierEtapeManuelle', 'retirerEtapeManuelle']) {
      const d = REPO.indexOf(`export async function ${fn}`);
      const suivante = REPO.indexOf('\n/**', d);
      expect(REPO.slice(d, suivante === -1 ? undefined : suivante), fn).toContain("source = 'manuelle'");
    }
  });

  /** 🔴 RETIRÉE, JAMAIS SUPPRIMÉE : `statut = 'retire'`, et aucun DELETE dans tout le dépôt des étapes. */
  it('🔴 aucune suppression : une étape retirée reste en base', () => {
    expect(REPO).toContain("statut = 'retire'");
    expect(REPO).not.toMatch(/DELETE FROM gestion_monga_etape/i);
  });

  /**
   * 🔴🔴 LA SEULE CHOSE QU'UNE MAIN POSE SUR UNE ÉTAPE MONGA : LE MONTANT. L'audit a mesuré que le montant n'est
   * JAMAIS dans le mail (2 sur 120, et ce sont des phrases humaines). Décision d'Arno : « Devis automatique
   * (numéro + date), montant complété à la main. »
   */
  it('🔴🔴 le montant se complète même sur un devis venu de Monga', () => {
    const d = REPO.indexOf('export async function completerMontant');
    const suivante = REPO.indexOf('\n/**', d);
    const corps = REPO.slice(d, suivante === -1 ? undefined : suivante);
    expect(corps).toContain("type = 'devis_recu'");
    expect(corps).not.toContain("source = 'manuelle'");
  });

  /** ⚠️ ÉCARTER N'EFFACE PAS : l'étape quitte la frise ET le motif est noté s'être trompé. Les deux. */
  it('⚠️ écarter pose à la fois le retrait et le motif écarté', () => {
    const d = REPO.indexOf('export async function trancherEtape');
    const suivante = REPO.indexOf('\n/**', d);
    const corps = REPO.slice(d, suivante === -1 ? undefined : suivante);
    expect(corps).toContain("certitude = 'ecartee'");
    expect(corps).toContain("statut = 'retire'");
    expect(corps).toContain("certitude = 'confirmee'");
  });
});

describe('⑥ la reprise simule avant d’écrire', () => {
  /**
   * 🔴🔴 LA SIMULATION EST LE DÉFAUT, ET NON L'OPTION. Un script de reprise qui écrit quand on l'appelle sans
   * argument est un script qu'on lance une fois de trop. Il faut DEMANDER d'écrire.
   */
  it('🔴🔴 sans `--appliquer`, rien n’est écrit', () => {
    expect(REPRISE).toContain("const APPLIQUER = process.argv.includes('--appliquer')");
    expect(REPRISE).toContain('if (APPLIQUER)');
    expect(REPRISE).toContain('SIMULATION');
  });

  /**
   * ⚠️ TOUS LES MAILS MONGA, CORBEILLE COMPRISE — c'est le point même de la règle d'Arno. Filtrer la corbeille
   * ici aurait perdu un quart du corpus (25 mails sur 98), c'est-à-dire précisément ce qu'on vient sauver.
   */
  it('⚠️ la reprise ne filtre PAS la corbeille', () => {
    const r = REPRISE.slice(REPRISE.indexOf('FROM gestion_message'), REPRISE.indexOf('ORDER BY recu_le'));
    expect(r).not.toContain('corbeille_le IS NULL');
  });
});
