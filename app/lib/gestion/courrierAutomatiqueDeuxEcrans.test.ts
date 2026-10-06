import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  motBasculeAutomatique, phraseCourrierAutomatique, sqlSansCourrierAutomatique,
} from './courrierAutomatique';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — LE COURRIER AUTOMATIQUE, AUX DEUX ÉCRANS ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « ajoute le même interrupteur à l'écran partagé : même libellé, même place, MÊME
 * état partagé entre les deux écrans (activé d'un côté = activé de l'autre). L'ordre chronologique est strict sur
 * l'ensemble. La route /reception accepte le même paramètre que /boite, par le même code SQL : pas de second
 * chemin. »
 *
 * ═══ 🔴🔴 CE QUE L'ÉTAT DES LIEUX A TROUVÉ, ET CE N'ÉTAIT PAS « UN BOUTON MANQUANT » ═════════════════════════════
 *
 * La colonne de réception de l'écran partagé n'avait pas seulement perdu l'interrupteur : elle n'avait AUCUN
 * filtre de courrier automatique. Les deux écrans filtraient donc différemment le même courrier, et l'écran
 * partagé montrait par défaut ce que le plein écran cachait.
 *
 * 🔴 MESURE EN BASE (04/10/2026, hors spam) : 40 177 messages ENVOYÉS dont 24 891 écartés par une règle ; 17 017
 * messages REÇUS dont **ZÉRO** écarté. L'écart réel entre les deux écrans est donc aujourd'hui de zéro mail — et
 * l'interrupteur ne peut rien changer sur une liste de mails reçus.
 *
 * 🔴 LE CÂBLAGE EST POURTANT COMPLET, et c'est ce que ce fichier fige : paramètre `?auto=1`, même prédicat SQL,
 * compteur jumeau `automatiquesIci`, bouton, et état PARTAGÉ. Il parlera le jour où une règle écartera un message
 * reçu. En attendant, le bouton ne s'affiche pas — par l'arbitrage qu'Arno a rendu au point 6 de ce même lot :
 * « zéro ⇒ ni la phrase, ni le bouton », pour que plus personne ne cherche un changement impossible.
 *
 * ⚠️ VÉRIFIÉ SUR LA ROUTE RÉELLE : `?filtre=tous` et `?filtre=tous&auto=1` rendent le même total (16 978) et
 * `automatiquesIci: 0`. Sur « Envoyés », au plein écran, `automatiquesIci` vaut 23 195 et le bandeau s'affiche.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const RECEPTION_REPO = readFileSync('app/lib/gestion/receptionRepo.ts', 'utf8');
const BOITE_REPO = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/reception/route.ts', 'utf8');
const BRC = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

