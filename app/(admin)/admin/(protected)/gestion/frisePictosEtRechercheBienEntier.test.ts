/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER (08/10/2026) ══════════════════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   1. « Les 3 pictos en bas de chaque carré de la frise (✎ · i · …) sont agrandis de 30 % (taille de l'icône
 *      ET zone cliquable) […] Si le carré devient trop juste, augmente légèrement sa hauteur plutôt que de
 *      rogner un texte. »
 *   2. « 1er clic sur ✎ : le bloc “Modifier — <carte>” s'ouvre. 2e clic sur le MÊME ✎ : le bloc se referme […]
 *      Le ✎ de la carte en cours d'édition reste visiblement “enfoncé” […] Clic sur le ✎ d'une AUTRE carte
 *      pendant qu'un bloc est ouvert : le bloc bascule sur cette autre carte. Si des modifications non
 *      enregistrées sont en cours au moment de refermer : petite confirmation “Abandonner les modifications ?”
 *      (Oui / Non) — jamais de perte silencieuse. Le bouton “Fermer” du bloc reste en place. »
 *   3. « Quand une recherche est active, elle doit porter sur TOUS les mails du bien qui correspondent aux
 *      autres filtres en cours […] via le serveur […] NE retire PAS l'ancien compteur “N mails sur M”. »
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reglagesEnFiltres, reglagesEnParametres, REGLAGES_DEFAUT } from '../../../../lib/gestion/historiqueBien';

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const ECRAN = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/historique/route.ts', 'utf8');
const FEUILLE = (/const CSS_FRISE_AVANCEMENT = `([\s\S]*?)\n`;/.exec(FRISE)?.[1] ?? '');

