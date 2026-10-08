import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NIVEAUX_URGENCE, TONS_URGENCE, URGENCES_EVENEMENT,
  motUrgence, tonUrgence, urgenceValide,
} from './evenementQualite';

/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT — LE DEGRÉ D'URGENCE : UNE SOURCE, TROIS MOTS, TROIS COULEURS ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026) :
 *   ① « La couleur de fond de la capsule de type ne dépend plus du type : elle traduit le degré d'urgence de
 *      l'événement. […] Normal → vert ; Intermédiaire → orange ; Urgent → rouge. Événement sans niveau d'urgence
 *      enregistré : capsule grise neutre. »
 *   ② « Le niveau le plus haut s'appelle “Urgent” partout (création, modification, carte, fiche, filtres, bulles).
 *      Si la valeur stockée est “critique”, écris une migration qui la renomme sans rien perdre. Une seule source
 *      pour la liste des niveaux et leurs libellés, lue par tous les écrans (même principe que la liste des
 *      types). »
 *
 * 🔒 AUCUN RÉSEAU, AUCUNE BASE : ce fichier éprouve un module PUR, et relit des fichiers du dépôt.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const MIGRATION = 'db/migrations/319_gestion_evenement_urgence_urgent.sql';

describe('🔴🔴 ① une seule source pour les niveaux et leurs libellés', () => {
  it('🔴🔴 trois niveaux, dans l’ordre, avec les mots d’Arno', () => {
    expect(NIVEAUX_URGENCE.map((n) => n.cle)).toEqual(['normale', 'haute', 'urgent']);
    expect(NIVEAUX_URGENCE.map((n) => n.mot)).toEqual(['Normal', 'Intermédiaire', 'Urgent']);
  });

  /** 🔴 LES CLÉS SEULES SONT **DÉRIVÉES**, et plus écrites à la main — comme `CATEGORIES_EVENEMENT`. */
  it('🔴 `URGENCES_EVENEMENT` est dérivé de la source, et non recopié', () => {
    expect(URGENCES_EVENEMENT).toEqual(NIVEAUX_URGENCE.map((n) => n.cle));
  });

  /**
   * 🔴🔴 LE MOT VIENT DE LA SOURCE, ET NON D'UNE CHAÎNE DE `if`. C'est la propriété qui a manqué à `motCategorie`
   * jusqu'au lot CAPSULE-TYPE-EVENEMENT : un niveau ajouté au tableau sans sa ligne de `if` tombait sur « Non
   * précisée ». On l'éprouve en AJOUTANT vraiment un niveau.
   *
   * ⚠️ `readonly` EST UNE GARANTIE DE COMPILATION, PAS D'EXÉCUTION : le tableau est bien mutable à l'exécution, et
   * c'est ce qui rend cette épreuve possible. Le `finally` le remet dans son état.
   */
  it('🔴🔴 un niveau ajouté à la source a son mot, son ton et sa validation, sans toucher au code', () => {
    const NEUF = { cle: 'bloquant', mot: 'Bloquant', ton: 'rouge' as const };
    (NIVEAUX_URGENCE as (typeof NEUF)[]).push(NEUF);
    try {
      expect(motUrgence('bloquant')).toBe('Bloquant');
      expect(tonUrgence('bloquant')).toBe('rouge');
      expect(urgenceValide('bloquant')).toBe('bloquant');
    } finally {
      const i = (NIVEAUX_URGENCE as (typeof NEUF)[]).indexOf(NEUF);
      if (i >= 0) (NIVEAUX_URGENCE as (typeof NEUF)[]).splice(i, 1);
    }
    /* ⚠️ ET LE TABLEAU EST REVENU À SON ÉTAT : sans quoi tout le reste de la suite verrait un quatrième niveau. */
    expect(urgenceValide('bloquant')).toBeNull();
  });

  /**
   * 🔴 LES ÉCRANS LISENT LA SOURCE, ET NON LES CLÉS PUIS LEUR MOT. Deux lectures pour une liste qui n'en a qu'une,
   * c'est le défaut qu'on vient de refermer : l'épreuve le tient par le texte, parce qu'aucun compilateur ne le
   * tiendrait.
   */
  it('🔴 le formulaire de création lit `NIVEAUX_URGENCE`, pas les clés + `motUrgence`', () => {
    const BLOC = readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8');
    expect(BLOC).toContain('NIVEAUX_URGENCE.map((n) => <option key={n.cle} value={n.cle}>{n.mot}</option>)');
    /* ⚠️ ON INTERDIT LE **PARCOURS** DES CLÉS, ET NON LA MENTION DU NOM : le commentaire qui explique ce
       changement cite `URGENCES_EVENEMENT`, et il doit pouvoir le faire. C'est la DOUBLE LECTURE qui est bannie. */
    expect(BLOC).not.toContain('URGENCES_EVENEMENT.map');
    /* ⚠️ PAS DE DRAPEAU `s` : la cible de compilation du dépôt ne le permet pas, et il est inutile ici —
       `[^;]` traverse déjà les retours à la ligne. */
    expect(BLOC).not.toMatch(/import[^;]*URGENCES_EVENEMENT/);
  });
});

