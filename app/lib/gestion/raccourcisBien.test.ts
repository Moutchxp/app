import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adresseDossierDrive, adresseHistoriqueDuBien, idDossierDrive,
  AIDE_DRIVE_ABSENT, AIDE_DRIVE_DU_BIEN, AIDE_HISTORIQUE_DU_BIEN,
  MOT_DRIVE_ABSENT, MOT_DRIVE_DU_BIEN, MOT_HISTORIQUE_DU_BIEN,
} from './ficheRattachement';
import { titreFenetre } from './rangementDrive';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LES RACCOURCIS DE LA CARTE D'UN BIEN ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « a) “Ouvrir le Drive du bien” ouvre NOTRE outil Drive (la fenêtre Drive de l'app)
 * positionné directement dans le dossier Drive du bien (arbre déplié jusqu'à lui). Si le dossier est sous
 * “Documents clients scannés” : consultation seule (voir, télécharger), aucune action d'écriture possible (gardes
 * existantes, refus serveur). Si le bien n'a pas de dossier connu : bouton grisé “Dossier Drive non renseigné”.
 * b) “Historique du bien” ouvre la fiche du bien avec son historique (“Vie du bien”), dans l'application. »
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① les deux ADRESSES et les deux MOTS vivent dans le module pur, et l'identifiant interne n'est pas le n° de lot ;
 *   ② la fenêtre ouvre le composant Drive EXISTANT, en mode « consulter », sur le dossier du bien ;
 *   ③ elle ne lui passe AUCUNE permission : la consultation seule reste le refus du SERVEUR ;
 *   ④ le nouveau mode ne retire rien aux deux modes existants ;
 *   ⑤ les deux boutons se partagent la largeur, s'empilent sur mobile, et n'écrivent aucune couleur en dur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const FENETRE = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
