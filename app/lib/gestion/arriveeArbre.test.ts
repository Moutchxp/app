import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  arriveeArbre, brancheAtteignable, cheminEcrit, defilementPourCentrer, messageAncetreInaccessible,
  messageDocumentAbsent, messageRacineInconnue, MOT_CHEMIN_DOCUMENT, racineRemontee,
  type EtapeArbre, type MaillonRemonte,
} from './arriveeArbre';
import { RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE } from './cibleDepot';

/**
 * ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE — LES ÉPREUVES DE L'ARRIVÉE ════════════════════════════════════
 *
 * Les quatre cas qu'Arno a nommés : Drive partagé, Mon Drive, fichier à la racine, ancêtre inaccessible. Puis
 * l'état déplié, l'élément surligné et le défilement demandé — éprouvés ici sur le CALCUL, et dans
 * `SelecteurFichierDrive.arrivee.test.ts` sur le CÂBLAGE de l'écran.
 */

const maillon = (o: Partial<MaillonRemonte> = {}): MaillonRemonte => ({
  id: 'F1', nom: 'un dossier', parentId: null, ...o,
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 SOUS QUELLE RACINE ? — la question qui décide par où entrer
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la racine d’une chaîne remontée', () => {
  /**
   * 🔴 LA TÊTE PORTE `driveId` ⇒ DRIVE PARTAGÉ. Mesuré : l'API renseigne `driveId` sur TOUT élément d'un Drive
   * partagé, sa racine comprise — et c'est la seule marque fiable, le NOM de cette racine étant le mot générique
   * « Drive » (voir `nommerLaRacine`).
   */
  it('🔴 un Drive partagé se reconnaît à `driveId`, jamais au nom', () => {
    const chaine = [
      maillon({ id: 'DOC_DOSSIER', nom: '_MESURE nom immediat', parentId: 'TEST', driveId: 'TEST' }),
      maillon({ id: 'TEST', nom: 'Drive', parentId: null, driveId: 'TEST' }),
    ];
    expect(racineRemontee(chaine)).toBe('drive_partage');
  });

  /** 🔴 PAS DE `driveId` ET PLUS DE PARENT ⇒ « MON DRIVE ». C'est le seul endroit sans identifiant de Drive. */
  it('🔴 « Mon Drive » se reconnaît à l’ABSENCE de `driveId`', () => {
    const chaine = [
      maillon({ id: 'SOUS', nom: 'Factures', parentId: '0AKreel' }),
      maillon({ id: '0AKreel', nom: 'Mon Drive', parentId: null }),
    ];
    expect(racineRemontee(chaine)).toBe('mon_drive');
    // ⚠️ Une chaîne d'un seul maillon (le fichier est à la racine de Mon Drive) répond pareil.
    expect(racineRemontee([maillon({ id: '0AKreel', nom: 'My Drive', parentId: null })])).toBe('mon_drive');
  });

  /**
   * 🔴🔴 LA CHAÎNE TROUÉE SE DIT TELLE QUELLE. `chaineParents` s'arrête au premier `files.get` refusé : la tête
   * porte alors ENCORE un `parentId`, preuve qu'il existait un cran au-dessus qu'on n'a pas lu. C'est le cas de
   * « Partagés avec moi », dont le dossier a un parent chez son propriétaire.
   *
   * 🔴 CONCLURE « Mon Drive » ICI AURAIT ÉTÉ LE PIRE DES DÉFAUTS : on aurait déplié une branche FAUSSE avec
   * l'aplomb d'une branche juste, et sans un mot.
   */
  it('🔴🔴 une chaîne qui n’atteint pas le haut ne conclut RIEN', () => {
    expect(racineRemontee([maillon({ id: 'PARTAGE', nom: 'Dossier d’un tiers', parentId: 'CHEZ_LUI' })])).toBeNull();
    expect(racineRemontee([])).toBeNull();
    // ⚠️ Un `parentId` vide ou blanc vaut « plus de parent » : la route le normalise ainsi partout ailleurs.
    expect(racineRemontee([maillon({ parentId: '' })])).toBe('mon_drive');
    expect(racineRemontee([maillon({ parentId: '   ' })])).toBe('mon_drive');
  });

  /** ⚠️ `driveId` VIDE N'EST PAS `driveId` : une chaîne vide n'est pas un identifiant de Drive. */
  it('⚠️ un `driveId` vide ne fait pas un Drive partagé', () => {
    expect(racineRemontee([maillon({ driveId: '' })])).toBe('mon_drive');
    expect(racineRemontee([maillon({ driveId: null })])).toBe('mon_drive');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE CHEMIN DES ANCÊTRES — les quatre cas d'Arno
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le chemin à déplier', () => {
  /**
   * 🔴 DRIVE PARTAGÉ : le cran « Drives partagés » est AJOUTÉ EN TÊTE. La racine du Drive (« Test ») n'est pas une
   * ligne de la racine du sélecteur — elle est un ENFANT du regroupement. Sans ce cran, on déplierait « Test »
   * sans avoir ouvert ce qui le contient, et la branche resterait invisible.
   *
   * 🔴 C'EST AUSSI CE CRAN QUI FAIT PARAÎTRE LES AUTRES DRIVES repliés à côté — « Catherine, COMPTABILITE,
   * Direction, GESTION LOCATIVE… », qu'Arno demande nommément.
   */
  it('🔴 Drive partagé : « Drives partagés » › Test › _MESURE nom immediat', () => {
    const chaine: EtapeArbre[] = [{ id: 'TEST', nom: 'Test' }, { id: 'MES', nom: '_MESURE nom immediat' }];
    const a = arriveeArbre(chaine, 'drive_partage');
    expect(a).not.toBeNull();
    expect(a?.chemin).toEqual([
      { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' },
      { id: 'TEST', nom: 'Test' },
      { id: 'MES', nom: '_MESURE nom immediat' },
    ]);
    expect(cheminEcrit(a?.chemin ?? [])).toBe('Drives partagés › Test › _MESURE nom immediat');
  });

  /**
   * ══ 🔴🔴 LE PIÈGE MESURÉ — « MON DRIVE » PORTE DEUX IDENTIFIANTS ══════════════════════════════════════════════
   *
   * La liste du sélecteur affiche « Mon Drive » sous l'identifiant `root` (le mot de Google, que l'API accepte
   * comme parent). Mais `chaineParents` remonte par `files.get` et rend l'identifiant RÉEL du dossier racine.
   *
   * 🔴 DÉPLIER L'IDENTIFIANT DE LA CHAÎNE N'AURAIT RIEN OUVERT — aucune ligne ne le porte — et le défaut aurait
   * été MUET : un arbre qui s'ouvre sur la racine et ne descend jamais. Il n'aurait touché QUE « Mon Drive »,
   * donc pas les Drives partagés où vit presque tout le cabinet : invisible aux essais.
   */
  it('🔴🔴 Mon Drive : la tête réelle est remplacée par `root`', () => {
    const chaine: EtapeArbre[] = [{ id: '0AKreel', nom: 'My Drive' }, { id: 'FACT', nom: 'Factures' }];
    const a = arriveeArbre(chaine, 'mon_drive');
    expect(a?.chemin).toEqual([
      { id: RACINE_MON_DRIVE, nom: 'Mon Drive' },
      { id: 'FACT', nom: 'Factures' },
    ]);
    // 🔴 L'identifiant réel a DISPARU du chemin : c'est lui qui n'aurait rien ouvert.
    expect((a?.chemin ?? []).some((e) => e.id === '0AKreel')).toBe(false);
    // ⚠️ ET LE NOM VIENT DE LA LISTE, pas de Google : « My Drive » aurait été affiché en anglais.
    expect(a?.chemin[0].nom).toBe('Mon Drive');
  });

  /** 🔴 UN FICHIER À LA RACINE DE MON DRIVE : le chemin fait UN cran, et c'est `root`. */
  it('🔴 fichier à la racine de Mon Drive : un seul cran', () => {
    const a = arriveeArbre([{ id: '0AKreel', nom: 'Mon Drive' }], 'mon_drive');
    expect(a?.chemin).toEqual([{ id: RACINE_MON_DRIVE, nom: 'Mon Drive' }]);
    expect(a?.profondeurDocument).toBe(1);
  });

  /** 🔴 UN FICHIER À LA RACINE D'UN DRIVE PARTAGÉ : « Drives partagés » › le Drive, et rien de plus. */
  it('🔴 fichier à la racine d’un Drive partagé : deux crans', () => {
    const a = arriveeArbre([{ id: 'TEST', nom: 'Test' }], 'drive_partage');
    expect(a?.chemin).toEqual([
      { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' },
      { id: 'TEST', nom: 'Test' },
    ]);
    expect(a?.profondeurDocument).toBe(2);
  });

  /**
   * 🔴🔴 LA PROFONDEUR DU DOCUMENT EST RENDUE, et elle ne sert pas à décorer : l'aplatissement de l'arbre est
   * BORNÉ (`PROFONDEUR_MAX = 6`, pour qu'un dépliage en cascade ne produise pas une liste illisible). Le Drive du
   * cabinet fait treize niveaux : sans desserrer la borne POUR CETTE BRANCHE, la liste se serait arrêtée avant le
   * document, et l'arrivée aurait échoué sur les chemins profonds — les seuls où elle sert vraiment.
   */
  it('🔴🔴 la profondeur du document compte les crans, racine à 0', () => {
    const chaine: EtapeArbre[] = Array.from({ length: 9 }, (_, i) => ({ id: `N${i}`, nom: `niveau ${i}` }));
    const a = arriveeArbre(chaine, 'drive_partage');
    // 1 (le regroupement) + 9 crans ⇒ le document est la 11e ligne de la branche, soit la profondeur 10.
    expect(a?.chemin).toHaveLength(10);
    expect(a?.profondeurDocument).toBe(10);
  });

  /** ⚠️ RIEN À DÉPLIER quand on ne sait pas par où entrer : l'appelant ouvre dans le dossier, avec un message. */
  it('⚠️ racine indéterminée ou chaîne vide : aucune arrivée', () => {
    expect(arriveeArbre([{ id: 'A', nom: 'a' }], null)).toBeNull();
    expect(arriveeArbre([], 'drive_partage')).toBeNull();
    expect(arriveeArbre([], 'mon_drive')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 L'ÉTAT DÉPLIÉ — et ce qu'on fait quand un ancêtre se refuse
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’état déplié', () => {
  const chemin: EtapeArbre[] = [
    { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' },
    { id: 'TEST', nom: 'Test' },
    { id: 'MES', nom: '_MESURE nom immediat' },
  ];

  /** 🔴 TOUT LE CHEMIN EST DÉPLIÉ — y compris le dossier qui CONTIENT le document, sinon le document ne paraît pas. */
  it('🔴 tous les crans sont dépliés, le dernier compris', () => {
    const b = brancheAtteignable(chemin, new Set([RACINE_DRIVES_PARTAGES, 'TEST', 'MES']));
    expect(b.atteints).toEqual(chemin);
    expect(b.premierManquant).toBeNull();
  });

  /**
   * 🔴🔴 ON S'ARRÊTE AU PREMIER TROU, ET PAS AU DERNIER SUCCÈS. Un dossier dont on n'a pas lu le contenu ne peut
   * pas montrer le suivant : garder les crans d'après aurait marqué des dossiers « ouverts » sous lesquels il n'y
   * a RIEN — exactement le défaut du 29/09/2026, qui obligeait à cliquer deux fois sur le triangle.
   */
  it('🔴🔴 un ancêtre inaccessible arrête la branche, et il est NOMMÉ', () => {
    // « Test » refusé : on garde le regroupement, et l'on n'ouvre pas « _MESURE » même si on l'avait lu.
    const b = brancheAtteignable(chemin, new Set([RACINE_DRIVES_PARTAGES, 'MES']));
    expect(b.atteints).toEqual([{ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' }]);
    expect(b.premierManquant).toEqual({ id: 'TEST', nom: 'Test' });
  });

  /** ⚠️ RIEN DE LU : la branche est vide, et le premier manquant est la racine elle-même. Pas d'écran vide pour autant. */
  it('⚠️ rien de lu : la branche est vide et le dit', () => {
    const b = brancheAtteignable(chemin, new Set());
    expect(b.atteints).toEqual([]);
    expect(b.premierManquant).toEqual({ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴 LES MOTS — trois situations, trois phrases ; jamais un « ça n'a pas marché »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les messages de repli', () => {
  /**
   * 🔴 LES TROIS SE RÉPARENT DIFFÉREMMENT, et c'est pourquoi ils ne disent pas la même chose : un ancêtre refusé
   * est une question de DROITS, un document absent est un déplacement, une chaîne irremontable est un chemin
   * qu'on ne sait pas situer. Les confondre ferait chercher la panne au mauvais endroit.
   */
  it('🔴 chaque repli nomme ce qui a manqué', () => {
    expect(messageAncetreInaccessible('Test')).toContain('« Test »');
    expect(messageAncetreInaccessible('Test')).toContain('niveau le plus profond');
    expect(messageDocumentAbsent('_MESURE nom immediat')).toContain('« _MESURE nom immediat »');
    expect(messageRacineInconnue('Quittances')).toContain('« Quittances »');
    expect(messageRacineInconnue(null)).toContain('le dossier qui le contient');
  });

  /** ⚠️ TROIS PHRASES DISTINCTES : si deux se confondaient, l'une des deux causes serait invisible. */
  it('⚠️ les trois phrases sont bien trois', () => {
    const trois = new Set([
      messageAncetreInaccessible('X'), messageDocumentAbsent('X'), messageRacineInconnue('X'),
    ]);
    expect(trois.size).toBe(3);
  });

  /** ⚠️ AUCUNE APOSTROPHE DROITE dans les mots affichés : le dépôt écrit les textes avec l'apostrophe typographique. */
  it('⚠️ les mots sont écrits avec l’apostrophe typographique', () => {
    for (const m of [messageAncetreInaccessible('X'), messageDocumentAbsent('X'), messageRacineInconnue('X')]) {
      expect(m, m).not.toContain("'");
    }
  });

  /** 🔴 L'ÉTIQUETTE DIT DE QUOI C'EST LE CHEMIN, et non « où l'on est » — voir l'encadré de l'écran. */
  it('🔴 l’étiquette du bandeau parle du DOCUMENT', () => {
    expect(MOT_CHEMIN_DOCUMENT).toBe('Ce document est ici');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LE DÉFILEMENT DEMANDÉ — « centré »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le défilement qui centre', () => {
  const H = 28;   // HAUTEUR_LIGNE
  const VUE = 560; // 20 lignes à l'écran

  /**
   * 🔴 LE CENTRE SE CALCULE, IL NE S'OBTIENT PAS PAR `scrollIntoView` : la liste est VIRTUALISÉE, donc la ligne
   * visée n'existe pas encore dans le document tant qu'on n'a pas défilé jusqu'à elle. Il n'y a rien à faire
   * défiler « jusqu'à ».
   */
  it('🔴 une ligne au milieu se retrouve au centre de la vue', () => {
    // Ligne 50 sur 200 : son milieu est à 50*28 + 14 = 1414 ; centré ⇒ 1414 - 280 = 1134.
    expect(defilementPourCentrer(50, 200, VUE, H)).toBe(1134);
  });

  /**
   * ⚠️ BORNÉ EN HAUT. Une ligne en tête ne PEUT pas être centrée : il n'y a rien au-dessus de la première. Sans
   * cette borne on demanderait un défilement négatif, que le navigateur ramène à 0 en silence — donc le même
   * résultat, mais obtenu sans le savoir, et impossible à éprouver.
   */
  it('⚠️ une ligne en tête ne descend pas sous zéro', () => {
    expect(defilementPourCentrer(0, 200, VUE, H)).toBe(0);
    expect(defilementPourCentrer(3, 200, VUE, H)).toBe(0);
  });

  /** ⚠️ BORNÉ EN BAS : une ligne en queue se colle au bas, sans demander à défiler au-delà du contenu. */
  it('⚠️ une ligne en queue se colle au bas', () => {
    // 200 lignes = 5600 px de contenu, 560 px de vue ⇒ le défilement maximal est 5040.
    expect(defilementPourCentrer(199, 200, VUE, H)).toBe(5040);
  });

  /** ⚠️ UNE LISTE PLUS COURTE QUE LA VUE NE DÉFILE PAS DU TOUT : le maximum est alors zéro. */
  it('⚠️ une liste plus courte que la vue ne défile pas', () => {
    expect(defilementPourCentrer(2, 5, VUE, H)).toBe(0);
  });

  /** ⚠️ ET LES CAS DÉGÉNÉRÉS NE RENVOIENT JAMAIS `NaN` : un `scrollTop` NaN est ignoré SANS erreur. */
  it('⚠️ aucun cas dégénéré ne rend NaN', () => {
    for (const v of [
      defilementPourCentrer(-1, 200, VUE, H),
      defilementPourCentrer(5, 200, VUE, 0),
      defilementPourCentrer(5, 0, VUE, H),
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔒 LES PROPRIÉTÉS DU CODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 les propriétés du module', () => {
  const code = readFileSync('app/lib/gestion/arriveeArbre.ts', 'utf8');

  /**
   * 🔒🔒 IL EST IMPORTÉ PAR UN COMPOSANT `'use client'` : pas un `fetch`, pas une ligne de SQL, pas de React.
   * C'est la règle du dépôt depuis l'incident du 24/09/2026 — un module client qui tirait `pg` → `dns` a empêché
   * TOUTE l'application de se construire, page de connexion comprise, avec 8 800 tests au vert.
   */
  it('🔒🔒 ni réseau, ni base, ni React', () => {
    for (const mot of ['fetch(', 'SELECT ', 'UPDATE ', 'useState', 'useEffect', "from 'react'", 'server-only']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /**
   * 🔴 LES DEUX IDENTIFIANTS DE RACINE VIENNENT DE `cibleDepot`, et ne sont pas recopiés : ce sont les MÊMES mots
   * que ceux que la route affiche à la racine du sélecteur, et que le serveur refuse comme cible de dépôt. Les
   * réécrire ici aurait donné deux vérités, et c'est celle qu'on relit le moins qui aurait gardé l'ancienne.
   */
  it('🔴 les identifiants de racine ne sont pas recopiés', () => {
    expect(code).toContain("import { RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE } from './cibleDepot'");
    expect(code).not.toContain("'svav:drives'");
    expect(code).not.toContain("'root'");
  });
});