describe('🔴🔴 ② « critique » est devenu « urgent », partout', () => {
  it('🔴🔴 la clé `critique` n’existe plus, et n’est plus acceptée', () => {
    expect(NIVEAUX_URGENCE.some((n) => n.cle === 'critique')).toBe(false);
    /* 🔴 ET UNE PAGE RESTÉE OUVERTE QUI L'ENVERRAIT EST REFUSÉE, pas écrite en silence. */
    expect(urgenceValide('critique')).toBeNull();
  });

  /** ⚠️ `Critique` NE S'ÉCRIT PLUS NULLE PART DANS LES ÉCRANS DE L'ÉVÉNEMENT. */
  it('⚠️ le mot « Critique » a disparu du module pur', () => {
    const PUR = readFileSync('app/lib/gestion/evenementQualite.ts', 'utf8');
    expect(PUR).not.toContain("return 'Critique'");
  });

  /**
   * 🔴🔴 LA CONTRAINTE DE LA BASE DIT LA MÊME CHOSE QUE LA SOURCE, CLÉ POUR CLÉ ET DANS LE MÊME ORDRE.
   *
   * C'est ce qui rend l'accord VÉRIFIABLE au lieu d'être promis — exactement comme `typeEvenement.test.ts` le fait
   * pour les types depuis la migration 317. Une divergence devient une suite ROUGE, et non une carte qu'on
   * n'arrive pas à enregistrer six mois plus tard.
   */
  it('🔴🔴 la migration 319 rejoue la contrainte depuis la source, dans le même ordre', () => {
    const SQL = readFileSync(MIGRATION, 'utf8');
    const liste = NIVEAUX_URGENCE.map((n) => `'${n.cle}'`).join(',');
    expect(SQL).toContain(`CHECK (urgence IS NULL OR urgence = ANY (ARRAY[${liste}]))`);
  });

  /**
   * 🔴🔴 L'ORDRE DES TROIS GESTES DE LA MIGRATION, ET IL N'EST PAS INDIFFÉRENT : la contrainte d'avant n'autorise
   * que `critique`. Renommer AVANT de l'avoir retirée serait refusé par la base, et la migration échouerait sur sa
   * propre première ligne.
   */
  it('🔴🔴 elle retire la contrainte, PUIS renomme, PUIS la repose', () => {
    const SQL = readFileSync(MIGRATION, 'utf8');
    const drop = SQL.indexOf('DROP CONSTRAINT IF EXISTS gestion_evenement_urgence_chk');
    const update = SQL.indexOf("UPDATE gestion_evenement SET urgence = 'urgent' WHERE urgence = 'critique'");
    const add = SQL.indexOf('ADD CONSTRAINT gestion_evenement_urgence_chk');
    expect(drop).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(drop);
    expect(add).toBeGreaterThan(update);
  });

  /**
   * ⚠️ ELLE NE FAIT RIEN SANS LA MIGRATION 268 plutôt que d'échouer : sans la colonne `urgence`, il n'y a ni ligne
   * à renommer ni contrainte à rejouer. Même prudence que la 317 pour `categorie`.
   */
  it('⚠️ elle est gardée par l’existence de la colonne', () => {
    const SQL = readFileSync(MIGRATION, 'utf8');
    expect(SQL).toContain("WHERE table_name = 'gestion_evenement' AND column_name = 'urgence'");
  });
});