const DRIVE = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
/** Le code SEUL : un mot cité dans un encadré ne prouve ni n'infirme rien. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
  .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
const CODE_FENETRE = code(FENETRE);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LES MOTS, ET LES DEUX ADRESSES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① les mots et les adresses, dans le module pur', () => {
  it('🔴🔴 les trois libellés sont ceux d’Arno, mot pour mot', () => {
    expect(MOT_DRIVE_DU_BIEN).toBe('Ouvrir le Drive du bien');
    expect(MOT_DRIVE_ABSENT).toBe('Dossier Drive non renseigné');
    expect(MOT_HISTORIQUE_DU_BIEN).toBe('Historique du bien');
    /* 🔴 CHAQUE BOUTON A SON AIDE, et elle dit OÙ l'on va — y compris celle du bouton éteint. */
    expect(AIDE_DRIVE_DU_BIEN).toContain('dossier Drive de ce bien');
    expect(AIDE_DRIVE_ABSENT).toContain('Aucun dossier Drive');
    expect(AIDE_HISTORIQUE_DU_BIEN).toContain('Vie du bien');
  });

  /**
   * 🔴🔴 L'IDENTIFIANT INTERNE, JAMAIS LE N° DE LOT. C'est la précaution déjà écrite pour `adresseFicheAnnuaire`
   * d'une personne : le lot « 459 » n'est pas la ligne nº 459 de `gestion_annuaire_lot`, et les confondre
   * ouvrirait la fiche d'un autre bien.
   */
  /**
   * ⚠️ `&bloc=vie` A ÉTÉ AJOUTÉ AU LOT PICTO-PIECE-DANS-LE-DRIVE (point 0), sur décision d'Arno : le bouton
   * s'appelle « Historique du bien », il doit donc poser la page sur « Vie du bien » et non en haut de la fiche.
   * Le reste de l'adresse — et la règle de l'identifiant interne — est inchangé. Voir `blocVieDuBien.test.ts`.
   */
  it('🔴🔴 l’adresse de la fiche du bien se construit sur `lotId`', () => {
    expect(adresseHistoriqueDuBien(7)).toBe('/admin/gestion?ecran=annuaire&fiche=lot-7&bloc=vie');
    expect(adresseHistoriqueDuBien(459)).toBe('/admin/gestion?ecran=annuaire&fiche=lot-459&bloc=vie');
  });

  /** ⚠️ PAS DE LIEN PLUTÔT QU'UN LIEN MORT : un identifiant absent, nul, négatif ou non entier ne fabrique rien. */
  it('⚠️ aucun lien sans identifiant utilisable', () => {
    expect(adresseHistoriqueDuBien(null)).toBeNull();
    expect(adresseHistoriqueDuBien(0)).toBeNull();
    expect(adresseHistoriqueDuBien(-3)).toBeNull();
    expect(adresseHistoriqueDuBien(1.5)).toBeNull();
    expect(adresseHistoriqueDuBien(Number.NaN)).toBeNull();
  });

  /**
   * 🔴 UNE SEULE RÈGLE POUR « A-T-ON UN DOSSIER ? ». `idDossierDrive` est ce que le bouton interroge, et c'est
   * aussi ce sur quoi `adresseDossierDrive` se fonde : recopier le test dans le composant aurait permis qu'un
   * jour l'un accepte ce que l'autre refuse.
   */
  it('🔴🔴 « a-t-on un dossier ? » se décide à un seul endroit', () => {
    expect(idDossierDrive('1abcDEF')).toBe('1abcDEF');
    expect(idDossierDrive('  1abcDEF  ')).toBe('1abcDEF');
    expect(idDossierDrive(null)).toBeNull();
    expect(idDossierDrive('   ')).toBeNull();
    /* ⚠️ LES DEUX RÉPONDENT TOUJOURS LA MÊME CHOSE sur la question « y a-t-il un dossier ». */
    for (const v of ['1abcDEF', '  x  ', '', '   ', null]) {
      expect((idDossierDrive(v) === null), String(v)).toBe(adresseDossierDrive(v) === null);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA FENÊTRE OUVRE L'OUTIL EXISTANT, SUR LE DOSSIER DU BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② notre outil Drive, et pas une copie', () => {
  /**
   * 🔴🔴 LE COMPOSANT EXISTANT, RÉEMPLOYÉ TEL QUEL. Réécrire ici un navigateur « en lecture » aurait fabriqué un
   * second jeu de règles d'autorisation — donc, un jour, deux réponses différentes à la même question.
   */
  it('🔴🔴 c’est `SelecteurFichierDrive`, en mode « consulter », sur le dossier du bien', () => {
    expect(CODE_FENETRE).toContain("import { SelecteurFichierDrive } from './SelecteurFichierDrive'");
    expect(CODE_FENETRE).toContain('<SelecteurFichierDrive');
    expect(CODE_FENETRE).toContain('mode="consulter"');
    expect(CODE_FENETRE).toContain('dossierDepart={driveDuBien}');
  });

  /**
   * 🔒 AUCUNE PERMISSION N'EST ACCORDÉE PAR L'ÉCRAN. La consultation seule sous « Documents clients scannés »
   * vient du SERVEUR, qui remonte la chaîne des parents et refuse (`verdictJoindre`, `verdictCreer`,
   * `verdictDeposer`). Un drapeau d'écran se contournerait ; un refus serveur, non.
   */
  it('🔒 la fenêtre ne passe aucun droit au Drive', () => {
    const i = CODE_FENETRE.indexOf('<SelecteurFichierDrive');
    const bloc = CODE_FENETRE.slice(i, CODE_FENETRE.indexOf('/>', i) + 2);
    for (const interdit of ['joindreAutorise', 'creerAutorise', 'peutDeposer', 'lectureSeule', 'ecriture']) {
      expect(bloc, interdit).not.toContain(interdit);
    }
    /* ⚠️ ET AUCUN `onChoisir` : on ne vient rien prendre, il n'y a pas de message à remplir. */
    expect(bloc).not.toContain('onChoisir');
  });

  /**
   * 🔴 LE MÉCANISME DE POSITIONNEMENT EST CELUI DES RACCOURCIS EXISTANTS (lot RANGER-ARBRE-2) : un chemin d'UN
   * cran, puis la chaîne complète rendue par le serveur réécrit l'endroit. On n'en ajoute pas un second.
   */
  it('🔴🔴 le Drive part du dossier demandé, et le fil d’Ariane se déplie seul', () => {
    const c = code(DRIVE);
    expect(c).toContain('dossierDepart = null,');
    expect(c).toContain('dossierDepart?: { id: string; nom: string } | null;');
    /* 🔴 POSÉ DÈS L'INITIALISATION, pas par un effet : un effet aurait montré la racine le temps d'un rendu. */
    expect(c).toContain('naviguerVers(HISTORIQUE_DEPART, [{ id: dossierDepart.id, nom: dossierDepart.nom }])');
    expect(c).toContain('void charger(departInitial.current)');
    /* 🔴 LA CHAÎNE DU SERVEUR RÉÉCRIT L'ENDROIT — le geste existait déjà, on ne le double pas. */
    expect(c).toContain('setHisto((h) => remplacerCheminCourant(h, r.chaine))');
  });

  /**
   * 🔴🔴 UNE SEULE BOÎTE DE DIALOGUE À LA FOIS, comme pour « Modifier ce rattachement… » : la fenêtre Drive
   * REMPLACE celle des biens. Deux modales empilées sont injouables au clavier.
   */
  it('🔴🔴 elle remplace la fenêtre, elle ne s’empile pas dessus', () => {
    const i = CODE_FENETRE.indexOf('if (driveDuBien !== null) {');
    expect(i).toBeGreaterThan(0);
    expect(CODE_FENETRE.slice(i, i + 60)).toContain('return (');
    /* ⚠️ ET LA FERMER RAMÈNE LA FENÊTRE DES BIENS, sans rien relire : rien n'a changé en base. */
    expect(CODE_FENETRE).toContain('onFermer={() => setDriveDuBien(null)}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE TROISIÈME MODE NE RETIRE RIEN AUX DEUX AUTRES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ « consulter » à côté de « joindre » et « ranger »', () => {
  /**
   * 🔴 LE TITRE DIT L'ENDROIT, comme en mode « joindre » : on vient regarder un dossier précis, donc savoir
   * lequel EST la question. Et surtout il n'annonce pas un rangement que ce mode ne fait pas.
   */
  it('🔴🔴 le titre de la fenêtre dit où l’on est', () => {
    expect(titreFenetre('consulter', 'CHARPENTIER', 0)).toBe('CHARPENTIER');
    /* ⚠️ LES DEUX MODES EXISTANTS SONT INCHANGÉS, et c'est la moitié de ce test. */
    expect(titreFenetre('joindre', 'CHARPENTIER', 3)).toBe('CHARPENTIER');
    expect(titreFenetre('ranger', 'CHARPENTIER', 3)).toBe('Ranger 3 pièces dans le Drive');
    expect(titreFenetre('ranger', 'CHARPENTIER', 1)).toBe('Ranger une pièce dans le Drive');
  });

  /**
   * ⚠️ « Joindre la sélection » N'EST ÉCARTÉ QUE POUR « consulter ». La règle permanente d'Arno interdit de
   * retirer, masquer ou conditionner quoi que ce soit d'autre : le mode « ranger » garde donc EXACTEMENT ce
   * qu'il affichait, même si ce bouton n'y sert à rien.
   */
  it('⚠️ seul le nouveau mode est écarté du bouton « Joindre la sélection »', () => {
    expect(code(DRIVE)).toContain("{mode !== 'consulter' && joindreOk && selectionJoignable.length > 1 && (");
    /* 🔴 ET LE MODE « consulter » N'ÉTEINT AUCUN GESTE D'ÉCRITURE : ce n'est pas un mode « lecture seule ».
       Les refus restent ceux du serveur, partout, pour tout le monde. */
    expect(code(DRIVE)).not.toContain("mode === 'consulter' ? false");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 LES DEUX BOUTONS, LEUR LARGEUR, ET LE MOBILE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ « côte à côte, remplissant ensemble la largeur »', () => {
  /**
   * 🔴 DEUX PARTS ÉGALES (`flex:1 1 0`), et non « au contenu » : deux largeurs différentes se liraient comme un
   * bouton principal et un bouton secondaire, alors que ce sont deux chemins de même rang.
   */
  it('🔴🔴 une rangée, deux parts égales', () => {
    expect(FENETRE).toContain('.rdf-raccourcis{display:flex;gap:8px;margin:2px 0;min-width:0}');
    expect(FENETRE).toContain('.rdf-raccourci{flex:1 1 0;min-width:0;');
  });

  /** 🔴 « Les deux boutons tiennent sur mobile (empilés si nécessaire) » (Arno). */
  it('🔴🔴 empilés sur un écran de téléphone', () => {
    const i = FENETRE.indexOf('@media (max-width:420px){');
    expect(i).toBeGreaterThan(0);
    expect(FENETRE.slice(i, i + 400)).toContain('.rdf-raccourcis{flex-direction:column}');
  });

  /**
   * 🔴 LE ROUGE VIENT DE LA CHARTE (`.svv-btn-primary`), et l'état éteint aussi : ce jeton bascule seul en Clair
   * et en Sombre. AUCUNE couleur n'est écrite dans ce bloc — c'est la règle du module.
   */
  it('🔴 aucune couleur en dur dans le bloc des raccourcis', () => {
    const i = FENETRE.indexOf('.rdf-raccourcis{');
    const bloc = FENETRE.slice(i, FENETRE.indexOf('@media (max-width:420px)') + 200);
    expect(bloc.match(/#[0-9a-fA-F]{3,8}|rgba?\(/g) ?? []).toEqual([]);
    expect(CODE_FENETRE).toContain('className="svv-btn svv-btn-primary gst-btn rdf-raccourci"');
  });
});