describe('🔴🔴 ① un seul prédicat SQL, lu par les deux dépôts', () => {
  /** 🔴 LE FRAGMENT, DANS LES DEUX SENS. `true` ⇒ chaîne vide : la requête d'avant tout filtre, mot pour mot. */
  it('🔴 le prédicat écarte `exclu_le`, et disparaît quand on inclut tout', () => {
    expect(sqlSansCourrierAutomatique(false, 'm')).toBe('AND m.exclu_le IS NULL');
    expect(sqlSansCourrierAutomatique(false, 'm2')).toBe('AND m2.exclu_le IS NULL');
    expect(sqlSansCourrierAutomatique(true, 'm')).toBe('');
  });

  /**
   * 🔴🔴 LES DEUX DÉPÔTS L'APPELLENT, ET AUCUN NE L'ÉCRIT À LA MAIN. C'est la réponse littérale à « pas de second
   * chemin » : recopié, ce prédicat aurait divergé au premier correctif — et ce lot vient d'en payer deux autres
   * exemples (le nom générique de racine, l'`ON CONFLICT` de la 301).
   */
  it('🔴🔴 la boîte ET la réception passent par le module, jamais par une chaîne à elles', () => {
    for (const [nom, src] of [['boiteRepo', BOITE_REPO], ['receptionRepo', RECEPTION_REPO]] as const) {
      expect(src, nom).toMatch(/import \{[^}]*sqlSansCourrierAutomatique[^}]*\} from '\.\/courrierAutomatique';/);
      expect(src, nom).toContain('sqlSansCourrierAutomatique(');
      /**
       * ⚠️ ET PLUS AUCUNE COPIE **CONDITIONNELLE** du prédicat : c'est l'assertion qui attrapera celle qu'on
       * refera dans six mois. Elle a déjà servi en l'écrivant — elle a trouvé DEUX copies que je venais de
       * manquer, inline dans `sqlCompteBoite`, et le compteur de la boîte aurait donc gardé l'ancien chemin.
       *
       * 🔴 ON NE CHERCHE QUE LA FORME « drapeau + prédicat », PAS `exclu_le IS NULL` tout court. Les autres
       * occurrences répondent à d'AUTRES questions, et les interdire serait une fausse alerte permanente :
       *   · `count(*) FILTER (WHERE exclu_le IS NULL)` — combien de messages sont lisibles dans cet échange ;
       *   · `NOT EXISTS (… ml.exclu_le IS NULL)` — le prédicat de l'ÉTIQUETTE « Courrier automatique », qui est
       *     une liste (les échanges dont AUCUN message n'est lisible), et non l'interrupteur.
       */
      const lignes = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
        .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
      expect(lignes.filter((l) => /exclu_le IS NULL/.test(l) && /inclureAutomatiques|\btous\b/.test(l)), nom)
        .toEqual([]);
    }
  });

  /** 🔴 LA BOÎTE L'APPLIQUE AUX DEUX ÉTAGES du parcours — c'est la règle que le module documente. */
  it('🔴 la boîte filtre `m` ET `m2`', () => {
    expect(BOITE_REPO).toContain("sqlSansCourrierAutomatique(inclureAutomatiques, 'm')");
    expect(BOITE_REPO).toContain("sqlSansCourrierAutomatique(inclureAutomatiques, 'm2')");
  });

  /**
   * 🔴🔴 ET LE COMPTEUR DE LA RÉCEPTION LE PORTE AUSSI. « Un compteur calculé autrement mais équivalent annonce
   * tôt ou tard un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit » : la liste et
   * son total DOIVENT sortir du même prédicat, sinon « 1–30 sur N » désigne une dernière page inatteignable.
   */
  it('🔴🔴 la liste et son total sortent du même prédicat', () => {
    expect(RECEPTION_REPO).toContain("${sqlSansCourrierAutomatique(tous, 'm')}");
    expect((RECEPTION_REPO.match(/sqlSansCourrierAutomatique\(tous, 'm'\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, tous)');
  });
});

describe('🔴🔴 ② la route accepte le MÊME paramètre que /boite', () => {
  /** 🔴 MÊME NOM, MÊME VALEUR RECONNUE. Un `?automatique=true` ici aurait été un second dialecte. */
  it('🔴 `?auto=1`, exactement comme /boite', () => {
    const boite = readFileSync('app/(admin)/api/admin/gestion/boite/route.ts', 'utf8');
    expect(boite).toContain("url.searchParams.get('auto') === '1'");
    expect(ROUTE).toContain("url.searchParams.get('auto') === '1'");
    expect(ROUTE).toContain('inclureAutomatiques:');
    /* ⚠️ ET LE NOM DE L'OPTION EST CELUI DE LA BOÎTE : `inclureAutomatiques`, pas un synonyme. */
    expect(RECEPTION_REPO).toContain('inclureAutomatiques?: boolean;');
  });

  /**
   * 🔴🔴 LE COMPTEUR JUMEAU, PAR LA MÊME MÉTHODE QUE LA BOÎTE : la DIFFÉRENCE des deux comptes, le seul drapeau
   * changeant. C'est ce qui garantit que le nombre annoncé est celui que le bouton ramènerait — et c'est le
   * correctif du point 6, appliqué ici d'avance plutôt que découvert plus tard.
   */
  it('🔴🔴 `automatiquesIci` est la différence des deux comptes, pas un compte global', () => {
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, true)');
    expect(RECEPTION_REPO).toContain('compterMailsRecus(filtre, avec, avecHg, avecCorbeille, false)');
    /* ⚠️ LE DELTA EST SIGNÉ DEPUIS LE POINT 2 DU LOT RECEPTION-COURRIER-AUTO-CONTENU : le `Math.max(0, …)` qui
       vivait ici écrasait les retraits, et la phrase annonçait « rien » sur une liste raccourcie. */
    expect(RECEPTION_REPO).toContain('return avecAuto - sansAuto;');
    expect(RECEPTION_REPO).not.toContain('Math.max(0, avecAuto - sansAuto)');
    /* ⚠️ ET SEULEMENT À LA PREMIÈRE PAGE : deux `count(*)` à chaque « voir plus » se paieraient pour rien. */
    expect(RECEPTION_REPO).toContain('automatiquesIci: curseur !== null ? null : await (async () => {');
  });
});