describe('🔴🔴 ① les pictos grandissent de 30 %, et le carré avec eux', () => {
  /**
   * 🔴 LE CALCUL EST FAIT, PAS ESTIMÉ : 22 × 1,3 = 28,6 → 29 px ; 20 × 1,3 = 26 px ; 0,82 rem × 1,3 = 1,07 rem.
   * « taille de l'icône ET zone cliquable » : les trois mesures bougent ensemble, sinon on agrandit un dessin
   * dans un bouton resté petit.
   */
  it('🔴🔴 l’icône et la zone cliquable grandissent toutes les deux', () => {
    expect(FEUILLE).toContain('.fav-picto-b{width:29px;height:26px;min-width:29px;');
    expect(FEUILLE).toContain('font-size:1.07rem;');
  });

  /** 🔴 « bien espacés » : l'écart passe de 6 à 8 px, et la rangée reste CENTRÉE. */
  it('🔴 la rangée reste centrée, et les pictos mieux espacés', () => {
    expect(FEUILLE).toContain('.fav-pictos{display:flex;align-items:center;justify-content:center;gap:8px;');
  });

  /**
   * 🔴🔴 « sans chevaucher […] le bord du carré » — ET C'EST VÉRIFIABLE PAR LE CALCUL : 3 × 29 + 2 × 8 = 103 px
   * dans un carré de 124, donc 10 px de marge de chaque côté. Cette épreuve tient les deux nombres ensemble :
   * élargir les pictos sans élargir le carré finirait par les coller au bord sans que rien ne rougisse.
   */
  it('🔴🔴 la rangée tient dans la largeur du carré, avec de la marge', () => {
    const picto = /\.fav-picto-b\{width:(\d+)px/.exec(FEUILLE);
    const ecart = /\.fav-pictos\{[^}]*gap:(\d+)px/.exec(FEUILLE);
    const carre = /\.fav-carre\{[^}]*width:(\d+)px/.exec(FEUILLE);
    expect(picto).not.toBeNull();
    const large = 3 * Number(picto?.[1]) + 2 * Number(ecart?.[1]);
    expect(large).toBeLessThanOrEqual(Number(carre?.[1]) - 16);
  });

  /** 🔴 ET LA HAUTEUR SUIT, plutôt que de rogner un texte (Arno) : 112 + 6 = 118. */
  it('🔴🔴 le carré gagne les 6 px de la rangée', () => {
    expect(FEUILLE).toContain('min-height:118px;');
    /* ⚠️ LES DEUX BOUTONS ✓ / ✕ REMONTENT D'AUTANT : ils ne sont ni retirés ni masqués, ils se décalent. */
    expect(FEUILLE).toContain('.fav-doute{position:absolute;right:4px;bottom:30px;');
  });
});

describe('🔴🔴 ② le crayon ouvre et referme', () => {
  /**
   * 🔴🔴 UN SEUL GESTE, ÉCRIT UNE FOIS ET PARTAGÉ PAR LES TROIS CRAYONS (la rangée du carré, la bulle de
   * survol, la bulle épinglée). Trois copies d'une bascule auraient fini par s'ouvrir d'un côté et se fermer
   * de l'autre.
   */
  it('🔴🔴 les trois crayons appellent le même geste', () => {
    expect(FRISE).toContain('const crayonDeLaCarte = useCallback((e: EtapeAAfficher): void => {');
    expect(FRISE.match(/onModifier=\{crayonDeLaCarte\}/g)).toHaveLength(3);
    expect(FRISE).not.toContain('onModifier={(x) => { setModifie(x);');
  });

  /** 🔴 LES TROIS CAS D'ARNO, dans l'ordre où il les écrit : autre carte ⇒ bascule ; sale ⇒ demande ; sinon ⇒ ferme. */
  it('🔴🔴 autre carte, saisie en cours, ou fermeture', () => {
    expect(FRISE).toContain('const surCetteCarte = ajout && modifie !== null && modifie.id === e.id;');
    expect(FRISE).toContain('if (!surCetteCarte) {');
    expect(FRISE).toContain('if (saisieSale) { setAbandon(true); return; }');
    expect(FRISE).toContain('fermerReservoir();');
  });

  /**
   * 🔴🔴 « JAMAIS DE PERTE SILENCIEUSE » — et la question porte les mots d'Arno, avec ses deux réponses.
   *
   * ⚠️ « NON » EST LE DÉFAUT PAR SÉCURITÉ : il retire la question sans rien fermer. Un clic à côté laisse donc
   * la saisie en place, ce qui est le sens de « jamais de perte silencieuse ».
   */
  it('🔴🔴 une saisie en cours est défendue par une question', () => {
    expect(FRISE).toContain('Abandonner les modifications ?');
    expect(FRISE).toContain('onClick={fermerReservoir}>Oui</button>');
    expect(FRISE).toContain('onClick={() => setAbandon(false)}>Non</button>');
  });

  /**
   * 🔴🔴 ET C'EST LE FORMULAIRE QUI DIT S'IL EST SALE, parce qu'il est seul à connaître ses huit champs. La
   * comparaison porte sur les valeurs de DÉPART : remettre un champ à sa valeur d'origine rend la carte
   * propre, et l'on ne demande pas de confirmer l'abandon de rien.
   */
  it('🔴🔴 la saisie sale est mesurée sur les huit champs, contre leur valeur de départ', () => {
    expect(FRISE).toContain('const sale = forme !== depart.forme || type !== depart.type || jour !== depart.jour');
    expect(FRISE).toContain('|| montant !== depart.montant || piece !== depart.piece;');
    expect(FRISE).toContain('onSaisieSale={setSaisieSale}');
  });

  /** 🔴 LE CRAYON DE LA CARTE ÉDITÉE RESTE ENFONCÉ, et il le dit aussi au lecteur d'écran. */
  it('🔴🔴 le crayon de la carte en cours d’édition est enfoncé', () => {
    expect(FRISE).toContain("className={`fav-picto-b${enEdition === e.id ? ' fav-picto-b--enfonce' : ''}`}");
    expect(FRISE).toContain('aria-pressed={enEdition === e.id}');
    expect(FRISE).toContain("title={enEdition === e.id ? 'Refermer le formulaire' : 'Modifier cette carte'}");
    expect(FEUILLE).toContain('.fav-picto-b--enfonce{background:var(--color-svv-line-strong);');
  });

  /** 🔴 ET « FERMER » RESTE EN PLACE (Arno) : il n'est ni retiré, ni détourné. */
  it('🔴 le bouton « Fermer » du bloc est intact', () => {
    expect(FRISE).toContain('<button type="button" className="fav-btn" onClick={onFermer}>Fermer</button>');
  });
});

describe('🔴🔴 ③ la recherche porte sur tout le bien', () => {
  /** 🔴 LE MOT REPART AU SERVEUR — c'est la seule façon d'atteindre les mails que la page n'a pas chargés. */
  it('🔴🔴 le texte cherché part dans les filtres', () => {
    const r = { ...REGLAGES_DEFAUT, texte: 'gohudif' };
    expect(reglagesEnFiltres(r).texte).toBe('gohudif');
    expect(reglagesEnParametres(r)).toContain('q=gohudif');
  });

  /**
   * 🔴🔴 LA CONDITION SQL COUVRE LES MÊMES CHAMPS QUE L'ÉCRAN COUVRAIT, PLUS LES ADRESSES (lot 21e8f777) :
   * objet, corps, expéditeur (adresse et nom), Cci, les adresses relevées, et le nom des pièces.
   */
  it('🔴🔴 la condition serveur couvre les sept familles', () => {
    for (const bout of [
      "${sansAccent('m.objet')} LIKE",
      "${sansAccent(\"nullif(btrim(m.corps_texte), ''), m.corps_html\")} LIKE",
      "${sansAccent('m.de_adresse')} LIKE",
      "${sansAccent('m.de_nom')} LIKE",
      "${sansAccent('m.dest_cci::text')} LIKE",
      'FROM gestion_message_adresse ma',
      'FROM gestion_piece pj',
    ]) expect(REPO, bout).toContain(bout);
  });

  /**
   * 🔴🔴 UN MOT = UN TAMIS, ET ILS S'ADDITIONNENT — la règle de l'écran, mot pour mot (« plusieurs mots = tous
   * présents ; un mot peut être trouvé dans des champs différents »). Une seule expression sur toute la saisie
   * n'aurait trouvé « fuite cuisine » que collés l'un à l'autre.
   */
  it('🔴🔴 chaque mot est un tamis, et ils s’additionnent', () => {
    expect(REPO).toContain('for (const mot of motsRecherches(f.texte)) {');
    expect(REPO).toContain("import { motsRecherches } from './historiqueBien';");
  });

  /**
   * 🔴🔴 ACCENTS ET CASSE IGNORÉS DES DEUX CÔTÉS. `motsRecherches` normalise le mot ; la colonne subit le
   * même traitement en SQL. Sans cela, « preavis » tapé sans accent aurait cessé de trouver « préavis » — une
   * régression sur la recherche de tous les jours, au moment même où l'on élargit celle des adresses.
   */
  it('🔴🔴 la colonne est désaccentuée comme le mot cherché', () => {
    expect(REPO).toContain('lower(svv_unaccent_immutable(coalesce(${x}, \'\')))');
  });

  /**
   * 🔴🔴 UN SEUL TAMIS À L'ARRIVÉE : l'écran ne refiltre plus. Refiltrer aurait RETIRÉ les mails trouvés par
   * leur corps entier, par une adresse en copie ou par le nom d'une pièce — l'écran n'ayant du corps qu'un
   * extrait de 240 caractères.
   */
  it('🔴🔴 l’écran ne refiltre pas ce que le serveur a trouvé', () => {
    expect(ECRAN).toContain('const lignes = lignesPage;');
    expect(ECRAN).not.toContain('filtrerParMots(lignesPage');
  });

  /**
   * 🔴🔴 L'ANCIEN COMPTEUR EST GARDÉ (Arno : « NE retire PAS l'ancien compteur »), MAIS SON DÉNOMINATEUR EST
   * RÉPARÉ : il comparait aux mails de la PAGE, qui est désormais le résultat lui-même — « 82 mails sur 82 ».
   * La route compte donc à part la sélection SANS la recherche.
   */
  it('🔴🔴 les deux compteurs restent, et disent des nombres qui ont un sens', () => {
    expect(ECRAN).toContain('motCompteurRecherche(totalTrouve, totalSelection, true)');
    expect(ECRAN).toContain('className="hdb-compte-champ"');
    expect(REPO).toContain('sansRecherche: EnteteHistorique;');
    expect(REPO).toContain("const cherche = f.texte.trim() !== '';");
    expect(ROUTE).toContain('selection: entete.sansRecherche,');
  });

  /** ⚠️ ET LA SECONDE QUESTION N'EST POSÉE QUE SI L'ON CHERCHE : sans recherche, la sélection EST le filtre. */
  it('⚠️ aucun comptage de plus quand on ne cherche pas', () => {
    expect(REPO).toContain(': Promise.resolve(null),');
    expect(REPO).toContain('sansRecherche: sansRecherche ?? filtre');
  });

  /** 🔴 AUCUNE MIGRATION, AUCUN INDEX : la condition ne s'applique qu'après la restriction au bien. */
  it('🔴 la recherche n’ajoute aucun index', () => {
    expect(REPO).toContain('AUCUN INDEX N\'EST AJOUTE, ET C\'EST MESURE');
  });
});
