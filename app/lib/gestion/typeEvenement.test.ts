import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATEGORIES_EVENEMENT, categorieValide, motCategorie, MOT_TYPE_A_DEFINIR,
  tonDuType, TONS_TYPE_EVENEMENT, TYPES_EVENEMENT,
} from './evenementQualite';

/**
 * ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 2 — UNE SEULE SOURCE POUR LA LISTE DES TYPES ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « Il faut UNE seule source de vérité pour la liste des types, lue par TOUS ces endroits.
 * Ainsi, un type créé plus tard apparaît automatiquement partout (listes de choix, filtres, capsule) sans toucher
 * au code de chaque écran. […] La couleur d'un nouveau type est attribuée automatiquement et de façon stable (le
 * même type garde toujours la même couleur). […] Les 4 types actuels ont chacun une couleur fixe et distincte. »
 *
 * ═══ CE QUE CE FICHIER TIENT, ET QU'AUCUN AUTRE NE PEUT TENIR ════════════════════════════════════════════════════
 *   ① que la liste n'est plus écrite qu'UNE fois — et que les trois endroits qui la recopiaient la DÉRIVENT ;
 *   ② que la BASE dit la même chose que le code, en relisant le SQL de la migration 317 ;
 *   ③ qu'un type ajouté à la source paraît dans les deux formulaires et dans la capsule SANS toucher à un écran —
 *     éprouvé en AJOUTANT vraiment un type à une liste, pas en relisant du code ;
 *   ④ que la couleur est stable, et que les quatre types d'aujourd'hui en ont quatre distinctes.
 *
 * 🔒 Module PUR : aucune base, aucun réseau, aucun DOM. Les lectures de fichier sont des lectures de SOURCE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const QUALITE = readFileSync('app/lib/gestion/evenementQualite.ts', 'utf8');
const MIGRATION = readFileSync('db/migrations/317_gestion_evenement_types_source_unique.sql', 'utf8');

describe('🔴🔴 ① la liste n’est écrite qu’une fois', () => {
  it('🔴 les quatre types d’Arno, dans l’ordre, avec leurs mots', () => {
    expect(TYPES_EVENEMENT.map((t) => t.cle)).toEqual(['travaux', 'fuite_eau', 'administratif', 'litige']);
    expect(TYPES_EVENEMENT.map((t) => t.mot))
      .toEqual(['Travaux', 'Fuite d’eau', 'Administratif', 'Litige']);
  });

  /**
   * 🔴🔴 LES CLÉS SONT DÉRIVÉES, et plus réécrites. C'était la PREMIÈRE copie : un tableau de clés à côté de la
   * déclaration des mots, libre de s'en écarter.
   */
  it('🔴🔴 `CATEGORIES_EVENEMENT` sort de la source, elle n’est plus une seconde liste', () => {
    expect(CATEGORIES_EVENEMENT).toEqual(TYPES_EVENEMENT.map((t) => t.cle));
    expect(QUALITE).toContain(
      'export const CATEGORIES_EVENEMENT: readonly string[] = TYPES_EVENEMENT.map((t) => t.cle);');
    /* ⚠️ ET PLUS AUCUN LITTÉRAL DE CLÉS AILLEURS DANS LE MODULE : une seule ligne nomme les quatre. */
    expect((QUALITE.match(/'fuite_eau'/g) ?? [])).toHaveLength(1);
  });

  /**
   * 🔴🔴 LE LIBELLÉ AUSSI. C'était la DEUXIÈME copie, et la plus dangereuse : une chaîne de quatre `if`. Un type
   * ajouté au tableau sans sa ligne ici tombait sur « Non précisée » — il existait en base, il passait la
   * contrainte, le `<select>` le proposait, et la carte affichait « Non précisée ».
   */
  it('🔴🔴 `motCategorie` cherche dans la source, au lieu de réécrire les quatre clés', () => {
    expect(QUALITE).toContain("return TYPES_EVENEMENT.find((t) => t.cle === c)?.mot ?? 'Non précisée';");
    for (const t of TYPES_EVENEMENT) expect(motCategorie(t.cle), t.cle).toBe(t.mot);
  });

  /** ⚠️ « Non précisée » RESTE LE REPLI : une valeur hors liste doit se lire pour ce qu'elle est. */
  it('⚠️ une valeur inconnue, vide ou absente vaut « Non précisée » et n’est pas valide', () => {
    for (const brut of ['inconnu', '', '   ', null, undefined, 42]) {
      expect(categorieValide(brut), String(brut)).toBeNull();
    }
    expect(motCategorie('inconnu')).toBe('Non précisée');
    expect(motCategorie(null)).toBe('Non précisée');
  });
});