describe('🔴🔴 ③ le ton d’un niveau : vert, orange, rouge — et rien pour l’absence', () => {
  it('🔴🔴 les trois tons d’Arno, dans l’ordre des niveaux', () => {
    expect(tonUrgence('normale')).toBe('vert');
    expect(tonUrgence('haute')).toBe('orange');
    expect(tonUrgence('urgent')).toBe('rouge');
  });

  /**
   * 🔴🔴 AUCUN NIVEAU ⇒ `null`, ET SURTOUT PAS « vert ». Ne pas avoir choisi n'est pas avoir choisi « Normal » :
   * c'est un QUATRIÈME état, et les confondre ferait passer pour « pas urgent » tout dossier que personne n'a
   * encore regardé — c'est-à-dire les 2 événements de la base au 08/10/2026.
   */
  it.each([null, undefined, '', '   ', 'critique', 'inconnu'])('🔴 « %s » n’a aucun ton', (u) => {
    expect(tonUrgence(u)).toBeNull();
    expect(motUrgence(u)).toBe('Non précisée');
  });

  it('⚠️ tout ton déclaré appartient à la palette', () => {
    for (const n of NIVEAUX_URGENCE) expect(TONS_URGENCE, n.cle).toContain(n.ton);
  });

  /**
   * 🔴 CHAQUE TON A SA RÈGLE DANS LA FEUILLE, ET CHACUNE NE TIRE QUE DES JETONS DU THÈME, qui portent leur
   * variante Sombre. C'est ce qui fait que la capsule suit les trois thèmes sans qu'une couleur soit écrite à la
   * main — et c'est la même épreuve que celle des sept tons de type, au lot précédent.
   */
  it('🔴 les trois tons ont leur règle, et chacune ne tire que des jetons définis en Clair ET en Sombre', () => {
    const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    for (const ton of TONS_URGENCE) {
      const regle = VUE.match(new RegExp(`\\.gst-type-capsule--urg-${ton}\\{([^}]*)\\}`));
      expect(regle, ton).not.toBeNull();
      const corps = regle?.[1] ?? '';
      /* ⚠️ DEUX JETONS, UN FOND ET UN TEXTE : une capsule tamisée, jamais un aplat. */
      expect((corps.match(/var\(--color-svv-[a-z-]+\)/g) ?? []), ton).toHaveLength(2);
      expect(corps, ton).not.toMatch(/#[0-9a-f]{3,8}/i);
      for (const jeton of (corps.match(/--color-svv-[a-z-]+/g) ?? [])) {
        /* 🔴 AU MOINS DEUX DÉFINITIONS : le bloc Clair, et au moins un bloc Sombre. */
        expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, `${ton} · ${jeton}`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });

  /**
   * 🔴🔴 LA PAIRE ORANGE A ÉTÉ CRÉÉE, ET ELLE EXISTE DANS LES TROIS BLOCS DE THÈME : le Clair (`:root`), le choix
   * explicite (`[data-theme='dark']`) et le réglage système (`prefers-color-scheme`). Oublier le troisième est le
   * défaut classique de ce fichier : le thème « système » ne stampe rien sur la racine.
   */
  it('🔴🔴 `--color-svv-orange` et `-soft` existent en Clair et dans les DEUX blocs sombres', () => {
    const GLOBALS = readFileSync('app/globals.css', 'utf8');
    for (const jeton of ['--color-svv-orange', '--color-svv-orange-soft']) {
      expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, jeton).toBe(3);
    }
  });

  /** ⚠️ ET LE GRIS NEUTRE DE L'ABSENCE A SA RÈGLE, lui aussi, et il ne tire que des jetons. */
  it('⚠️ l’absence de niveau a sa règle grise', () => {
    const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    const regle = VUE.match(/\.gst-type-capsule--sans-urgence\{([^}]*)\}/);
    expect(regle).not.toBeNull();
    expect(regle?.[1]).toContain('var(--color-svv-field)');
    expect(regle?.[1]).toContain('var(--color-svv-muted)');
  });
});

describe('🔴🔴 ④ la porte d’écriture accepte le niveau, et le refuse s’il est inconnu', () => {
  /**
   * 🔴🔴 LE NIVEAU SE CORRIGE DÉSORMAIS, ET C'EST NEUF : il ne se posait QU'À LA CRÉATION — exactement le trou
   * qu'avait le type avant le lot CAPSULE-TYPE-EVENEMENT. Ni `ChampsEvenement`, ni le `PATCH` ne le portaient.
   */
  it('🔴🔴 `modifierEvenement` porte `urgence`, et la valide', () => {
    const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(GESTES).toContain('urgence?: string | null;');
    expect(GESTES).toContain("demande.push(['urgence', 'urgence', valeur]);");
    expect(GESTES).toContain(
      "if (brut !== '' && valeur === null) return { ok: false, motif: 'Ce niveau d’urgence n’existe pas.' };");
  });

  /** ⚠️ SANS LA MIGRATION 268, ON N'ÉCRIT PAS UN NIVEAU, et le refus NOMME la mise à jour manquante. */
  it('⚠️ sans la 268, l’écriture du niveau est refusée, et elle dit laquelle manque', () => {
    const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(GESTES).toContain(
      'Le niveau d’urgence n’est pas encore installé sur cette base (mise à jour 268 à appliquer).');
  });

  /**
   * 🔴🔴 LE JOURNAL SAIT DIRE L'AVANT, et c'est la condition du point 3 d'Arno (« Chaque changement est inscrit
   * dans l'historique de l'événement : ancien niveau → nouveau, qui, quand »). La colonne est donc RELUE dans le
   * `SELECT … FOR UPDATE` quand elle est demandée — sinon `valeur_avant` serait vide, et une trace qui ne dit pas
   * l'avant ne raconte rien.
   */
  it('🔴🔴 le `SELECT … FOR UPDATE` relit la colonne quand elle est écrite, pour le journal', () => {
    const GESTES = readFileSync('app/lib/gestion/gestes.ts', 'utf8');
    expect(GESTES).toContain(
      "const relues = (['categorie', 'urgence'] as const).filter((c) => demande.some(([, col]) => col === c));");
    expect(GESTES).toContain("`${nom} modifié sur ${avant[0].reference}`, avant[0][colonne] ?? null, valeur)");
  });

  /** 🔴 ET LES DEUX ÉCRANS PASSENT PAR CETTE PORTE, par aucune autre. */
  it('🔴 la route `PATCH` transmet `urgence` à `modifierEvenement`', () => {
    const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/route.ts', 'utf8');
    expect(ROUTE).toContain(
      'const { objet, demandeurNom, demandeurEmail, adresseLibre, categorie, urgence } = corps;');
    expect(ROUTE).toContain('{ objet, demandeurNom, demandeurEmail, adresseLibre, categorie, urgence }');
  });
});

describe('🔴🔴 ⑤ un seul sélecteur, pour la carte et pour la fiche du bien', () => {
  /**
   * ══ 🔴🔴 ÉPREUVE AMENDÉE LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ═══════════════════════════════════
   *
   * ELLE EXIGEAIT le sélecteur dans DEUX écrans : la carte d'événement ET la fiche du bien (« au même
   * composant », lot URGENCE-EVENEMENT point 3b). ARNO revient dessus le même jour : « le sélecteur d'urgence
   * Normal / Intermédiaire / Urgent (il reste dans la fiche du bien) » fait partie des retraits de la carte.
   *
   * 🔴 CE QUE L'ANCIENNE RÈGLE PROTÉGEAIT TIENT TOUJOURS, et c'est pour cela qu'elle ne disparaît pas : le
   * sélecteur reste UN SEUL composant, importé et jamais recopié. Il n'a plus qu'un appelant — la fiche —, et
   * l'épreuve vérifie désormais les deux faces : il y est, et il n'est plus dans la carte.
   */
  it('🔴🔴 un seul composant, et il n’a plus qu’un appelant : la fiche du bien', () => {
    const BIEN = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
    expect(BIEN).toContain("import { SelecteurUrgence } from './SelecteurUrgence';");
    expect(BIEN).toContain('<SelecteurUrgence ');
    /* 🔴 ET LA CARTE NE LE REND PLUS, NI NE L'IMPORTE : un import orphelin finit par être recâblé. */
    const CARTE = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(CARTE).not.toContain("from './SelecteurUrgence'");
    expect(CARTE).not.toContain('<SelecteurUrgence ');
  });

  /** 🔴 LES TROIS BOUTONS VIENNENT DE LA SOURCE UNIQUE, et leur couleur du ton déclaré avec le niveau. */
  it('🔴 il lit `NIVEAUX_URGENCE`, et peint chaque bouton de son ton', () => {
    const SEL = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');
    expect(SEL).toContain('NIVEAUX_URGENCE.map((n) => (');
    expect(SEL).toContain('gurg-voie--${n.ton}');
    for (const ton of TONS_URGENCE) expect(SEL, ton).toContain(`.gurg-voie--${ton}`);
  });

  /**
   * 🔴 IL N'ÉCRIT RIEN LUI-MÊME : aucune porte d'écriture neuve. C'est l'appelant qui écrit, par la route qu'il
   * employait déjà — même garde, même journal, même réversibilité.
   */
  it('🔴 il ne touche ni au réseau ni à la base', () => {
    const SEL = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');
    expect(SEL).not.toContain('fetch(');
    expect(SEL).not.toMatch(/from '.*Repo'/);
  });

  /**
   * ⚠️ IL PORTE SA FEUILLE AVEC LUI, et il le faut : celle de `CarteVive` vit dans `GestionVue`, celle du bloc
   * « Événements » dans `EvenementsDuBien`. Un composant rendu dans les deux ne peut dépendre d'aucune des deux.
   *
   * ⚠️ ET SA FEUILLE NE TIRE QUE DES JETONS : aucune couleur en dur, donc le thème Sombre marche sans rien dire
   * de lui. Règle de tout le module.
   */
  it('⚠️ sa feuille voyage avec lui, et ne tire que des jetons du thème', () => {
    const SEL = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurUrgence.tsx', 'utf8');
    expect(SEL).toContain('<style>{CSS_SELECTEUR_URGENCE}</style>');
    const feuille = SEL.slice(SEL.indexOf('const CSS_SELECTEUR_URGENCE'));
    expect(feuille).not.toMatch(/#[0-9a-f]{3,8}/i);
    /**
     * ⚠️ 44 px DE CIBLE TACTILE : exigence transverse §15, et elle n'est pas négociable en mode compact.
     *
     * ⚠️ CE QUE CETTE LIGNE DISAIT AVANT, ET POURQUOI ELLE A CHANGÉ : elle cherchait `min-height:44px` DANS
     * cette feuille-ci, parce que `.gurg-voie` y portait son propre dessin. Depuis le lot
     * HARMONIE-BOUTONS-ET-TROMBONE (point 2b), le dessin des trois boutons est celui, commun, de
     * `BoutonPilule` — Arno : « Rends ce format commun […] pour que les trois groupes ne divergent plus ».
     * L'exigence est donc vérifiée LÀ OÙ ELLE VIT MAINTENANT, et on vérifie en plus que cette feuille-ci
     * l'emporte bien avec elle : une cible tactile tenue dans un fichier que le composant n'injecte pas ne
     * serait tenue nulle part.
     */
    expect(feuille).toContain('${CSS_BOUTON_PILULE}');
    const PILULE = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonPilule.tsx', 'utf8');
    expect(PILULE.slice(PILULE.indexOf('export const CSS_BOUTON_PILULE'))).toContain('min-height:44px');
  });
});
