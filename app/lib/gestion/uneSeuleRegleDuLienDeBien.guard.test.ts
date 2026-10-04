import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { sqlLiensDuBien } from './rattachement';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — LE GARDE DE LA RÈGLE UNIQUE ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « Ajoute un test de garde : il échoue si un nouvel endroit réécrit la règle au lieu
 * d'utiliser le fragment unique. »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EXISTE ═══════════════════════════════════════════════════════
 *
 * LA RÈGLE EN QUESTION tient en une phrase : « un mail est rattaché à un BIEN quand il porte un lien vivant vers une
 * cible de sorte `lot`, dont la clé est connue, et qui ne vise pas une pièce jointe en particulier. » Elle vivait
 * écrite À LA MAIN dans QUATRE endroits — la fenêtre « Visualiser / Modifier », l'historique du bien, l'historique
 * du propriétaire, et la fenêtre Drive du bien — et les quatre ne disaient PAS tout à fait la même chose : deux
 * fermaient `piece_id`, deux l'oubliaient. Ils concordaient par chance, pas par construction.
 *
 * 🔴 CE GARDE NE VÉRIFIE PAS QUE LA RÈGLE EST BONNE. Il vérifie qu'il n'en existe QU'UNE. C'est l'invariant utile :
 * une règle unique peut être corrigée une fois pour tous les écrans ; quatre règles jumelles dérivent en silence, et
 * l'écart ne se voit que le jour où un bien manque dans un historique sans que personne sache lequel des quatre
 * codes a raison.
 *
 * ⚠️ IL ÉCHOUE SUR UN ENDROIT NEUF, PAS SUR UN ENDROIT CONNU : il n'y a AUCUNE liste d'exemptions ci-dessous, et
 * c'est délibéré. Une liste blanche aurait rendu le garde inoffensif — il aurait suffi d'y ajouter son fichier.
 * Le seul endroit autorisé à composer la règle est celui qui LA DÉFINIT (`rattachement.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le fichier qui DÉFINIT la règle — le seul autorisé à l'écrire. */
const DEFINITION = 'app/lib/gestion/rattachement.ts';

/**
 * ⚠️ `app/scripts/` EST HORS CHAMP, ET CE N'EST PAS UN OUBLI. Un script d'audit vaut précisément parce qu'il
 * REDÉMONTRE la règle de son côté : s'il lisait le fragment de production, il ne pourrait plus jamais prendre ce
 * fragment en défaut. Un oracle qui partage le code qu'il contrôle ne contrôle rien.
 */
const RACINES = ['app/lib', 'app/(admin)'];

const posix = (p: string): string => p.split(/[\\/]/).join('/');

/** Tous les .ts/.tsx de production sous les racines surveillées, hors épreuves. */
function fichiersSurveilles(): string[] {
  return RACINES.flatMap((racine) => readdirSync(racine, { recursive: true })
    .map((p) => `${racine}/${posix(String(p))}`)
    .filter((p) => /\.tsx?$/.test(p) && !/\.(test|itest)\.tsx?$/.test(p)));
}

/**
 * 🔴 ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER, et cette leçon a été payée : le script d'audit du lot précédent
 * s'est dénoncé lui-même parce que sa propre documentation NOMME ce qu'elle interdit. Un encadré qui explique la
 * règle doit pouvoir l'écrire en clair sans faire échouer le garde.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/**
 * LES ENDROITS QUI RÉÉCRIVENT LA RÈGLE : un littéral de gabarit (le SQL de ce dépôt s'écrit entre accents graves)
 * qui nomme LUI-MÊME les trois morceaux — la sorte `lot`, la clé non nulle, et un statut.
 *
 * ⚠️ LA CONJONCTION DES TROIS, PAS L'UN D'EUX. `cible_sorte = 'lot'` tout seul est une question légitime et
 * fréquente (compter les mails d'un logement, joindre l'annuaire, lister les périodes d'occupation) : l'interdire
 * condamnerait du code sain. Ce qui n'a pas à être réécrit, c'est la RÈGLE — donc les trois ensemble.
 */
function endroitsQuiReecriventLaRegle(): { fichier: string; sql: string }[] {
  const trouves: { fichier: string; sql: string }[] = [];
  for (const fichier of fichiersSurveilles()) {
    if (fichier === DEFINITION) continue;
    const source = sansCommentaires(readFileSync(fichier, 'utf8'));
    for (const m of source.matchAll(/`([^`]*)`/g)) {
      const sql = m[1].replace(/\s+/g, ' ');
      if (/cible_sorte\s*=\s*'lot'/.test(sql)
        && /cible_cle\s+IS\s+NOT\s+NULL/i.test(sql)
        && /statut/.test(sql)) trouves.push({ fichier, sql: sql.slice(0, 160) });
    }
  }
  return trouves;
}

