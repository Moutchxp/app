import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aideReintegrer, bandeauReintegre, boiteOrigine, LIBELLE_REINTEGRER, nomBoiteOrigine,
} from './boiteOrigine';
import { LISTES_CHERCHABLES } from '../../(admin)/admin/(protected)/gestion/BoiteMail';

/**
 * ══ 🔴🔴 LOT REINTEGRER — « LE MAIL REVIENT À SA PLACE D'ORIGINE : <BOÎTE> » ═════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « pour chaque mail de la corbeille, une action “Réintégrer” dans le menu “…” qui le
 * remet à sa place d'origine : la boîte ou catégorie d'où il vient (Réception, Courrier automatique, Envoyés,
 * Spam, etc.), avec son statut d'avant. […] Vérifie la mécanique : d'où vient l'information d'origine ? Est-elle
 * mémorisée au moment de la mise à la corbeille, pour chacun des chemins ? »
 *
 * ═══ 🔴🔴 LA RÉPONSE, ÉTABLIE EN LISANT LE CODE, ET CE FICHIER LA VERROUILLE ════════════════════════════════════
 *
 * L'ORIGINE N'EST PAS MÉMORISÉE : ELLE EST INTRINSÈQUE. Les boîtes ne sont pas des dossiers où l'on RANGE un mail,
 * ce sont des LECTURES, chacune définie par un prédicat sur des colonnes du message (`sqlEtiquette`). Et la mise à
 * la corbeille n'écrit QU'UNE de ces colonnes — `corbeille_le` — par les TROIS chemins, qui appellent tous la même
 * route, donc la même fonction (`marquerCorbeille`). Effacer `corbeille_le` rend donc sa place au mail, par
 * construction.
 *
 * MESURÉ SUR LA BASE D'ARNO le 03/10/2026 : 38 mails à la corbeille, **0 d'origine inconnue** — 37 de Réception
 * (35 échanges), 1 d'Envoyés. La « simulation de déduction » demandée n'a pas d'objet : il n'y a rien à deviner.
 *
 * CE QUI RESTAIT À ÉCRIRE, ET QUE CE MODULE FAIT : NOMMER la boîte, pour que le menu la dise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const signaux = (o: Partial<Parameters<typeof boiteOrigine>[0]> = {}) => ({
  sens: 'recu' as const, spam: false, lisibles: 3, ...o,
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 UN CAS PAR BOÎTE D'ORIGINE — LES QUATRE QU'ARNO NOMME
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la boîte d’origine, une par cas', () => {
  it('🔴 Réception — un mail reçu, lisible, non spam', () => {
    expect(boiteOrigine(signaux())).toBe('reception');
    expect(nomBoiteOrigine('reception')).toBe('Réception');
  });

  it('🔴 Envoyés — un mail que nous avons écrit', () => {
    expect(boiteOrigine(signaux({ sens: 'envoye' }))).toBe('envoyes');
    expect(nomBoiteOrigine('envoyes')).toBe('Envoyés');
  });

  /** 🔴 LE PRÉDICAT PORTE SUR L'ÉCHANGE (« aucun message lisible »), pas sur le mail : d'où un NOMBRE. */
  it('🔴 Courrier automatique — aucun message lisible dans l’échange', () => {
    expect(boiteOrigine(signaux({ lisibles: 0 }))).toBe('automatique');
    expect(nomBoiteOrigine('automatique')).toBe('Courrier automatique');
  });

  it('🔴 Spam — la marque de Gmail', () => {
    expect(boiteOrigine(signaux({ spam: true }))).toBe('spam');
    expect(nomBoiteOrigine('spam')).toBe('Spam');
  });

  /**
   * 🔴🔴 L'ORDRE DES TESTS N'EST PAS UN GOÛT, IL EST CELUI DES PRÉDICATS. Toutes les autres listes écartent le
   * spam (`m.spam_le IS NULL`) : un mail à la fois spam ET écarté par une règle n'apparaît QUE dans Spam. Le
   * nommer « Courrier automatique » enverrait le chercher dans une liste qui ne le montre pas.
   */
  it('🔴🔴 spam l’emporte sur « automatique », et sur le sens', () => {
    expect(boiteOrigine(signaux({ spam: true, lisibles: 0 }))).toBe('spam');
    expect(boiteOrigine(signaux({ spam: true, sens: 'envoye' }))).toBe('spam');
    // …et « automatique » l'emporte sur le sens, pour la même raison : sa liste écarte, elle aussi.
    expect(boiteOrigine(signaux({ lisibles: 0, sens: 'envoye' }))).toBe('automatique');
  });

  /** ⚠️ UN NOMBRE ABSURDE NE CASSE RIEN : un négatif se lit « aucun lisible », comme zéro. */
  it('⚠️ un nombre de lisibles négatif vaut « aucun »', () => {
    expect(boiteOrigine(signaux({ lisibles: -1 }))).toBe('automatique');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES MOTS — CEUX D'ARNO, ET CEUX DE LA COLONNE DE GAUCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les mots', () => {
  /** 🔴 LE MÊME MOT QUE POUR LES BROUILLONS (demande d'Arno), et écrit une seule fois. */
  it('🔴 « Réintégrer », pas « Restaurer »', () => {
    expect(LIBELLE_REINTEGRER).toBe('Réintégrer');
  });

  /** 🔴 LA PHRASE EST CELLE D'ARNO, mot pour mot. */
  it('🔴🔴 l’aide nomme la boîte', () => {
    expect(aideReintegrer('reception')).toBe('Le mail revient à sa place d’origine : Réception.');
    expect(aideReintegrer('automatique')).toBe('Le mail revient à sa place d’origine : Courrier automatique.');
  });

  /**
   * ⚠️ BOÎTE INCONNUE ⇒ AUCUN NOM INVENTÉ. C'est le cas de la migration 263 absente (la marque spam est alors
   * illisible). Nommer « Réception » parce que c'est le cas le plus fréquent — 37 mails sur 38 — enverrait
   * chercher dans la mauvaise liste une fois sur trente-huit, et ce sont ces fois-là qui coûtent.
   */
  it('⚠️ sans boîte connue, la phrase s’arrête et ne devine pas', () => {
    expect(aideReintegrer(null)).toBe('Le mail revient à sa place d’origine.');
    expect(aideReintegrer(null)).not.toContain('Réception');
    expect(bandeauReintegre(null)).not.toContain('«');
  });

  /**
   * 🔴🔴 LES MÊMES MOTS QUE LA COLONNE DE GAUCHE, AU CARACTÈRE PRÈS. Une aide qui dirait « la boîte de réception »
   * quand l'entrée de gauche dit « Réception » ferait chercher une troisième liste. On les compare donc à
   * `LISTES_CHERCHABLES`, qui porte déjà ces libellés — et qui dit lui-même être « LES MÊMES que la colonne ».
   */
  it('🔴🔴 ce sont les libellés de la colonne, pas des synonymes', () => {
    const parSorte = new Map(LISTES_CHERCHABLES.map(([cle, mot]) => [cle, mot]));
    expect(nomBoiteOrigine('reception')).toBe(parSorte.get('reception'));
    expect(nomBoiteOrigine('envoyes')).toBe(parSorte.get('envoyes'));
    expect(nomBoiteOrigine('automatique')).toBe(parSorte.get('automatique'));
    expect(nomBoiteOrigine('spam')).toBe(parSorte.get('spam'));
  });

  /** 🔴 LE BANDEAU DIT OÙ LE MAIL EST PARTI : la liste qu'on regarde est la Corbeille, il vient d'en disparaître. */
  it('🔴 le bandeau nomme la boîte, et promet le statut', () => {
    expect(bandeauReintegre('envoyes')).toContain('« Envoyés »');
    expect(bandeauReintegre('envoyes')).toContain('statut');
    expect(bandeauReintegre('envoyes')).toContain('étoile');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA MÉCANIQUE — CE QUE LA MISE À LA CORBEILLE ÉCRIT, ET CE QU'ELLE NE TOUCHE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   🔴 C'EST LA PARTIE QUI COMPTE VRAIMENT. Le reste de ce fichier éprouve des mots ; ceci éprouve la PROPRIÉTÉ qui
   fait que « Réintégrer » rend sa place au mail — et elle tient à ce que `marquerCorbeille` n'écrive qu'une seule
   colonne. Le jour où quelqu'un y ajoute « et on range aussi la boîte d'origine », ces épreuves tombent, et c'est
   exactement ce qu'on veut : la mécanique aurait changé de nature.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la mise à la corbeille n’écrit QUE `corbeille_le`', () => {
  const repo = readFileSync('app/lib/gestion/corbeilleRepo.ts', 'utf8');

  it('🔴🔴 l’aller et le retour ne touchent qu’une colonne', () => {
    expect(repo).toContain('SET corbeille_le = coalesce(corbeille_le, now()), maj_le = now()');
    expect(repo).toContain('SET corbeille_le = NULL, maj_le = now()');
  });

  /**
   * 🔴🔴 EN NÉGATIF, ET C'EST LA PREUVE : les trois colonnes qui DÉFINISSENT les boîtes ne sont jamais écrites par
   * ce chemin. `sens` → Réception/Envoyés, `exclu_le` → Courrier automatique, `spam_le` → Spam.
   */
  it('🔴🔴 ni `sens`, ni `exclu_le`, ni `spam_le`', () => {
    for (const colonne of ['SET sens', 'sens =', 'exclu_le =', 'spam_le =']) {
      expect(repo, colonne).not.toContain(colonne);
    }
  });

  /**
   * 🔴 ET LE STATUT NON PLUS : les rattachements, la marque « Interne », « Hors gestion » et l'étoile vivent dans
   * d'autres tables, qu'aucune ligne de ce chemin n'atteint. C'est ce qui permet au bandeau de PROMETTRE que le
   * statut et l'étoile sont conservés — une promesse qu'on n'a le droit de faire que si rien ne peut la défaire.
   */
  it('🔴 aucune table de statut n’est nommée', () => {
    /* ⚠️ LES NOMS SONT CEUX DES TABLES QUI EXISTENT VRAIMENT — vérifiés en base : `gestion_fil_etoile` pour
       l'étoile de l'ÉQUIPE (il n'y a pas de `gestion_etoile`), et `gestion_message.etoile_le` pour celle de
       Gmail. Une épreuve qui interdirait un nom inexistant passerait toujours, et ne garderait rien. */
    for (const table of ['gestion_rattachement', 'gestion_fil_interne', 'gestion_hors_gestion',
      'gestion_fil_etoile']) {
      expect(repo, table).not.toContain(table);
    }
    // 🔴 ET L'ÉTOILE DE GMAIL vit dans une COLONNE de `gestion_message` : la clause `SET` ne la touche pas non
    //   plus — c'est l'épreuve de propriété juste au-dessus qui le garantit, celle-ci le dit en clair.
    expect(repo).not.toContain('etoile_le =');
  });

  /**
   * 🔴 LE LU/NON LU ET L'ÉTOILE SONT CEUX DE GMAIL, et `messages.trash`/`untrash` ne touchent que le libellé
   * TRASH. Lu dans la source de `corbeilleGmail` : l'appel n'a pas de corps, donc il ne peut rien dire d'UNREAD
   * ni de STARRED.
   */
  it('🔴 côté Gmail, trash/untrash et rien d’autre', () => {
    const google = readFileSync('app/lib/gestion/google.ts', 'utf8');
    expect(google).toContain("const verbe = aLaCorbeille ? 'trash' : 'untrash';");
    const i = google.indexOf('export async function corbeilleGmail');
    const bloc = google.slice(i, i + 900);
    expect(bloc).not.toContain('UNREAD');
    expect(bloc).not.toContain('STARRED');
    expect(bloc).not.toContain('removeLabelIds');
  });

  /**
   * ══ 🔴🔴 UN MAIL QUI FAIT PARTIE D'UNE CONVERSATION — le cas qu'Arno demande d'éprouver ══════════════════════
   *
   * La Corbeille montre UNE LIGNE PAR ÉCHANGE, et cet échange peut être encore vivant : trois mails en Réception
   * et un seul à la corbeille. « Réintégrer » sur cette ligne ne doit toucher QUE le mail jeté.
   *
   * 🔴 LE GARDE-FOU EXISTE, ET IL EST NOMMÉ : `messagesDuFil(fils, seulementCorbeille)`. La route le passe à
   * `true` pour tout ce qui n'est PAS une mise à la corbeille — donc pour « Réintégrer » et pour « Supprimer
   * définitivement ». Sans lui, réintégrer une ligne sortirait de la corbeille des mails que personne n'y avait
   * mis, et supprimer définitivement en effacerait.
   *
   * ⚠️ L'INVERSE EST VOULU : depuis le menu d'une ligne ORDINAIRE, « Supprimer » porte sur TOUTE la conversation
   * (le drapeau est `false`) — supprimer une conversation supprime la conversation.
   */
  it('🔴🔴 une conversation : seuls les mails RÉELLEMENT à la corbeille reviennent', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/corbeille/route.ts', 'utf8');
    expect(route).toContain("const ids = await messagesDuFil(fils, action !== 'corbeille');");
    const fil = readFileSync('app/lib/gestion/corbeilleFil.ts', 'utf8');
    expect(fil).toContain("'AND corbeille_le IS NOT NULL'");
    // 🔴 ET L'ORDRE EST STABLE : le geste porte sur une liste, pas sur un ensemble au hasard.
    expect(fil).toContain('ORDER BY recu_le, id');
  });

  /**
   * 🔴🔴 LES TROIS CHEMINS PASSENT PAR LA MÊME ROUTE, donc par la même fonction. Arno demandait de le vérifier
   * « pour chacun des chemins (grande corbeille de l'en-tête, icône de la barre de survol, sélection multiple) » :
   * il n'y a rien à vérifier trois fois, et c'est précisément ce qu'il faut démontrer.
   */
  it('🔴🔴 les trois chemins n’ont qu’une seule écriture', () => {
    const route = readFileSync('app/(admin)/api/admin/gestion/corbeille/route.ts', 'utf8');
    expect(route).toContain('marquerCorbeille');
    /**
     * 🔴🔴 ON COMPTE LA PROPRIÉTÉ, PAS LES OCCURRENCES. Ce fichier porte QUATRE `UPDATE gestion_message` — les
     * deux de `marquerCorbeille` et les deux de la synchronisation depuis Gmail (`synchroniserCorbeille`), qui
     * aligne notre `corbeille_le` sur ce que la vraie boîte dit. Figer le NOMBRE aurait fait tomber cette épreuve
     * au premier ajout légitime ; ce qui compte est que CHACUN n'écrive que `corbeille_le` (et `maj_le`).
     *
     * ⚠️ ET C'EST UNE MEILLEURE PREUVE QUE PRÉVU : même la relève, qui pourrait prendre des libertés, ne touche
     * pas une seule colonne de boîte.
     */
    /* ⚠️ LA CAPTURE S'ARRÊTE AU `WHERE` : sans cette borne, le `WHERE id = ANY(…)` entrait dans la liste des
       colonnes écrites, et l'épreuve accusait une écriture sur `id`. On lit la clause `SET`, et elle seule. */
    const updates = [...repo.matchAll(/UPDATE gestion_message SET ([\s\S]*?)\s+WHERE/g)].map((m) => m[1]);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (const u of updates) {
      const colonnes = [...u.matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]);
      expect(new Set(colonnes), u.slice(0, 80)).toEqual(new Set(['corbeille_le', 'maj_le']));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE CÂBLAGE DE L'ÉCRAN — L'ENTRÉE, SON AIDE, ET « ANNULER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le câblage', () => {
  const MENU = readFileSync('app/lib/gestion/menuLigne.ts', 'utf8');
  const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
  const PLEIN = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');

  it('🔴🔴 le menu dit « Réintégrer » et nomme la boîte', () => {
    expect(MENU).toContain('cle: \'restaurer\', libelle: LIBELLE_REINTEGRER,');
    expect(MENU).toContain('aide: aideReintegrer(etat.boiteOrigine ?? null),');
    // ⚠️ L'ANCIEN LIBELLÉ N'EST PLUS ÉCRIT NULLE PART dans ce module.
    expect(MENU).not.toContain("libelle: 'Restaurer'");
  });

  /**
   * 🔴 LA CLÉ `restaurer` NE CHANGE PAS, et c'est délibéré : c'est elle que les écrans branchent sur la route.
   * La renommer pour un libellé aurait cassé le câblage. Le MOT est à l'écran, la clé est dans le code.
   */
  it('🔴 la clé reste `restaurer` — le libellé ne décide de rien', () => {
    expect(MENU).toContain("| 'corbeille' | 'restaurer'");
    expect(PLEIN).toContain("const versLaCorbeille = action === 'corbeille';");
  });

  /** 🔴 L'ORIGINE SE LIT SUR LA LIGNE, et seulement sous l'étiquette « Corbeille ». */
  it('🔴 l’écran calcule l’origine depuis les signaux de la ligne', () => {
    expect(BOITE).toContain("boiteOrigine: etiquette.sorte === 'corbeille'");
    expect(BOITE).toContain('boiteOrigine({ sens: l.dernierSens, spam: l.spam === true, lisibles: l.nbLisibles })');
  });

  /**
   * 🔴🔴 « ANNULER » EXISTE DANS LES DEUX SENS. C'était la SEULE chose qui manquait à la mécanique : le bandeau
   * n'était posé que dans le sens de la corbeille (`versLaCorbeille ? { filId } : null`).
   */
  it('🔴🔴 une réintégration pose son bandeau, et son « Annuler »', () => {
    expect(PLEIN).toContain('setReintegreFait(versLaCorbeille ? null : { filId, boite: boiteDuFil });');
    expect(PLEIN).toContain('bandeauReintegre(reintegreFait.boite ?? null)');
  });

  /**
   * ══ 🔴🔴 LE BON « ANNULER » SUR LE BON BANDEAU — DÉFAUT INTRODUIT, PUIS ATTRAPÉ À L'ÉCRAN ══════════════════════
   *
   * Les deux noms se ressemblent et ne défont pas la même chose : `annulerReintegration` lit `reintegres` (le LOT
   * de la sélection multiple), `annulerReintegrationDuMail` lit `reintegreFait` (LE mail du menu « … »).
   *
   * 🔴 BRANCHÉ SUR LA PREMIÈRE, le bouton du bandeau d'un seul mail lisait un état `null`, sortait à sa première
   * ligne, et NE FAISAIT RIEN : aucune erreur, aucun message, et le bandeau restait même affiché. MESURÉ à
   * l'écran le 03/10/2026 en instrumentant `fetch` — zéro appel après le clic, mail resté dans « Envoyés ».
   *
   * ⚠️ CETTE ÉPREUVE LIT LE BANDEAU ET SON BOUTON ENSEMBLE, parce que c'est leur APPARIEMENT qui était faux : les
   * vérifier séparément les aurait trouvés tous les deux présents, et corrects.
   */
  it('🔴🔴 chaque bandeau appelle SON annulation, pas celle du voisin', () => {
    const bloc = (apres: string): string => {
      const i = PLEIN.indexOf(apres);
      expect(i, apres).toBeGreaterThan(-1);
      return PLEIN.slice(i, PLEIN.indexOf('</p>', i));
    };
    // Le bandeau d'UN mail réintégré → l'annulation d'UN mail.
    const unMail = bloc('{bandeauReintegre(reintegreFait.boite ?? null)}');
    expect(unMail).toContain('annulerReintegrationDuMail()');
    // Le bandeau du LOT → l'annulation du LOT. Et aucun des deux ne lit l'état de l'autre.
    const leLot = bloc('{reintegres.filIds.length} échange');
    expect(leLot).toContain('annulerReintegration()');
    expect(leLot).not.toContain('annulerReintegrationDuMail');
  });

  /** 🔴 ET IL DÉFAIT PAR LE MÊME CHEMIN, pris par l'autre bout : la route de la corbeille, action « corbeille ». */
  it('🔴 « Annuler » remet le mail à la corbeille, par la même route', () => {
    const i = PLEIN.indexOf('const annulerReintegrationDuMail');
    const bloc = PLEIN.slice(i, i + 700);
    expect(bloc).toContain('gesteCorbeille(fait.filId, true)');
    // 🔴 ET LES COMPTEURS SUIVENT, dans ce sens aussi.
    expect(bloc).toContain('DELTA_FIL_CORBEILLE');
  });

  /**
   * 🔴 LES COMPTEURS DE LA COLONNE SUIVENT LA RÉINTÉGRATION, EN DIRECT. Arno le demande explicitement. Le delta
   * existait déjà (`DELTA_FIL_RESTAURE`) — ce lot ne le touche pas, il vérifie qu'il est bien posé.
   */
  it('🔴 les compteurs suivent dans les deux sens', () => {
    expect(PLEIN).toContain("compteurs: versLaCorbeille ? DELTA_FIL_CORBEILLE : DELTA_FIL_RESTAURE");
  });

  /**
   * ⚠️ LE MÊME DÉLAI QUE L'AUTRE BANDEAU. Arno : « quelques secondes, comme pour la mise à la corbeille ».
   * `DUREE_ANNULATION_MS` est la seule durée d'annulation du module : deux valeurs voisines auraient fait
   * disparaître un bandeau avant l'autre, sans raison lisible.
   */
  it('⚠️ il s’efface au même rythme que les autres', () => {
    const i = PLEIN.indexOf('if (reintegreFait === null) return;');
    expect(PLEIN.slice(i, i + 200)).toContain('DUREE_ANNULATION_MS');
  });

  /** ⚠️ AUCUNE AUTRE ACTION N'EST RETIRÉE DU MENU (demande explicite d'Arno). */
  it('⚠️ les autres entrées du menu sont intactes', () => {
    for (const mot of ["cle: 'repondre'", "cle: 'repondre_tous'", "cle: 'transferer'",
      "cle: 'transferer_piece'", "libelle: 'Supprimer'"]) {
      expect(MENU, mot).toContain(mot);
    }
  });
});