describe('🔴🔴 ② la base dit la même chose que le code', () => {
  /**
   * 🔴🔴 LA TROISIÈME COPIE EST LA CONTRAINTE `gestion_evenement_categorie_chk`. On ne la supprime PAS — elle fait
   * double garde avec `categorieValide`, et c'est délibéré depuis la 268 : « un garde applicatif se contourne au
   * prochain script, une contrainte non ».
   *
   * 🔴 CE QU'ON RÉPARE, C'EST QU'ELLE SOIT VÉRIFIABLE. Ce cas relit le SQL de la migration 317 et exige la MÊME
   * liste, dans le MÊME ordre. Ajouter un type sans écrire la migration rend donc la suite ROUGE, au lieu de
   * donner une carte qu'on n'arrive pas à enregistrer six mois plus tard.
   */
  it('🔴🔴 la contrainte de la migration 317 porte exactement la liste de la source', () => {
    const m = MIGRATION.match(/categorie = ANY \(ARRAY\[([^\]]+)\]\)/);
    expect(m, 'la migration doit porter une contrainte ARRAY[...]').not.toBeNull();
    const clesSql = (m?.[1] ?? '').split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    expect(clesSql).toEqual([...CATEGORIES_EVENEMENT]);
  });

  /** 🔴 ET LA MIGRATION DIT D'OÙ VIENT SA LISTE : sans cela, le prochain lecteur la croirait autonome. */
  it('🔴 la migration nomme sa source', () => {
    expect(MIGRATION).toContain('TYPES_EVENEMENT');
    expect(MIGRATION).toContain('app/lib/gestion/evenementQualite.ts');
  });

  /**
   * ⚠️ ELLE EST SANS EFFET SI LA 268 N'EST PAS APPLIQUÉE. Sans la colonne `categorie`, il n'y a pas de contrainte
   * à rejouer : la migration ne doit pas échouer, elle doit ne rien faire.
   */
  it('⚠️ elle ne touche à rien quand la colonne n’existe pas', () => {
    expect(MIGRATION).toContain("WHERE table_name = 'gestion_evenement' AND column_name = 'categorie'");
    /* ⚠️ ET ELLE N'ÉCRIT AUCUNE DONNÉE : pas un UPDATE, pas un INSERT, pas un DELETE. */
    expect(MIGRATION).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
  });
});

describe('🔴🔴 ③ un type ajouté paraît partout, sans toucher un écran', () => {
  /**
   * 🔴🔴 ON L'ÉPROUVE EN AJOUTANT VRAIMENT UN TYPE, et non en relisant du code. Une liste locale, construite comme
   * la source, et l'on vérifie que les mêmes expressions — celles que les écrans emploient — le rendent.
   *
   * ⚠️ POURQUOI PAS EN MUTANT `TYPES_EVENEMENT` : elle est `readonly`, et le module est importé par tout le
   * reste de la suite. On rejoue donc les EXPRESSIONS des écrans sur une liste étendue, ce qui est exactement ce
   * qu'ils feront le jour où la source en portera une de plus.
   */
  const ETENDUE = [...TYPES_EVENEMENT, { cle: 'degat_eaux', mot: 'Dégât des eaux' }];

  it('🔴🔴 il entre dans les listes de choix des DEUX formulaires', () => {
    /* L'expression des deux `<select>`, mot pour mot — c'est elle qu'on rejoue. */
    const options = ETENDUE.map((t) => ({ cle: t.cle, mot: t.mot }));
    expect(options.map((o) => o.mot)).toContain('Dégât des eaux');
    /* 🔴 ET LES DEUX FORMULAIRES L'ÉCRIVENT BIEN DE CETTE FAÇON — même expression des deux côtés. */
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8');
    for (const [nom, src] of [['création', BLOC], ['modification', CARTE]] as const) {
      expect(src, nom).toContain('{TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.mot}</option>)}');
    }
  });

  it('🔴🔴 il reçoit un mot et un ton sans qu’on les lui donne', () => {
    const lui = ETENDUE.find((t) => t.cle === 'degat_eaux');
    expect(lui?.mot).toBe('Dégât des eaux');
    /* 🔴 LE TON NE SE DÉCLARE PAS : il se calcule, et il est forcément dans la palette. */
    expect(TONS_TYPE_EVENEMENT).toContain(tonDuType('degat_eaux'));
  });

  /** 🔴 ET AUCUN ÉCRAN N'ÉCRIT LA LISTE À LA MAIN : aucune clé en dur hors de la source. */
  it('🔴 aucun écran ne recopie une clé de type', () => {
    for (const chemin of [
      'app/(admin)/admin/(protected)/gestion/CarteVive.tsx',
      'app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx',
      'app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx',
      'app/(admin)/api/admin/gestion/evenements/[id]/route.ts',
    ]) {
      const src = readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const cle of CATEGORIES_EVENEMENT) expect(src, `${chemin} · ${cle}`).not.toContain(`'${cle}'`);
    }
  });
});