describe('🔴🔴 ① la règle du lien de bien ne s’écrit qu’à un seul endroit', () => {
  /**
   * 🔴🔴 C'EST L'ASSERTION QUI COMPTE DANS TOUT CE FICHIER. Si elle casse, ce n'est pas le test qu'il faut
   * assouplir : c'est l'endroit neuf qui doit appeler `sqlLiensDuBien(alias)` au lieu de recopier le prédicat.
   */
  it('🔴🔴 aucun autre fichier de production ne compose le prédicat à la main', () => {
    const fautifs = endroitsQuiReecriventLaRegle();
    expect(
      fautifs.map((f) => `${f.fichier} :: ${f.sql}`),
      'Un endroit réécrit la règle « bien rattaché à un mail » au lieu de lire sqlLiensDuBien() de '
      + `${DEFINITION}. Remplace le prédicat par \${sqlLiensDuBien('<alias>')}.`,
    ).toEqual([]);
  });
});

describe('🔴🔴 ② les quatre lecteurs lisent bien le fragment', () => {
  /**
   * 🔴 LA CONTREPARTIE DE ①. Le test ① seul serait satisfait par un code qui n'interroge plus rien du tout : il
   * suffirait de supprimer les requêtes pour qu'aucun fichier ne réécrive la règle. On fige donc aussi que chacun
   * des quatre écrans PASSE par le fragment.
   *
   * ⚠️ `avecPropositions: true` POUR LA SEULE FENÊTRE : son panneau « Modifier » doit montrer les propositions de
   * l'automatisation à trancher, là où les historiques ne montrent que ce qui EST rattaché. C'est une différence
   * VOULUE et nommée, portée par un paramètre — pas un second prédicat.
   */
  const LECTEURS: readonly [string, string][] = [
    ['app/lib/gestion/ficheRattachementRepo.ts', "sqlLiensDuBien('r', { avecPropositions: true })"],
    ['app/lib/gestion/historiqueRepo.ts', "sqlLiensDuBien('r')"],
    ['app/lib/gestion/dossierDuBienRepo.ts', "sqlLiensDuBien('r')"],
  ];

  it.each(LECTEURS)('🔴🔴 %s appelle %s', (fichier, appel) => {
    const source = readFileSync(fichier, 'utf8');
    expect(source).toContain(`import { sqlLiensDuBien } from './rattachement';`);
    expect(source).toContain(`\${${appel}}`);
  });

  /**
   * 🔴 L'HISTORIQUE DU BIEN ET CELUI DU PROPRIÉTAIRE SONT LE MÊME CODE — une seule requête, un seul axe `lot`. Le
   * dire ici évite de croire, en lisant la liste ci-dessus, qu'un des deux aurait été oublié.
   */
  it('🔴 l’axe « propriétaire » garde SA condition : une personne n’est pas un bien', () => {
    const source = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
    expect(source).toContain("r.cible_sorte = 'proprietaire'");
    expect(source).toContain("r.cible_sorte = 'evenement'");
  });
});

describe('🔴 ③ ce que le fragment produit, mot pour mot', () => {
  /**
   * 🔴 LE TEXTE EXACT, parce que c'est lui qui part en base. Les trois morceaux, dans cet ordre, avec l'alias
   * demandé — et le statut qui change, lui seul, selon `avecPropositions`.
   */
  it('🔴 confirmé seul par défaut, propositions comprises sur demande', () => {
    expect(sqlLiensDuBien('r')).toBe(
      "r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL AND r.piece_id IS NULL",
    );
    expect(sqlLiensDuBien('r', { avecPropositions: true })).toBe(
      "r.statut IN ('propose', 'confirme') AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL"
      + ' AND r.piece_id IS NULL',
    );
  });

  /** ⚠️ L'ALIAS EST CELUI DE L'APPELANT : une requête qui nomme sa table `lien` doit obtenir `lien.statut`. */
  it('⚠️ l’alias traverse les quatre morceaux', () => {
    expect(sqlLiensDuBien('lien')).toBe(
      "lien.statut = 'confirme' AND lien.cible_sorte = 'lot' AND lien.cible_cle IS NOT NULL"
      + ' AND lien.piece_id IS NULL',
    );
  });

  /**
   * 🔴 LE CIBLAGE RESTE CHEZ L'APPELANT, et c'est volontaire. Le fragment dit « qu'est-ce qu'un lien de bien
   * vivant », jamais « DE QUEL bien » : la fenêtre borne par `fil_id`, l'historique par une liste de clés, le Drive
   * par l'échange ouvert. Mettre la cible dans le fragment aurait obligé chaque appelant à lui passer la sienne,
   * c'est-à-dire à réintroduire la variété qu'on vient de supprimer.
   */
  it('🔴 le fragment ne nomme AUCUNE cible particulière', () => {
    const texte = sqlLiensDuBien('r');
    expect(texte).not.toContain('fil_id');
    expect(texte).not.toContain('ANY(');
    expect(texte).not.toContain('$');
  });
});