describe('🔴🔴 ③ même libellé, même place, même état', () => {
  /** 🔴 LES MOTS VIENNENT DU MODULE, DANS LES DEUX ÉCRANS. « Même libellé » ne se tient pas autrement. */
  it('🔴🔴 les mots viennent du module, dans les deux écrans', () => {
    for (const [nom, src] of [['BoiteMail', BTE], ['BoiteReception', BRC]] as const) {
      expect(src, nom).toContain('phraseCourrierAutomatique');
      expect(src, nom).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/gestion\/courrierAutomatique';/);
    }
    /**
     * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 2 — LE MOT DE L'INTERRUPTEUR N'EST PLUS QUE DANS LE PLEIN ÉCRAN ═══════
     *
     * ACCORD D'ARNO (06/10/2026) : le lien est RETIRÉ de l'écran partagé. La PHRASE reste dans les deux — elle
     * renseigne (« N mails ne sont pas affichés ici ») au lieu de proposer un geste.
     */
    expect(BTE).toContain('motBasculeAutomatique');
    expect(BRC).not.toContain('motBasculeAutomatique');
    /* ⚠️ ET PLUS AUCUNE FORMULATION EN DUR dans le plein écran : elle y était, en JSX. */
    expect(BTE).not.toContain('Afficher aussi le courrier automatique<');
    expect(BTE).not.toContain("'Masquer le courrier automatique'");
  });

  /**
   * ══ 🔴🔴 LA PHRASE A ÉTÉ RÉÉCRITE AU LOT RECEPTION-COURRIER-AUTO-CONTENU, POINT 2 ══════════════════════════
   *
   * CE CAS TENAIT : « la phrase n'a pas changé d'un caractère » — elle disait « N échanges ne contiennent que du
   * courrier automatique et ne sont pas affichés ici ». C'était vrai pour un AJOUT, et faux pour un RETRAIT : sous
   * « À classer », l'interrupteur retire 250 conversations, et cette phrase-là ne sait pas le dire.
   *
   * 🔴 DÉCISION D'ARNO (05/10/2026) : « le nombre compte dans les deux sens (ajouts et retraits), avec une phrase
   * vraie dans chaque cas (“le courrier automatique ajoute N conversations” / “retire N conversations”) ».
   *
   * ⚠️ ET LE MOT « conversations » EST CELUI DE L'ÉCRAN : le compteur du plein écran dit « 10 244 conversations ».
   * « échanges » était le mot du dépôt, pas celui qu'Arno lit.
   */
  it('🔴🔴 la phrase dit AJOUTE ou RETIRE, et c’est vrai dans les quatre cas', () => {
    expect(phraseCourrierAutomatique(23195, false, 'echange')).toBe(
      'Le courrier automatique ajoute 23195 conversations à cette liste. Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(23195, true, 'echange')).toBe(
      'Le courrier automatique est inclus : il ajoute 23195 conversations à cette liste.');
    /* 🔴🔴 LE RETRAIT, c'est-à-dire le cas que l'ancienne phrase ne pouvait pas dire (« À classer », −250). */
    expect(phraseCourrierAutomatique(-250, false, 'echange')).toBe(
      'Le courrier automatique retire 250 conversations de cette liste. Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(-250, true, 'echange')).toBe(
      'Le courrier automatique est inclus : il retire 250 conversations de cette liste.');
    /* ⚠️ LE SINGULIER AUSSI, dans les deux sens. */
    expect(phraseCourrierAutomatique(1, false, 'echange')).toBe(
      'Le courrier automatique ajoute 1 conversation à cette liste. Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(-1, true, 'echange')).toBe(
      'Le courrier automatique est inclus : il retire 1 conversation de cette liste.');
  });

  /**
   * 🔴 ZÉRO ⇒ CHAÎNE VIDE : il n'y a rien à dire, et les deux écrans n'affichent alors pas la phrase. Le LIEN,
   * lui, reste offert — c'est la correction du lot RECEPTION-COURRIER-AUTO-LIEN.
   */
  it('🔴 un delta nul ne dit rien du tout', () => {
    expect(phraseCourrierAutomatique(0, false, 'echange')).toBe('');
    expect(phraseCourrierAutomatique(0, true, 'mail')).toBe('');
  });

  /** 🔴 ET L'UNITÉ SUIT L'ÉCRAN : la colonne compte des MAILS, pas des conversations. */
  it('🔴 la colonne de réception parle de mails', () => {
    expect(phraseCourrierAutomatique(3, false, 'mail')).toBe(
      'Le courrier automatique ajoute 3 mails à cette liste. Rien n’est supprimé.');
    expect(phraseCourrierAutomatique(1, true, 'mail')).toBe(
      'Le courrier automatique est inclus : il ajoute 1 mail à cette liste.');
    expect(phraseCourrierAutomatique(-4, false, 'mail')).toBe(
      'Le courrier automatique retire 4 mails de cette liste. Rien n’est supprimé.');
    expect(BRC).toContain("phraseCourrierAutomatique(etat.automatiquesIci, false, 'mail')");
  });

  /** 🔴 LE MOT DU BOUTON DIT CE QUE LE CLIC VA FAIRE, jamais l'état où l'on est. */
  it('🔴 le bouton annonce le geste', () => {
    expect(motBasculeAutomatique(false)).toBe('Afficher aussi le courrier automatique');
    expect(motBasculeAutomatique(true)).toBe('Masquer le courrier automatique');
  });

  /**
   * 🔴🔴 L'ÉTAT EST LA MÊME VARIABLE, pas une copie. `GestionVue` rend LES DEUX colonnes et tient `auto` : il le
   * passe au plein écran depuis toujours, et désormais à la colonne. Un `useState` local aurait donné deux
   * interrupteurs capables de se contredire — et c'est l'un des deux qu'on aurait cru.
   */
  it('🔴🔴 un seul `useState`, et il ne part plus que vers le PLEIN ÉCRAN', () => {
    expect(VUE).toContain('const [auto, setAuto] = useState(false);');
    /**
     * ══ 🔴🔴 CE COMPTE EST PASSÉ DE 2 À 1 — LOT ACCUEIL-GESTION, POINT 2 ═════════════════════════════════════
     *
     * L'état était passé AUX DEUX colonnes pour qu'elles partagent un seul interrupteur (lot
     * RENOMMER-PARTOUT-ET-FINITIONS, point 8). Arno retire l'interrupteur de l'écran partagé : cette colonne n'a
     * donc plus d'état à recevoir. Le lui passer quand même, pour qu'elle l'ignore, se relirait six mois plus
     * tard comme un défaut.
     */
    expect((VUE.match(/auto=\{auto\} onAuto=\{setAuto\}/g) ?? [])).toHaveLength(1);
    /**
     * 🔴 ET LA COLONNE N'EN FABRIQUE PAS UN À ELLE : elle n'a plus d'interrupteur du tout.
     *
     * ⚠️ ON LIT LE CODE, COMMENTAIRES RETIRÉS. L'encadré de ce fichier EXPLIQUE que `onAuto` est parti — chercher
     * le mot dans le fichier entier ferait donc rougir l'épreuve à cause de sa propre explication, et pousserait
     * à effacer l'explication plutôt qu'à garder la règle.
     */
    const brcCode = BRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(brcCode).not.toContain('onAuto');
    expect(brcCode).not.toContain('const [auto, setAuto] = useState');
  });

  /**
   * ══ 🔴🔴 CE VERDICT A CHANGÉ — LOT RECEPTION-COURRIER-AUTO-LIEN ═══════════════════════════════════════════════
   *
   * CETTE ÉPREUVE TENAIT : « ni phrase ni bouton quand le nombre est nul » — l'arbitrage d'Arno au point 6 du lot
   * RENOMMER-PARTOUT-ET-FINITIONS. Elle a produit exactement ce qu'elle disait, et c'est devenu le défaut qu'il
   * signale le 05/10/2026 : « le lien rouge au-dessus de “Chercher” n'est plus là, en plein écran comme en écran
   * partagé ». Aucun message REÇU n'étant écarté par une règle, le nombre vaut zéro sur les deux écrans de
   * Réception — et le lien s'est tu là où on le cherche.
   *
   * 🔴 NOUVELLE RÈGLE D'ARNO : le lien revient, sans condition de nombre. La PHRASE, elle, garde la sienne — un
   * nombre global affiché sous une liste qui ne l'ajouterait jamais était précisément sa plainte au point 6.
   *
   * ⚠️ `onAuto` ABSENT ⇒ TOUJOURS PAS DE BOUTON : on ne propose jamais un geste qui n'irait nulle part. Cette
   * moitié-là de la règle ne bouge pas.
   */
  it('🔴🔴 sur l’écran partagé, il ne reste QUE la phrase, et elle dépend du nombre', () => {
    /**
     * ⚠️ `!== 0` ET NON `> 0` : le delta est signé depuis le lot RECEPTION-COURRIER-AUTO-CONTENU (point 2), et un
     * retrait se dit autant qu'un ajout. Cette moitié-là ne bouge pas.
     *
     * 🔴 LOT ACCUEIL-GESTION, POINT 2 — la phrase est désormais lue avec `false` EN DUR : cette colonne n'a plus
     * d'état d'interrupteur, et elle montre toujours la Réception sans courrier automatique.
     */
    expect(BRC).toContain('etat.v === \'ok\' && etat.automatiquesIci !== null && etat.automatiquesIci !== 0 && (');
    expect(BRC).toContain("phraseCourrierAutomatique(etat.automatiquesIci, false, 'mail')");
  });

  /**
   * ══ 🔴🔴 LA GARDE DEMANDÉE PAR ARNO : « un test qui échoue si le lien disparaît de l'un des deux écrans » ════
   *
   * 🔴 ELLE REGARDE LES DEUX FICHIERS, ET LES MÊMES TROIS CHOSES DANS CHACUN : le MOT (qui vient du module
   * partagé), le STYLE (`gst-lien-bouton`, le lien rouge qu'Arno nomme) et l'ÉTAT ANNONCÉ (`aria-pressed`). Un
   * lien qui perdrait l'un des trois ne serait plus celui qu'il décrit.
   *
   * 🔴 ET ELLE REFUSE TOUTE CONDITION DE NOMBRE AUTOUR DU BOUTON — c'est la régression même : le bouton était
   * encore écrit, il ne s'affichait simplement plus. Une épreuve qui se contenterait de chercher le mot dans le
   * fichier serait passée au vert pendant toute la disparition.
   */
  it('🔴🔴 LE LIEN EXISTE EN PLEIN ÉCRAN, ET NULLE PART AILLEURS', () => {
    /**
     * ══ 🔴🔴 CETTE ÉPREUVE A CHANGÉ DE VERDICT — LOT ACCUEIL-GESTION, POINT 2 (06/10/2026) ════════════════════
     *
     * ELLE TENAIT : « le lien existe sur LES DEUX écrans, et rien ne le conditionne à un nombre » — la garde
     * qu'Arno avait demandée le 05/10 après l'avoir vu disparaître des deux.
     *
     * 🔴 ACCORD D'ARNO DU 06/10, mot pour mot : « sur l'écran partagé, le lien est RETIRÉ, et la colonne mail
     * affiche toujours la Réception SANS courrier automatique, quel que soit l'état choisi en plein écran. En
     * plein écran, le lien et son comportement restent INCHANGÉS. » La garde n'est donc pas relâchée : elle est
     * RETOURNÉE, et elle exige maintenant les deux moitiés de la décision — présent d'un côté, absent de
     * l'autre. Un retour silencieux du lien dans la colonne ferait rougir cette épreuve.
     */
    expect(BTE).toContain('motBasculeAutomatique(auto)');
    expect(BTE).toContain('className="gst-lien-bouton" aria-pressed={auto}');
    /* 🔴 LE PLEIN ÉCRAN : rien n'a bougé. La condition ne retient que la recherche et l'étiquette imposée. */
    expect(BTE).toContain('{!cherche && impose === null && (');
    expect(BTE).not.toContain('impose === null && etat.comptes !== null && automatiquesAffiches > 0');
    /* 🔴🔴 L'ÉCRAN PARTAGÉ : plus de bouton, plus d'état, plus de paramètre `?auto=1`. */
    expect(BRC).not.toContain('motBasculeAutomatique(auto)');
    expect(BRC).not.toContain('aria-pressed={auto}');
    expect(BRC).not.toContain("auto: '1'");
  });

  /**
   * 🔴🔴 L'ORDRE CHRONOLOGIQUE RESTE STRICT SUR L'ENSEMBLE (demande d'Arno). Le drapeau voyage donc avec la page
   * SUIVANTE : sans lui, « voir plus » rendrait une page filtrée autrement que celle qu'on lit, et des mails
   * apparaîtraient ou manqueraient au milieu de la liste.
   */
  it('🔴🔴 « voir plus » garde le même filtre que la page affichée', () => {
    /**
     * 🔴 LOT ACCUEIL-GESTION, POINT 2 — LES DEUX PAGES SONT « SANS COURRIER AUTOMATIQUE », et la règle tient
     * toujours : la page suivante est filtrée comme celle qu'on lit. Sans cela, des mails apparaîtraient au
     * milieu de la liste. Simplement, il n'y a plus qu'un seul filtre possible ici.
     */
    expect(BRC).toContain('filtre, avant: etat.suivant.recuLe, apres: etat.suivant.messageId,');
    expect(BRC).toContain('void charger(filtre);');
    expect(BRC).toContain('}, [charger, filtre]);');
  });
});
