import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { eclaterNom, verifierNom, NOM_MAX } from './renommagePiece';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 1 — RENOMMER DEPUIS LA FENÊTRE DU DRIVE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) :
 *   a) « Un picto ✏️ “Renommer” dans la petite barre qui apparaît au survol d'une ligne, à côté de 👁, 📎 et 🔗 […]
 *      seule la partie SANS l'extension est sélectionnée, et l'extension n'est jamais modifiable. Entrée valide,
 *      Échap annule. Nom vide ou caractères interdits refusés, avec un message clair. »
 *   b) « Dans la visionneuse ouverte depuis cette fenêtre (👁) : le module de changement de nom au-dessus de
 *      l'image. Réutilise le composant […] Ne le recopie pas. »
 *   « Les deux nouveaux moyens appliquent EXACTEMENT la même règle, par le même code serveur. Pas de second
 *   chemin […] Le renommage ne fait jamais de copie et ne revient jamais en arrière tout seul. »
 *
 * ═══ 🔴🔴 CE QUE CE FICHIER ÉPROUVE, ET POURQUOI C'EST CELA QU'IL FAUT ÉPROUVER ══════════════════════════════════
 *
 * La RÈGLE du renommage était déjà écrite, et elle était déjà éprouvée : `renommagePiece.test.ts` pour le module
 * pur, `renommageDrive.test.ts` pour l'écriture `files.update(name)`, `driveRouteFichiers.test.ts` pour la route.
 * Ce lot n'a pas ajouté une règle : il a ouvert DEUX PORTES de plus sur la même.
 *
 * 🔴 LE RISQUE DE CE LOT N'EST DONC PAS QUE LA RÈGLE SOIT FAUSSE — C'EST QU'UNE PORTE SE METTE À EN APPLIQUER UNE
 * AUTRE. Un second `fetch`, un second nettoyage de nom « équivalent », une extension recalculée au rendu : trois
 * façons de se retrouver avec deux vérités, dont la deuxième dériverait au premier correctif. C'est exactement ce
 * que le point 4 de ce même lot vient de payer ailleurs (la modale disait « À classer », la liste « Interne »).
 *
 * On éprouve donc le CÂBLAGE : un seul écrivain, une seule route, un seul juge.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const SFD = readFileSync('app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx', 'utf8');
const APD = readFileSync('app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx', 'utf8');
/**
 * ⚠️ LE SOURCE SANS SES COMMENTAIRES, pour les assertions qui COMPTENT. Les encadrés de ce lot NOMMENT la route
 * et les fonctions dont ils parlent — c'est même leur utilité — et un comptage brut les prendrait pour des appels.
 * Un test qui se trompe sur ce qu'il compte interdit d'écrire la documentation qui explique le code.
 */
const SFD_CODE = SFD.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
  .filter((l) => !l.trimStart().startsWith('//')).join('\n');

