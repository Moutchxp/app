import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACTIONS_JAMAIS, aplatir, ariane, avancer, cheminCourant, cliquerLigne, COLONNES, comparerNoms, dateFinder,
  entreesPresse, menuVide,
  dossierDuChemin, entreesLaterales, fenetreVisible, flecheTri, HAUTEUR_LIGNE,
  HISTORIQUE_DEPART, iconeEntree, memeChemin, menuDossier, menuFichier, motType, naviguerVers, peutAvancer,
  peutReculer, PROFONDEUR_MAX, reculer, SELECTION_VIDE, selectionSuivante, SEUIL_VIRTUALISATION,
  sorteEntree, tailleFinder,
  titreDuChemin, trier, TRI_DEFAUT, triSuivant,
  type EntreeDrive,
} from './finderDrive';

/**
 * LOT DRIVE-FACON-FINDER — LES RÈGLES DU NAVIGATEUR, ÉPROUVÉES SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA DEMANDE D'ARNO : « dupliquer l'esthétique et les fonctions principales [de Google Drive dans le Finder]
 * pour que l'internaute ne soit pas déstabilisé en passant d'un environnement à l'autre ». Son modèle : la
 * présentation LISTE du Finder.
 *
 * 🔴🔴 ET LA RÈGLE QUI NE SE DISCUTE PAS : l'application ne renomme pas, ne déplace pas, ne supprime pas, ne met
 * pas à la corbeille, ne partage pas, ne duplique pas. Le menu contextuel ne peut pas porter ces mots — c'est ce
 * que ce fichier cherche, un par un.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const f = (p: Partial<EntreeDrive> & { nom: string }): EntreeDrive => ({
  id: p.id ?? p.nom, typeMime: 'application/pdf', tailleOctets: 1000, modifieLe: '2026-09-15T08:00:00Z',
  lien: 'https://drive.google.com/x', dossier: false, ...p,
});
const d = (nom: string, p: Partial<EntreeDrive> = {}): EntreeDrive =>
  f({ nom, dossier: true, typeMime: 'application/vnd.google-apps.folder', tailleOctets: null, ...p });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① les colonnes et le tri', () => {
  it('les quatre colonnes du Finder, dans son ordre', () => {
    expect(COLONNES.map((c) => c.libelle)).toEqual(['Nom', 'Date de modification', 'Taille', 'Type']);
  });

  it('🔴 par défaut : par nom, croissant', () => {
    expect(TRI_DEFAUT).toEqual({ colonne: 'nom', sens: 'asc' });
  });

  /** ⚠️ Recliquer la même colonne INVERSE ; en changer repart en croissant — le comportement du Finder. */
  it('un clic sur l’en-tête : même colonne = inverse, autre colonne = croissant', () => {
    expect(triSuivant({ colonne: 'nom', sens: 'asc' }, 'nom')).toEqual({ colonne: 'nom', sens: 'desc' });
    expect(triSuivant({ colonne: 'nom', sens: 'desc' }, 'nom')).toEqual({ colonne: 'nom', sens: 'asc' });
    expect(triSuivant({ colonne: 'nom', sens: 'desc' }, 'taille')).toEqual({ colonne: 'taille', sens: 'asc' });
  });

  it('la flèche ne se montre que sur la colonne qui porte le tri', () => {
    expect(flecheTri('nom', { colonne: 'nom', sens: 'asc' })).toBe('▲');
    expect(flecheTri('nom', { colonne: 'nom', sens: 'desc' })).toBe('▼');
    expect(flecheTri('taille', { colonne: 'nom', sens: 'asc' })).toBe('');
  });

  /**
   * 🔴 LES DOSSIERS RESTENT EN TÊTE, QUEL QUE SOIT LE TRI. C'est le réglage « conserver les dossiers en haut » du
   * Finder, et il vaut pour les quatre colonnes : trier par taille en dispersant les dossiers (qui n'ont pas de
   * taille) au milieu des fichiers rendrait la liste inutilisable là où elle sert le plus.
   */
  it('🔴🔴 les dossiers restent en tête, même en tri par taille et même en décroissant', () => {
    const l = [f({ nom: 'zeta.pdf', tailleOctets: 9 }), d('Alpha'), f({ nom: 'aaa.pdf', tailleOctets: 1 }), d('Zoulou')];
    for (const tri of [
      { colonne: 'nom' as const, sens: 'asc' as const },
      { colonne: 'taille' as const, sens: 'desc' as const },
      { colonne: 'modifie' as const, sens: 'desc' as const },
      { colonne: 'type' as const, sens: 'asc' as const },
    ]) {
      const r = trier(l, tri);
      expect(r.slice(0, 2).every((x) => x.dossier)).toBe(true);
    }
  });

  it('🔴 les nombres se comparent comme des nombres : « 2 Travaux » avant « 10 Travaux »', () => {
    const r = trier([d('10 Travaux'), d('2 Travaux'), d('1 Locataires')], TRI_DEFAUT);
    expect(r.map((x) => x.nom)).toEqual(['1 Locataires', '2 Travaux', '10 Travaux']);
  });

  it('⚠️ insensible à la casse et aux accents, comme le Finder', () => {
    expect(comparerNoms('Élodie', 'elodie')).toBe(0);
    expect(comparerNoms('bail', 'Bail')).toBe(0);
  });

  /** ⚠️ Un tri instable ferait « sauter » des lignes sous le doigt : le nom départage toujours. */
  it('⚠️ à valeur égale, le nom départage — le tri est stable', () => {
    const l = [f({ nom: 'b.pdf', tailleOctets: 5 }), f({ nom: 'a.pdf', tailleOctets: 5 })];
    expect(trier(l, { colonne: 'taille', sens: 'asc' }).map((x) => x.nom)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('⚠️ la liste reçue n’est jamais modifiée sur place', () => {
    const l = [f({ nom: 'b.pdf' }), f({ nom: 'a.pdf' })];
    trier(l, TRI_DEFAUT);
    expect(l.map((x) => x.nom)).toEqual(['b.pdf', 'a.pdf']);
  });
});

describe('② les types : une icône et un mot', () => {
  it('chaque type courant a son icône et son mot', () => {
    expect(sorteEntree(d('x'))).toBe('dossier');
    expect(sorteEntree(f({ nom: 'x', typeMime: 'application/pdf' }))).toBe('pdf');
    expect(sorteEntree(f({ nom: 'x', typeMime: 'image/png' }))).toBe('image');
    expect(sorteEntree(f({ nom: 'x', typeMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBe('word');
    expect(sorteEntree(f({ nom: 'x', typeMime: 'application/vnd.ms-excel' }))).toBe('excel');
    expect(sorteEntree(f({ nom: 'x', typeMime: 'application/vnd.google-apps.document' }))).toBe('google_doc');
    expect(motType(f({ nom: 'x', typeMime: 'application/pdf' }))).toBe('Document PDF');
    expect(motType(d('x'))).toBe('Dossier');
    expect(iconeEntree(d('x'))).toBe('📁');
  });

  /** ⚠️ ON LIT LE TYPE MIME, jamais l'extension : un « .pdf » renommé en « .txt » reste un PDF pour Google. */
  it('⚠️ le nom ne décide de rien : c’est le type MIME qui parle', () => {
    expect(sorteEntree(f({ nom: 'piege.txt', typeMime: 'application/pdf' }))).toBe('pdf');
  });

  it('un type inconnu reste un document, jamais une case vide', () => {
    expect(motType(f({ nom: 'x', typeMime: 'application/octet-stream' }))).toBe('Document');
  });

  /** ⚠️ UN DOSSIER N'A PAS DE TAILLE : le Finder écrit « -- ». « 0 o » ferait croire à un dossier vide. */
  it('⚠️ un dossier n’a pas de taille', () => {
    expect(tailleFinder(null, true)).toBe('--');
    expect(tailleFinder(12345, true)).toBe('--');
    expect(tailleFinder(null, false)).toBe('--');
  });

  it('les tailles s’écrivent comme dans le Finder', () => {
    expect(tailleFinder(512, false)).toBe('512 o');
    expect(tailleFinder(3_309_518, false)).toBe('3,3 Mo');
    expect(tailleFinder(410_000, false)).toBe('410 Ko');
  });

  it('une date absente reste vide — jamais inventée', () => {
    expect(dateFinder(null)).toBe('');
    expect(dateFinder('pas une date')).toBe('');
    expect(dateFinder('2026-09-15T08:00:00Z')).toMatch(/2026/);
  });
});

describe('③ l’historique : les flèches ‹ ›', () => {
  const A: { id: string; nom: string }[] = [{ id: 'a', nom: 'A' }];
  const B = [...A, { id: 'b', nom: 'B' }];

  it('au départ, on ne peut ni reculer ni avancer', () => {
    expect(peutReculer(HISTORIQUE_DEPART)).toBe(false);
    expect(peutAvancer(HISTORIQUE_DEPART)).toBe(false);
    expect(cheminCourant(HISTORIQUE_DEPART)).toEqual([]);
  });

  it('naviguer, reculer, avancer', () => {
    let h = naviguerVers(HISTORIQUE_DEPART, A);
    h = naviguerVers(h, B);
    expect(cheminCourant(h)).toEqual(B);
    h = reculer(h);
    expect(cheminCourant(h)).toEqual(A);
    expect(peutAvancer(h)).toBe(true);
    h = avancer(h);
    expect(cheminCourant(h)).toEqual(B);
  });

  /** ⚠️ Reculer PUIS partir ailleurs abandonne la branche qu'on a quittée — comme tout navigateur. */
  it('⚠️ partir ailleurs après un retour coupe ce qui était devant', () => {
    let h = naviguerVers(naviguerVers(HISTORIQUE_DEPART, A), B);
    h = reculer(h);
    h = naviguerVers(h, [{ id: 'c', nom: 'C' }]);
    expect(peutAvancer(h)).toBe(false);
    expect(cheminCourant(h)).toEqual([{ id: 'c', nom: 'C' }]);
  });

  /** ⚠️ Recliquer le même dossier ne doit pas remplir l'historique de doublons à retraverser un par un. */
  it('⚠️ aller là où l’on est déjà n’empile rien', () => {
    const h = naviguerVers(HISTORIQUE_DEPART, A);
    expect(naviguerVers(h, A)).toBe(h);
    expect(memeChemin(A, [{ id: 'a', nom: 'autre nom' }])).toBe(true);
  });

  it('le titre et le fil d’Ariane disent où l’on est', () => {
    expect(titreDuChemin([])).toBe('Google Drive');
    expect(titreDuChemin(B)).toBe('B');
    expect(ariane(B).map((x) => x.nom)).toEqual(['Google Drive', 'A', 'B']);
    expect(dossierDuChemin([])).toBe('');
    expect(dossierDuChemin(B)).toBe('b');
  });
});

describe('④ la barre latérale', () => {
  it('🔴 « Dossier du bien » en PREMIER quand il y en a un', () => {
    const l = entreesLaterales([{ dossierId: 'D1', dossierNom: 'TAGAVI', libelle: '3 rue X', titre: 'Dossier du bien — TAGAVI' }]);
    expect(l[0].sorte).toBe('bien');
    expect(l.map((x) => x.sorte)).toEqual(['bien', 'recents', 'mon_drive', 'drives_partages']);
  });

  it('sans bien rattaché, la barre commence par « Récents » — rien ne manque, rien ne ment', () => {
    expect(entreesLaterales([]).map((x) => x.libelle)).toEqual(['Récents', 'Mon Drive', 'Drives partagés']);
  });

  it('« Récents » ne mène à aucun dossier : ce n’en est pas un', () => {
    expect(entreesLaterales([]).find((x) => x.sorte === 'recents')?.chemin).toBeNull();
  });
});

describe('⑤ la sélection : Cmd+clic, Maj+clic, flèches', () => {
  const ordre = ['a', 'b', 'c', 'd', 'e'];

  it('un clic nu ne garde que cette ligne', () => {
    expect(cliquerLigne({ ids: ['a', 'b'], ancre: 'a' }, 'd', ordre)).toEqual({ ids: ['d'], ancre: 'd' });
  });

  it('🔴 Cmd+clic ajoute, puis retire', () => {
    const s1 = cliquerLigne(SELECTION_VIDE, 'a', ordre, { cmd: true });
    const s2 = cliquerLigne(s1, 'c', ordre, { cmd: true });
    expect(s2.ids).toEqual(['a', 'c']);
    expect(cliquerLigne(s2, 'a', ordre, { cmd: true }).ids).toEqual(['c']);
  });

  it('🔴 Maj+clic prend tout l’intervalle, dans les deux sens', () => {
    const s = cliquerLigne(SELECTION_VIDE, 'b', ordre);
    expect(cliquerLigne(s, 'd', ordre, { maj: true }).ids).toEqual(['b', 'c', 'd']);
    expect(cliquerLigne(s, 'a', ordre, { maj: true }).ids).toEqual(['a', 'b']);
  });

  /** ⚠️ L'ANCRE NE BOUGE PAS SUR UN MAJ+CLIC : c'est ce qui permet d'élargir puis de rétrécir l'intervalle. */
  it('⚠️ l’ancre ne bouge pas sur un Maj+clic', () => {
    const s = cliquerLigne(SELECTION_VIDE, 'b', ordre);
    const large = cliquerLigne(s, 'e', ordre, { maj: true });
    expect(large.ancre).toBe('b');
    expect(cliquerLigne(large, 'c', ordre, { maj: true }).ids).toEqual(['b', 'c']);
  });

  it('les flèches descendent et remontent, et ne bouclent pas', () => {
    let s = selectionSuivante(SELECTION_VIDE, ordre, 1);
    expect(s.ids).toEqual(['a']);
    s = selectionSuivante(s, ordre, -1);
    expect(s.ids).toEqual(['a']);          // en haut, la flèche haute ne fait rien
    s = { ids: ['e'], ancre: 'e' };
    expect(selectionSuivante(s, ordre, 1).ids).toEqual(['e']);   // en bas non plus
  });

  it('une liste vide ne jette pas', () => {
    expect(selectionSuivante({ ids: ['x'], ancre: 'x' }, [], 1)).toEqual(SELECTION_VIDE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 LE MENU CONTEXTUEL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le menu contextuel ne porte QUE ce que l’application sait faire', () => {
  const permis = { joindreAutorise: true, motifRefus: null, dejaAjoute: false, avecLien: true };

  /**
   * ⚠️ « Visualiser » RESTE ACTIF même sur un format sans aperçu : c'est l'écran d'aperçu qui le dit, sans même
   * interroger le serveur, et qui propose alors de joindre. L'éteindre retirerait ce chemin.
   */
  it('sur un fichier : Visualiser, Joindre, Insérer un lien, Ouvrir dans Google Drive', () => {
    expect(menuFichier(permis).map((e) => e.action))
      .toEqual(['visualiser', 'joindre', 'lien', 'ouvrir_google']);
    expect(menuFichier(permis).every((e) => e.motifInactif === null)).toBe(true);
  });

  it('sur un dossier : Ouvrir, Nouveau dossier, Ouvrir dans Google Drive', () => {
    expect(menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true }).map((e) => e.action))
      .toEqual(['ouvrir', 'nouveau_dossier', 'ouvrir_google']);
  });

  /**
   * ══ 🔴🔴 JAMAIS : Renommer, Placer dans la corbeille, Supprimer, Partager ════════════════════════════════════
   *
   * ⚠️ CE TEST A ÉTÉ RÉÉCRIT LE 29/09/2026, PAS SUPPRIMÉ NI AFFAIBLI SANS RAISON. Il cherchait aussi « deplacer »,
   * « copier » et « dupliquer ». Décision d'Arno du 29/09/2026 (lot DRIVE-DEPLACER) : l'application DÉPLACE et
   * COPIE désormais dans le Drive — l'invariant a donc changé de CONTENU, et il change ici, dans un diff qu'on
   * relit, jamais par un test qu'on contourne.
   *
   * 🔴 CE QUI RESTE INTERDIT EST CE QUI NE SE DÉFAIT PAS (supprimer, corbeille, renommer) ou ce qui expose les
   * documents du cabinet à des tiers (partager). Un déplacement, lui, se défait : le bandeau « Annuler », et le
   * journal qui garde le parent d'origine.
   */
  it('🔴🔴 aucune action destructrice, dans aucun menu, dans aucun état', () => {
    const avecPresse = { autorise: true, motif: null, motColler: 'Coller ici', presseVide: false };
    const tous = [
      ...menuFichier(permis),
      ...menuFichier({ ...permis, joindreAutorise: false, motifRefus: 'refusé' }),
      ...menuFichier({ ...permis, dejaAjoute: true, avecLien: false }),
      ...menuFichier({ ...permis, presse: avecPresse }),
      ...menuFichier({ ...permis, presse: { ...avecPresse, autorise: false, motif: 'journal absent' } }),
      ...menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true }),
      ...menuDossier({ creerAutorise: false, motifCreation: 'refusé', avecLien: false }),
      ...menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true, presse: avecPresse }),
      ...menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true,
        presse: { ...avecPresse, presseVide: true } }),
    ];
    const texte = tous.map((e) => `${e.action} ${e.libelle} ${e.motifInactif ?? ''}`).join(' ').toLowerCase();
    for (const mot of ACTIONS_JAMAIS) expect(texte).not.toContain(mot);
    // Et les mots voisins, que l'anglais de l'API pourrait glisser sans qu'on les lise en français.
    for (const mot of ['trash', 'delete', 'rename', 'permission']) expect(texte).not.toContain(mot);
  });

  it('🔴🔴 et le module lui-même ne connaît pas ces mots', () => {
    const src = readFileSync('app/lib/gestion/finderDrive.ts', 'utf8');
    // ⚠️ On examine le CODE, pas la prose : l'encadré du fichier explique justement qu'on ne les met pas.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n')
      // La liste `ACTIONS_JAMAIS` est justement là pour les nommer : on l'écarte avant de chercher.
      .replace(/export const ACTIONS_JAMAIS[\s\S]*?as const;/, ' ');
    for (const mot of ['renommer', 'corbeille', 'supprimer', 'partager', 'trashed', 'permissions']) {
      expect(code.toLowerCase()).not.toContain(mot);
    }
  });

  /**
   * 🔴 LES TROIS ENTRÉES DE LA MÉMOIRE TAMPON — et leur absence quand on ne les demande pas. « Coller » éteint dit
   * le geste à faire d'abord : un menu qui refuse sans expliquer se lit comme une panne.
   */
  it('Couper / Copier / Coller : présentes, éteintes avec leur motif, ou absentes', () => {
    expect(menuFichier(permis).map((e) => e.action)).not.toContain('couper');
    expect(menuDossier({ creerAutorise: true, motifCreation: null, avecLien: true }).map((e) => e.action))
      .not.toContain('coller');

    const pret = entreesPresse({ autorise: true, motif: null, motColler: 'Coller ici (déplacer 2 éléments)', presseVide: false });
    expect(pret.map((e) => e.action)).toEqual(['couper', 'copier', 'coller']);
    expect(pret.every((e) => e.motifInactif === null)).toBe(true);
    expect(pret[2].libelle).toContain('déplacer 2 éléments');

    const vide = entreesPresse({ autorise: true, motif: null, motColler: 'Coller ici', presseVide: true });
    expect(vide[0].motifInactif).toBeNull();
    expect(vide[2].motifInactif).toContain('⌘X');

    const sansJournal = entreesPresse({
      autorise: false, motif: 'La mise à jour de la base n’est pas appliquée.', motColler: 'Coller ici', presseVide: false,
    });
    for (const e of sansJournal) expect(e.motifInactif).toContain('base');
  });

  it('aucune entrée de mémoire tampon quand le lot ne la propose pas', () => {
    expect(entreesPresse(null)).toEqual([]);
  });

  /**
   * ══ 🔴 LOT DRIVE-RETOUCHES-1 — LE MENU DU VIDE ════════════════════════════════════════════════════════════
   *
   * Arno : « clic droit dans une ZONE VIDE de la liste : aujourd'hui c'est le menu de Chrome qui s'ouvre. »
   * 🔴 CE N'EST PAS UNE LACUNE DE CONFORT : le menu de Chrome propose « Recharger », c'est-à-dire recharger toute
   * l'application — fenêtre fermée, sélection perdue, mémoire tampon vidée, brouillon emporté.
   */
  it('🔴 le menu du vide : créer, coller, actualiser — et rien d’autre', () => {
    const m = menuVide({
      creerAutorise: true,
      motifCreation: null,
      presse: { autorise: true, motif: null, motColler: 'Coller ici (déplacer 2 éléments)', presseVide: false },
    });
    expect(m.map((e) => e.action)).toEqual(['nouveau_dossier', 'coller', 'actualiser']);
    expect(m.every((e) => e.motifInactif === null)).toBe(true);
  });

  /**
   * ⚠️ DANS LE VIDE, « Coller » DISPARAÎT QUAND IL N'Y A RIEN À COLLER (demande d'Arno). C'est le contraire du
   * menu d'une LIGNE, où l'entrée reste visible mais éteinte : un menu ouvert sur un élément doit montrer tout
   * ce qu'on peut lui faire, tandis qu'un menu ouvert sur rien n'a rien à décrire.
   */
  it('sans rien dans la mémoire tampon, « Coller » est ABSENT du menu du vide', () => {
    const m = menuVide({
      creerAutorise: true,
      motifCreation: null,
      presse: { autorise: true, motif: null, motColler: 'Coller ici', presseVide: true },
    });
    expect(m.map((e) => e.action)).toEqual(['nouveau_dossier', 'actualiser']);
  });

  /** 🔴🔴 ET LES MÊMES INTERDITS : sous l'archive, « Nouveau dossier » y est éteint, avec son motif. */
  it('🔴🔴 sous « Documents clients scannés », « Nouveau dossier » du menu du vide est éteint', () => {
    const m = menuVide({
      creerAutorise: false,
      motifCreation: '« Documents clients scannés » est l’archive du cabinet : rien n’y est créé.',
    });
    const creer = m.find((e) => e.action === 'nouveau_dossier');
    expect(creer?.motifInactif).toContain('Documents clients scannés');
    // ⚠️ « Actualiser » RESTE : relire un dossier n'écrit rien, et l'archive est parcourable en métadonnées.
    expect(m.find((e) => e.action === 'actualiser')?.motifInactif).toBeNull();
  });

  /** ⚠️ SANS MÉMOIRE TAMPON DU TOUT (mode qui ne la propose pas), « Coller » est simplement ABSENT. */
  it('le menu du vide sans mémoire tampon n’a que deux entrées', () => {
    expect(menuVide({ creerAutorise: true, motifCreation: null }).map((e) => e.action))
      .toEqual(['nouveau_dossier', 'actualiser']);
  });

  /** 🔴🔴 ET JAMAIS D'ACTION DESTRUCTRICE, ICI NON PLUS. */
  it('🔴🔴 le menu du vide ne porte aucune action destructrice', () => {
    const tous = [
      ...menuVide({ creerAutorise: true, motifCreation: null }),
      ...menuVide({ creerAutorise: false, motifCreation: 'refusé' }),
    ];
    const texte = tous.map((e) => `${e.action} ${e.libelle} ${e.motifInactif ?? ''}`).join(' ').toLowerCase();
    for (const mot of ACTIONS_JAMAIS) expect(texte).not.toContain(mot);
  });

  it('🔴🔴 là où la lecture est refusée : Visualiser et Joindre éteints, le lien reste', () => {
    const m = menuFichier({ ...permis, joindreAutorise: false, motifRefus: 'Ce fichier est dans « Documents clients scannés ».' });
    const par = Object.fromEntries(m.map((e) => [e.action, e]));
    expect(par.visualiser.motifInactif).toContain('Documents clients scannés');
    expect(par.joindre.motifInactif).toContain('Documents clients scannés');
    expect(par.lien.motifInactif).toBeNull();
  });

  it('🔴 « Nouveau dossier » porte les mêmes interdits qu’ailleurs', () => {
    const m = menuDossier({ creerAutorise: false, motifCreation: 'La création est interdite ici.', avecLien: true });
    expect(m.find((e) => e.action === 'nouveau_dossier')?.motifInactif).toContain('interdite');
  });

  it('un fichier sans adresse Drive : le lien est éteint, avec son motif', () => {
    const m = menuFichier({ ...permis, avecLien: false });
    expect(m.find((e) => e.action === 'lien')?.motifInactif).toContain('adresse Drive');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑦ le dépliage sur place', () => {
  const racine = [d('A'), d('B'), f({ nom: 'c.pdf' })];
  const enfantsA = [f({ nom: 'a1.pdf' }), d('A2')];

  it('replié, la liste est simplement triée', () => {
    expect(aplatir(racine, new Set(), () => undefined, TRI_DEFAUT).map((l) => l.entree.nom))
      .toEqual(['A', 'B', 'c.pdf']);
  });

  it('🔴 déplié, le sous-niveau s’insère SOUS son dossier, indenté', () => {
    const r = aplatir(racine, new Set(['A']), (id) => (id === 'A' ? enfantsA : undefined), TRI_DEFAUT);
    expect(r.map((l) => `${'  '.repeat(l.profondeur)}${l.entree.nom}`))
      .toEqual(['A', '  A2', '  a1.pdf', 'B', 'c.pdf']);
  });

  /** ⚠️ Un dossier déplié dont le contenu n'est pas encore arrivé ne produit AUCUNE ligne : on n'invente rien. */
  it('⚠️ un dossier ouvert sans contenu connu ne produit rien', () => {
    const r = aplatir(racine, new Set(['A']), () => undefined, TRI_DEFAUT);
    expect(r).toHaveLength(3);
  });

  /** ⚠️ BORNÉ EN PROFONDEUR : le Drive du cabinet fait treize niveaux. */
  it('⚠️ le dépliage est borné en profondeur', () => {
    const chaine = (n: number): EntreeDrive[] => [d(`N${n}`, { id: `N${n}` })];
    const r = aplatir(chaine(0), new Set(Array.from({ length: 20 }, (_, i) => `N${i}`)),
      (id) => chaine(Number(id.slice(1)) + 1), TRI_DEFAUT);
    expect(r.length).toBeLessThanOrEqual(PROFONDEUR_MAX + 1);
  });
});

describe('⑧ la virtualisation', () => {
  it('une petite liste est rendue en entier — virtualiser coûterait plus cher', () => {
    const r = fenetreVisible(40, 0, 600);
    expect(r).toEqual({ debut: 0, fin: 40, avant: 0, apres: 0 });
  });

  /** 🔴 « 1 Propriétaires » compte plus de 300 dossiers (307 mesurés le 29/09/2026). */
  it('🔴 une grande liste ne rend que ce qu’on voit, plus une marge', () => {
    const r = fenetreVisible(307, 0, 600);
    expect(r.debut).toBe(0);
    expect(r.fin).toBeLessThan(307);
    expect(r.fin).toBeGreaterThan(600 / HAUTEUR_LIGNE);
    expect(r.apres).toBe((307 - r.fin) * HAUTEUR_LIGNE);
  });

  it('les deux cales tiennent toujours la hauteur totale', () => {
    const r = fenetreVisible(1000, 4000, 600);
    expect(r.avant + (r.fin - r.debut) * HAUTEUR_LIGNE + r.apres).toBe(1000 * HAUTEUR_LIGNE);
  });

  it('⚠️ une marge au-dessus et en dessous : pas de blanc pendant un défilement rapide', () => {
    const r = fenetreVisible(1000, 2800, 600);
    expect(r.debut).toBeLessThan(2800 / HAUTEUR_LIGNE);
  });

  it('le seuil est nommé une seule fois', () => {
    expect(fenetreVisible(SEUIL_VIRTUALISATION, 0, 600).fin).toBe(SEUIL_VIRTUALISATION);
  });
});