describe('🔴🔴 ④ la couleur : automatique, stable, et distincte pour les quatre', () => {
  /**
   * 🔴🔴 QUATRE TYPES, QUATRE TONS (Arno). C'est ce qui rend la capsule lisible d'un coup d'œil : deux types de
   * la même couleur se confondraient dans une colonne de dossiers.
   */
  it('🔴🔴 les quatre types d’aujourd’hui ont quatre tons distincts', () => {
    const tons = CATEGORIES_EVENEMENT.map(tonDuType);
    expect(new Set(tons).size).toBe(4);
  });

  /**
   * 🔴🔴 SEPT TONS, ET C'EST LE PLUS PETIT QUI MARCHE. Mesuré en écrivant ce lot : à CINQ et à SIX tons, deux des
   * quatre types tombent sur le même. Ce cas rejoue la mesure, pour que le nombre ne tienne pas à un souvenir —
   * et pour qu'on sache, si la palette devait rétrécir un jour, ce qu'on perdrait.
   */
  it('🔴🔴 sept tons : à cinq et à six, deux types se confondraient', () => {
    expect(TONS_TYPE_EVENEMENT).toHaveLength(7);
    const hache = (cle: string): number => {
      let n = 0;
      for (const c of cle) n = (Math.imul(n, 31) + (c.codePointAt(0) ?? 0)) >>> 0;
      return n;
    };
    for (const k of [5, 6]) {
      expect(new Set(CATEGORIES_EVENEMENT.map((c) => hache(c) % k)).size, `palette de ${k}`).toBeLessThan(4);
    }
    expect(new Set(CATEGORIES_EVENEMENT.map((c) => hache(c) % 7)).size).toBe(4);
  });

  /**
   * 🔴🔴 STABLE VEUT DIRE : NE DÉPEND QUE DE LA CLÉ. Un index de tableau aurait fait l'inverse — insérer un type
   * au milieu aurait décalé la couleur de tous les suivants, et l'œil aurait dû tout réapprendre.
   */
  it('🔴🔴 le ton ne dépend QUE de la clé, jamais de sa place dans la liste', () => {
    const avant = CATEGORIES_EVENEMENT.map((c) => [c, tonDuType(c)] as const);
    /* On réordonne, on insère, on retire — le ton de chacun ne bouge pas d'un cran. */
    for (const [cle, ton] of avant) expect(tonDuType(cle), cle).toBe(ton);
    expect(tonDuType('travaux')).toBe(tonDuType('travaux'));
    /* ⚠️ ET DEUX CLÉS VOISINES NE SE SUIVENT PAS : le ton n'est pas un rang déguisé. */
    expect(tonDuType('litige')).not.toBe(tonDuType('litigf'));
  });

  /** ⚠️ UNE CLÉ VIDE OU EXOTIQUE REND UN TON DE LA PALETTE, jamais `undefined` : la capsule a toujours une classe. */
  it('⚠️ toute clé, même vide ou accentuée, tombe dans la palette', () => {
    for (const cle of ['', 'é', 'un_type_très_long_avec_des_accents_é_à_ü', '🙂']) {
      expect(TONS_TYPE_EVENEMENT, cle).toContain(tonDuType(cle));
    }
  });

  /**
   * 🔴 CHAQUE TON EST UNE PAIRE DE JETONS DU THÈME, AVEC SA VARIANTE SOMBRE — jamais une couleur en dur. C'est ce
   * qui fait que la capsule suit les trois thèmes sans rien dire d'eux.
   */
  it('🔴 les sept tons ont leur règle, et chacune ne tire que des jetons', () => {
    const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    for (const ton of TONS_TYPE_EVENEMENT) {
      const regle = VUE.match(new RegExp(`\\.gst-type-capsule--${ton}\\{([^}]*)\\}`));
      expect(regle, ton).not.toBeNull();
      const corps = regle?.[1] ?? '';
      /* ⚠️ DEUX JETONS, UN FOND ET UN TEXTE : une capsule tamisée, jamais un aplat. */
      expect((corps.match(/var\(--color-svv-[a-z-]+\)/g) ?? []), ton).toHaveLength(2);
      expect(corps, ton).not.toMatch(/#[0-9a-f]{3,8}/i);
      /* 🔴 ET LES DEUX JETONS EXISTENT EN CLAIR **ET** EN SOMBRE : au moins deux définitions chacun. */
      for (const jeton of (corps.match(/--color-svv-[a-z-]+/g) ?? [])) {
        expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, `${ton} · ${jeton}`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('🔴🔴 ⑤ sans type : « Type à définir », et un chemin pour le choisir', () => {
  it('🔴 le mot est écrit une seule fois, dans la source', () => {
    expect(MOT_TYPE_A_DEFINIR).toBe('Type à définir');
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(CARTE).toContain('MOT_TYPE_A_DEFINIR');
    expect(CARTE).not.toContain("'Type à définir'");
  });

  /**
   * 🔴🔴 LE CLIC MÈNE AU CHOIX DU TYPE, ET SANS ÉCRAN NOUVEAU (Arno). Il déplie le dossier (`ouvrirSignal`, le
   * mécanisme que `BlocRepliable` offre déjà) ET ouvre le formulaire « Modifier les informations de
   * l'événement », qui porte désormais le `<select>` du type.
   */
  it('🔴🔴 le clic déplie le dossier et ouvre le formulaire existant', () => {
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(CARTE).toContain('ouvrirSignal={demandeDeType}');
    expect(CARTE).toContain('demandeDeType={demandeDeType}');
    expect(CARTE).toContain('const [edition, setEdition] = useState(demandeDeType > 0);');
    /* 🔴 ET C'EST LE FORMULAIRE DÉJÀ EN PLACE — celui du bouton « Modifier les informations de l'événement » —
       qui a gagné le champ, pas un écran de plus. */
    expect(CARTE).toContain('export function FormulaireCarte(');
    const formulaire = CARTE.slice(CARTE.indexOf('export function FormulaireCarte('));
    expect(formulaire).toContain('<span className="svv-label">Type</span>');
    const BIEN = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
    expect(BIEN).toContain('Modifier les informations de l’événement');
    expect(BIEN).toContain("import { FormulaireCarte } from './CarteVive';");
  });

  /**
   * 🔴🔴 LE TYPE SE CORRIGE DÉSORMAIS, ET C'EST NEUF : il ne se posait QU'À LA CRÉATION. Ni le formulaire, ni le
   * `PATCH`, ni `ChampsEvenement` ne le portaient — un événement ouvert sans type le restait pour toujours.
   */
  it('🔴🔴 la porte d’écriture accepte le type, et le refuse s’il est inconnu', () => {
    const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(GESTES).toContain('categorie?: string | null;');
    expect(GESTES).toContain("demande.push(['categorie', 'categorie', valeur]);");
    expect(GESTES).toContain("if (brut !== '' && valeur === null) return { ok: false, motif: 'Ce type d’événement n’existe pas.' };");
    const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/route.ts', 'utf8');
    /* 🔴 LOT URGENCE-EVENEMENT, POINT 3 — `urgence` a rejoint la MÊME ligne, par la MÊME porte : le type n'est
       donc plus seul à se corriger après coup. */
    expect(ROUTE).toContain(
      'const { objet, demandeurNom, demandeurEmail, adresseLibre, categorie, urgence } = corps;');
  });

  /**
   * ⚠️ SANS LA MIGRATION 268, ON N'ÉCRIT PAS UN TYPE : la colonne n'existe pas. Le refus NOMME la mise à jour
   * manquante plutôt que de laisser une erreur de contrainte remonter telle quelle.
   */
  it('⚠️ sans la 268, l’écriture du type est refusée, et elle dit laquelle manque', () => {
    const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(GESTES).toContain('mise à jour 268 à appliquer');
    expect(GESTES).toContain('if (!(await evenementQualifieDisponible())) {');
    /* 🔴 ET LE FORMULAIRE N'ENVOIE LE TYPE QUE S'IL A CHANGÉ : sans quoi une simple correction du « quoi »
       aurait échoué sur une telle base. */
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(CARTE).toContain('...(categorie === (categorieValide(detail.categorie) ?? \'\') ? {} : { categorie }),');
  });
});