describe('🔴🔴 ① le crayon ✏️ de la ligne', () => {
  /** 🔴 IL EST DANS LA BARRE DE SURVOL, à côté des trois autres — pas ailleurs, pas dans un menu. */
  it('🔴 le picto ✏️ vit dans la barre de survol, avec 👁, 📎 et 🔗', () => {
    const i = SFD.indexOf('<span className="sfd-gestes"');
    expect(i).toBeGreaterThan(0);
    const barre = SFD.slice(i, SFD.indexOf('</span>', SFD.indexOf('aria-label={`Renommer', i)));
    for (const picto of ['👁', '📎', '🔗', '✏️']) expect(barre, picto).toContain(picto);
    expect(barre).toContain('title="Renommer"');
    /* ⚠️ UN LIBELLÉ ACCESSIBLE QUI NOMME LE FICHIER : quatre boutons identiques au lecteur d'écran seraient
       quatre « bouton » sans sujet. */
    expect(barre).toContain('aria-label={`Renommer ${f.nom}`}');
  });

  /**
   * ══ 🔴🔴 PAS DE CRAYON SOUS « Documents clients scannés » ═══════════════════════════════════════════════════
   *
   * Arno : « 🔴 Une copie située dans “Documents clients scannés” n'est JAMAIS renommée. » C'est le SEUL endroit
   * où l'écran sait d'avance que le refus est certain : le serveur lui dit, pour le dossier entier, que la
   * lecture y est refusée (`joindreAutorise`). Offrir un geste dont on SAIT qu'il sera refusé, dans le dossier le
   * plus sensible du Drive, ferait croire que l'archive s'écrit.
   *
   * ⚠️ LA MÊME CONDITION ÉCARTE LES « ._ » DE macOS : ni dans notre registre, ni des documents. Et elle n'écarte
   * RIEN D'AUTRE — partout ailleurs le crayon est allumé, parce que le dernier refus possible (« hors registre »)
   * demande notre base, que l'écran n'a pas. Le comportement en dossier ordinaire et sous l'archive est éprouvé
   * au rendu par `SelecteurFichierDrive.finder.test.ts` ; ici on fige la CONDITION.
   */
  it('🔴🔴 le crayon suit `lisible` : rien sous l’archive, rien sur un « ._ »', () => {
    expect(SFD).toContain('{lisible && (\n                                <button type="button" '
      + 'className="sfd-geste" title="Renommer"');
    expect(SFD).toContain('const lisible = joindreOk && !systeme;');
    expect(SFD).toContain('const joindreOk = listing?.joindreAutorise === true;');
  });

  /**
   * 🔴🔴 ENTRÉE VALIDE, ÉCHAP ANNULE — ET ÉCHAP NE REMONTE PAS. C'est la partie qu'on oublie : la fenêtre du Drive
   * ferme TOUT sur Échap. Sans `stopPropagation`, abandonner un nom fermerait le Drive entier, et l'on perdrait
   * l'arbre déplié, la sélection, les pièces en cours de rangement.
   */
  it('🔴🔴 Entrée valide, Échap annule, et Échap ne ferme pas la fenêtre', () => {
    const i = SFD.indexOf('className="sfd-renom-champ"');
    expect(i).toBeGreaterThan(0);
    const champ = SFD.slice(i, SFD.indexOf('sfd-renom-ext', i));
    expect(champ).toContain("if (e.key === 'Enter') { e.preventDefault(); validerRenommageLigne(); return; }");
    expect(champ).toContain("if (e.key === 'Escape')");
    expect(champ).toContain('e.stopPropagation(); annulerRenommageLigne();');
  });

  /**
   * 🔴🔴 L'EXTENSION N'EST PAS DANS LE CHAMP — elle est à côté, en texte. C'est la seule façon de tenir
   * « l'extension n'est jamais modifiable » : un champ désactivé se contourne, un texte n'existe pas comme saisie.
   */
  it('🔴🔴 l’extension est un texte à côté du champ, jamais une saisie', () => {
    expect(SFD).toContain('<span className="sfd-renom-ext" aria-hidden="true">{renommageLigne.extension}</span>');
    /* ⚠️ ET LE CHAMP NE PORTE QUE LA BASE : s'il portait le nom entier, taper par-dessus effacerait l'extension. */
    expect(SFD).toContain('value={renommageLigne.base}');
    expect(SFD).not.toContain('value={renommageLigne.nomOrigine}');
  });

  /**
   * 🔴🔴 L'EXTENSION EST FIGÉE À L'OUVERTURE, PAS RECALCULÉE AU RENDU. Recalculée, elle changerait sous les
   * doigts : taper « Bail 2026.03 » sur un PDF verrait « .03 » devenir l'extension au milieu de la saisie, et la
   * fin du nom cesserait d'être modifiable. C'est `ouvrirRenommageLigne` qui la décide, une fois.
   */
  it('🔴🔴 l’extension est décidée une seule fois, à l’ouverture', () => {
    const i = SFD.indexOf('const ouvrirRenommageLigne');
    const f = SFD.slice(i, SFD.indexOf('const annulerRenommageLigne', i));
    expect(f).toContain('eclaterNom(f.nom, f.typeMime)');
    /* ⚠️ ET LE RENDU N'EN CALCULE AUCUNE : un seul appel dans tout le fichier, celui-ci. */
    expect((SFD_CODE.match(/eclaterNom\(/g) ?? [])).toHaveLength(1);
  });

  /**
   * ⚠️ LA SÉLECTION N'A LIEU QU'AU PREMIER MONTAGE. Le champ est CONTRÔLÉ : sélectionner à chaque rendu
   * resélectionnerait tout après chaque lettre, et la suivante l'écraserait — on taperait quarante caractères, il
   * en resterait UN. Le piège a déjà coûté un lot sur la ligne de création de dossier.
   */
  it('⚠️ le nom est sélectionné une seule fois, pas à chaque frappe', () => {
    expect(SFD).toContain('if (el === null || baseDejaSelectionnee.current) return;');
    expect(SFD).toContain('baseDejaSelectionnee.current = true;');
    /* 🔴 ET LE DRAPEAU EST REMIS À ZÉRO À CHAQUE OUVERTURE, sinon la deuxième ligne qu'on renomme s'ouvrirait
       sans rien de sélectionné. */
    expect(SFD).toContain('baseDejaSelectionnee.current = false;');
  });

  /**
   * 🔴🔴 UN REFUS NE SE TRAITE PAS PAREIL SELON LE GESTE, et c'est un cul-de-sac qu'on évite. Sur ENTRÉE le champ
   * reste ouvert avec son message — on corrige sans retaper. Sur un CLIC AILLEURS on ABANDONNE : le champ n'a plus
   * le focus, donc Échap ne lui parviendrait plus et fermerait la fenêtre entière. Rien n'est perdu : rien n'a été
   * écrit.
   */
  it('🔴🔴 refus sur Entrée = champ ouvert ; refus sur clic ailleurs = abandon', () => {
    const i = SFD.indexOf('const validerRenommageLigne');
    const f = SFD.slice(i, SFD.indexOf('/** Le voisinage du tour', i));
    expect(f).toContain('const validerRenommageLigne = (parClicAilleurs = false): void => {');
    expect(f).toContain('if (parClicAilleurs) { setRenommageLigne(null); return; }');
    expect(f).toContain('setRenommageLigne({ ...r, erreur: verdict.refus });');
    expect(SFD).toContain('onBlur={() => validerRenommageLigne(true)}');
  });

  /**
   * 🔴 UN NOM INCHANGÉ N'ÉCRIT RIEN. Envoyer quand même ferait une écriture Drive, une ligne de journal et une
   * relecture de dossier pour rien — et ferait mentir le journal sur ce qui s'est passé.
   */
  it('🔴 un nom inchangé ne part pas au Drive', () => {
    const i = SFD.indexOf('const validerRenommageLigne');
    const f = SFD.slice(i, SFD.indexOf('/** Le voisinage du tour', i));
    expect(f).toContain('if (verdict.nom === r.nomOrigine) { setErreur(verdict.remarque); return; }');
  });

  /**
   * ══ 🔴🔴 L'EXTENSION DOIT ÊTRE LISIBLE — DÉFAUT MESURÉ À L'ÉCRAN ═══════════════════════════════════════════
   *
   * CONSTAT (04/10/2026, dossier « Test », en Sombre) : « .pdf » s'affichait tronqué en « .pc ». La barre de
   * gestes est posée en ABSOLU sur la droite de la ligne, et elle passait par-dessus la fin de la zone de saisie.
   * Or l'extension est précisément ce qu'on doit pouvoir LIRE, puisqu'on ne peut pas la modifier.
   *
   * 🔴 LA PLACE EST RÉSERVÉE, LA BARRE N'EST PAS MASQUÉE. Cacher les quatre gestes pendant l'édition aurait
   * retiré des fonctionnalités de l'écran — ce qui ne se fait pas sans l'accord d'Arno.
   *
   * ⚠️ APRÈS CORRECTION, MESURÉ DANS LE NAVIGATEUR : extension à 964 px, barre à 1068 px — plus de recouvrement.
   */
  it('🔴🔴 la saisie réserve la place de la barre de gestes', () => {
    expect(SFD).toContain('.sfd-renom{display:flex;align-items:center;gap:4px;flex:1 1 auto;min-width:0;'
      + 'padding-right:112px}');
  });

  /** ⚠️ LE CLIC DANS LE CHAMP N'ATTEINT PAS LA LIGNE : elle sélectionne, déplie, et ouvre au double-clic. */
  it('⚠️ le clic et le double-clic sont arrêtés dans la zone de saisie', () => {
    const i = SFD.indexOf('<span className="sfd-renom"');
    const zone = SFD.slice(i, SFD.indexOf('className="sfd-renom-champ"', i));
    expect(zone).toContain('onClick={(e) => e.stopPropagation()}');
    expect(zone).toContain('onDoubleClick={(e) => e.stopPropagation()}');
  });
});

describe('🔴🔴 ② la visionneuse ouverte par 👁 renomme aussi un fichier du Drive', () => {
  /**
   * 🔴🔴 LE COMPOSANT EST RÉUTILISÉ, PAS RECOPIÉ. Le module de nom vit dans `ApercuFichierDrive` depuis le lot
   * RENOMMER-AVANT-RANGER, et il est piloté par la seule prop `renommage`. Ce lot la REND pour un fichier du
   * Drive ; il n'ajoute aucun champ, aucun bouton « Valider », aucune règle de nom dans la fenêtre du Drive.
   */
  it('🔴🔴 aucun second module de nom n’a été écrit dans la fenêtre du Drive', () => {
    /* Le vrai module : il vit dans la visionneuse, et lui seul porte ces marques. */
    expect(APD).toContain('const verdict = verifierNom(saisie, extension);');
    expect(APD).toContain('className="apd-champ-nom"');
    /* 🔴 ET LA FENÊTRE DU DRIVE N'EN A PAS UNE COPIE : ni le champ, ni son bouton, ni son bandeau. */
    for (const marque of ['apd-champ-nom', 'apd-nommage', 'Nom du fichier']) {
      expect(SFD, marque).not.toContain(marque);
    }
  });

  /** 🔴 LA PROP EST RENDUE POUR UN FICHIER DU DRIVE, et câblée au MÊME écrivain que le crayon de la ligne. */
  it('🔴🔴 le même écrivain pour les deux portes : renommerPourDeVrai', () => {
    const i = SFD.indexOf('if (v === undefined) {');
    expect(i).toBeGreaterThan(0);
    const branche = SFD.slice(i, SFD.indexOf('return {', SFD.indexOf('nomOrigine: v.nom', i)));
    expect(branche).toContain('void renommerPourDeVrai({ driveFileId: idAffiche }, nom);');
    expect(branche).toContain('editerDabord: false');
    /* ⚠️ `nomChoisi: null` : « nom choisi » veut dire « nom sous lequel la copie naîtra ». Un fichier qui existe
       déjà n'en a pas, et en mettre un ferait apparaître « reçue sous : … » sous un fichier que personne n'a reçu. */
    expect(branche).toContain('nomChoisi: null');
  });

  /**
   * 🔴🔴 LE NOM EST CHERCHÉ PAR `idAffiche`, JAMAIS LU DANS `aVoir`. « Précédent / Suivant » change de document
   * DANS la visionneuse sans que la fenêtre du Drive en sache rien : lire `aVoir.nom` aurait affiché le nom du
   * PREMIER document au-dessus du troisième, et renommé le mauvais fichier. L'encadré de la prop annonce ce piège
   * depuis le 30/09/2026, et il a déjà été payé une fois sur les pièces.
   */
  it('🔴🔴 le nom suit le document AFFICHÉ, pas celui qu’on avait cliqué', () => {
    expect(SFD).toContain(
      'const nomVu = [...listing.dossiers, ...listing.fichiers].find((x) => x.id === idAffiche)?.nom');
    expect(SFD).toContain('?? (aVoir.id === idAffiche ? aVoir.nom : null);');
    expect(SFD).toContain('if (nomVu === null) return undefined;');
  });
});

describe('🔴🔴 ③ un seul chemin d’écriture, et un seul juge', () => {
  /**
   * 🔴🔴 UNE SEULE ROUTE DE RENOMMAGE DANS TOUTE LA FENÊTRE. Arno : « par le même code serveur. Pas de second
   * chemin. » Un `fetch` de plus vers une autre route — ou vers la même avec un autre corps — serait le début de
   * la divergence.
   */
  it('🔴🔴 un seul appel à /drive/renommer, et aucune autre route de nom', () => {
    expect((SFD_CODE.match(/drive\/renommer/g) ?? [])).toHaveLength(1);
    /* ⚠️ `renommerPourDeVrai` EST LE SEUL À APPELER LE RÉSEAU : les deux nouvelles portes passent par lui. */
    const i = SFD.indexOf('const renommerPourDeVrai');
    const f = SFD.slice(i, SFD.indexOf('const ouvrirRenommageLigne', i));
    expect(f).toContain("await fetch('/api/admin/gestion/drive/renommer'");
    expect(f).toContain("method: 'PATCH'");
    /* 🔴 JAMAIS DE COPIE : ni `files.copy`, ni une route de duplication, dans le chemin du renommage. */
    expect(f).not.toContain('copier');
    expect(f).not.toContain('dupliquer');
  });

  /**
   * 🔴🔴 LE JUGE DE L'ÉCRAN EST CELUI DU SERVEUR. `verifierNom` est le module PUR que la route appelle elle aussi,
   * juste avant d'écrire. Si l'écran jugeait avec sa propre règle, on verrait un nom s'afficher puis un refus —
   * ou l'inverse, ce qui est pire : un nom accepté par l'écran et silencieusement nettoyé ailleurs.
   */
  it('🔴🔴 l’écran juge avec le module pur du serveur, pas avec une règle à lui', () => {
    expect(SFD).toContain('verifierNom(r.base, r.extension)');
    const route = readFileSync('app/(admin)/api/admin/gestion/drive/renommer/route.ts', 'utf8');
    expect(route).toContain('const verdict = verifierNom(voulu, extension);');
    expect(route).toContain("from '../../../../../../lib/gestion/renommagePiece'");
  });

  /**
   * 🔴🔴 LA COPIE SOUS « Documents clients scannés » EST IGNORÉE ET SIGNALÉE (mot pour mot la demande d'Arno).
   * Le refus est prononcé par le SERVEUR — seul à pouvoir remonter la chaîne de parents chez Google — et l'écran
   * le lit à voix haute. Il n'est JAMAIS tu, et il n'arrête pas les autres copies.
   */
  it('🔴🔴 une copie refusée est dite, et n’arrête pas les autres', () => {
    expect(SFD).toContain('`${refus.length} copie(s) du Drive n’ont pas suivi : ${refus[0].motif}`');
    /* 🔴 ET LA REMARQUE DE SAISIE SURVIT AU RETOUR DU RÉSEAU : posée avant l'appel, elle aurait été effacée par
       le `setErreur` de la réponse, et le nom aurait changé sans un mot. */
    expect(SFD).toContain("const aDire = [remarque, motRefus].filter((x) => x !== null).join(' ') || null;");
    expect(SFD).toContain('void renommerPourDeVrai({ driveFileId: r.fileId }, verdict.nom, verdict.remarque);');
  });

  /**
   * ══ 🔴🔴 L'ORDRE DES DEUX DERNIÈRES LIGNES EST LE CORRECTIF DU 04/10/2026 ══════════════════════════════════
   *
   * DÉFAUT MESURÉ À L'ÉPREUVE RÉELLE, dans le dossier « Test ». Le renommage de « Recommandé M Ahmed
   * KHARRAT.pdf » a réussi sur QUATRE copies et en a refusé UNE — la réponse du serveur le disait noir sur blanc
   * (`refus: [{ motif: "la chaîne de parents … n'a pas pu être lue" }]`). L'écran n'a rien affiché : le message
   * partait AVANT `charger`, dont la première instruction est `setErreur(null)`, de façon synchrone. La mise en
   * garde était écrite puis effacée dans le même tour de rendu.
   *
   * 🔴 C'EST LA PHRASE QU'ARNO DEMANDE pour une copie sous « Documents clients scannés » : « elle est ignorée et
   * signalée ». Signalée dans une variable que personne ne voit ne l'est pas.
   *
   * ⚠️ AUCUN TYPE NE DÉFENDRAIT CET ORDRE : remettre les deux lignes dans l'autre sens compile, passe le reste de
   * la suite, et fait revenir le défaut en silence. D'où ce test, qui ne vérifie QUE l'ordre.
   */
  it('🔴🔴 le message est posé APRÈS la relecture du dossier, jamais avant', () => {
    const i = SFD.indexOf('const renommerPourDeVrai');
    const f = SFD.slice(i, SFD.indexOf('const ouvrirRenommageLigne', i));
    const relecture = f.indexOf('void charger(id);');
    const message = f.indexOf('setErreur(aDire);');
    expect(relecture).toBeGreaterThan(0);
    expect(message).toBeGreaterThan(0);
    expect(message, 'setErreur(aDire) doit venir APRÈS void charger(id)').toBeGreaterThan(relecture);
    /* ⚠️ ET `charger` EFFACE BIEN L'ERREUR EN PREMIER : c'est la raison d'être de l'ordre. Si cela changeait,
       ce test devrait être relu — et non l'ordre rétabli au hasard. */
    const c = SFD.slice(SFD.indexOf('const charger = useCallback'));
    expect(c.slice(0, c.indexOf('await'))).toContain('setErreur(null);');
  });

  /**
   * 🔴🔴 ET LE NOM NE REVIENT JAMAIS EN ARRIÈRE TOUT SEUL. Arno : « bug déjà corrigé une fois : 63 ms, ne le
   * réintroduis pas. » La garde de ce retour en arrière est que l'écran ne remet PAS l'ancien nom quand le
   * serveur refuse : il le DIT. On fige donc l'absence de toute remise en place silencieuse.
   */
  it('🔴🔴 aucun retour en arrière silencieux sur refus', () => {
    const i = SFD.indexOf('const renommerPourDeVrai');
    const f = SFD.slice(i, SFD.indexOf('const ouvrirRenommageLigne', i));
    expect(f).toContain("if (d.etat !== 'ok') { setErreur(d.message ?? 'Le renommage n’a pas abouti.'); return; }");
    /* ⚠️ LE `return` EST LA GARDE : rien après lui ne réécrit un nom. Et aucun `setTimeout` ne vit dans ce
       chemin — c'était la forme du défaut des 63 ms. */
    expect(f).not.toContain('setTimeout');
  });
});

describe('🔴 ④ la règle elle-même, par l’exemple (module pur)', () => {
  /**
   * ⚠️ CES CAS SONT CEUX DES MESSAGES D'ARNO, repris ici pour que le lot soit lisible seul. Ils redisent ce que
   * `renommagePiece.test.ts` éprouve déjà : c'est voulu, c'est la preuve que les deux portes n'ont pas besoin
   * d'une règle à elles.
   */
  it('🔴 l’extension vient du nom, sinon du type, et ne double jamais', () => {
    expect(eclaterNom('Bail Dupont.pdf')).toEqual({ base: 'Bail Dupont', extension: '.pdf' });
    /* 🔴 LE CAS RÉEL D'ARNO : un nom qui finit par « [octets] » n'a pas d'extension — c'est le TYPE qui la donne. */
    expect(eclaterNom('_MESURE 1790804662784 0836_001.pdf [octets]', 'application/pdf'))
      .toEqual({ base: '_MESURE 1790804662784 0836_001.pdf [octets]', extension: '.pdf' });
    expect(verifierNom('reco renomage.pdf', '.pdf').nom).toBe('reco renomage.pdf');
    expect(verifierNom('reco renomage', '.pdf').nom).toBe('reco renomage.pdf');
  });

  it('🔴 un nom vide est refusé, et les caractères interdits sont retirés en le DISANT', () => {
    expect(verifierNom('   ', '.pdf').refus).toBe('Le nom ne peut pas être vide.');
    /* ⚠️ UNE SAISIE QUI N'EST QUE L'EXTENSION SE VIDE, et le refus part : sinon on produirait « .pdf.pdf ». */
    expect(verifierNom('.pdf', '.pdf').refus).toBe('Le nom ne peut pas être vide.');
    const v = verifierNom('Facture 12/2025', '.pdf');
    expect(v.nom).toBe('Facture 122025.pdf');
    expect(v.refus).toBeNull();
    expect(v.remarque).toContain('interdits dans un nom de fichier');
  });

  /** ⚠️ LA LONGUEUR DU CHAMP EST CELLE QUI RESTE APRÈS L'EXTENSION : c'est elle que le serveur bornera. */
  it('⚠️ la longueur du champ laisse la place à l’extension', () => {
    expect(SFD).toContain('maxLength={Math.max(1, NOM_MAX - renommageLigne.extension.length)}');
    expect(NOM_MAX).toBe(200);
    expect(verifierNom('x'.repeat(300), '.pdf').nom.length).toBe(NOM_MAX);
  });
});
