import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  annoncerCorbeille, ecouterCorbeille, ligneQuitteLaListe, ouVaLeMail,
  type SignalCorbeille,
} from '../../../../lib/gestion/signalCorbeille';

/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LE MAIL QUITTE LA LISTE AU MÊME INSTANT ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (06/10/2026) : « après la mise à la corbeille, le mail apparaît dans la Corbeille mais reste
 * visible dans la boîte quelques secondes. Il est aux deux endroits, ce qui est impossible et donne l'impression
 * que l'action a échoué. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ — DEUX CHEMINS, DEUX RETARDS DE NATURES DIFFÉRENTES ═════════════════════════════
 *
 * ① DEPUIS LA BARRE DE SURVOL D'UNE LIGNE (`PleinEcranBoite.agirSurLigne`) : `await gesteCorbeille(…)`, puis
 *    `setVersionListe((v) => v + 1)` qui RELIT LA LISTE ENTIÈRE. La ligne restait donc affichée pendant DEUX
 *    allers-retours — l'écriture, puis la relecture.
 *
 * ② DEPUIS LE MAIL OUVERT (`Conversation.corbeilleDuMessage`) : le message était masqué dans la conversation et
 *    les compteurs recevaient leur delta, mais AUCUNE liste n'était prévenue. Son propre commentaire l'écrivait :
 *    « la LIGNE quitte ses dossiers au battement suivant de l'écran vivant ». Ce battement vaut **30 secondes**
 *    (`rafraichir.ts`). C'est le « quelques secondes » d'Arno, et il pouvait être bien plus long.
 *
 * ③ ET LA COLONNE DE L'ÉCRAN PARTAGÉ (`BoiteReception`) ne se relit QUE sur changement de filtre : la ligne y
 *    restait jusqu'au prochain clic sur un filtre, c'est-à-dire sans limite de temps.
 *
 * ═══ 🔴 LA RÈGLE, ET CE QUE CES ÉPREUVES TIENNENT ══════════════════════════════════════════════════════════════
 *
 * « Dans la même image, le mail QUITTE la liste de sa boîte, ENTRE dans la Corbeille (si elle est affichée), et
 * les compteurs se mettent à jour. L'enregistrement suit. Le mail n'est jamais visible aux deux endroits à la
 * fois. En cas d'échec, il revient à sa place, avec un message. Même règle pour “Réintégrer” et pour la
 * sélection multiple. »
 *
 * ⚠️ « ENTRE DANS LA CORBEILLE (SI ELLE EST AFFICHÉE) » — ET ELLE NE L'EST JAMAIS EN MÊME TEMPS QUE LA BOÎTE.
 * Vérifié dans le navigateur : la Corbeille est une ÉTIQUETTE de la même liste (plein écran), et la conversation
 * REMPLACE la liste dans les deux écrans. Aucun écran ne montre donc les deux à la fois. Une ligne ne peut pas
 * non plus être FABRIQUÉE dans la Corbeille : l'écran n'a pas les données d'une ligne qu'il n'a pas lue. Ce qui
 * est tenu, et qui suffit à la règle, c'est que la ligne QUITTE sa liste dans l'image du clic et que le compteur
 * « Corbeille » monte dans la même image — donc que le mail ne soit jamais compté ni montré aux deux endroits.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const GESTES = readFileSync('app/(admin)/admin/(protected)/gestion/gestesLigne.ts', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const BRC = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteReception.tsx', 'utf8');
const CNV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const PLE = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');

/** Le corps d'une fonction nommée, accolades comptées : on éprouve CE qu'elle fait, pas ce qui l'entoure. */
function corpsDe(src: string, entete: string): string {
  const i = src.indexOf(entete);
  expect(i, `introuvable : ${entete}`).toBeGreaterThan(0);
  let p = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (p === 0) return src.slice(j, k + 1); }
  }
  throw new Error(`accolades non refermées : ${entete}`);
}

const SIGNAL = (p: Partial<SignalCorbeille>): SignalCorbeille => ({
  filIds: [], messageIds: [], action: 'corbeille', annule: false, ...p,
});

describe('① le signal part AVANT l’écriture — « dans la même image »', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DU POINT 2. Tout le défaut tient dans l'ORDRE : annoncé après le `fetch`, le départ
   * de la ligne coûte un aller-retour ; annoncé avant, il est gratuit. Et cela se lit dans le texte, parce que
   * c'est une propriété du CODE, pas du réseau.
   */
  it('🔴🔴 `annoncerCorbeille` est appelée avant le `fetch` dans la porte d’écriture', () => {
    const corps = corpsDe(GESTES, 'async function appelerCorbeille(');
    const annonce = corps.indexOf('annoncerCorbeille({ ...signal, annule: false })');
    const appel = corps.indexOf('await fetch(');
    expect(annonce).toBeGreaterThan(0);
    expect(appel).toBeGreaterThan(0);
    expect(annonce, 'l’annonce doit précéder le fetch').toBeLessThan(appel);
  });

  /**
   * 🔴 UNE SEULE PORTE D'ANNONCE, parce qu'il y a une seule porte d'écriture. Les trois gestes passent par
   * `appelerCorbeille` ; annoncer dans chacun aurait donné trois occasions d'oublier l'annonce de RETOUR — celle
   * qui ne se voit jamais quand elle marche.
   */
  it('🔴 aucun écran n’annonce lui-même : la porte d’écriture est la seule à le faire', () => {
    expect(GESTES).toContain('annoncerCorbeille');
    for (const [nom, src] of [['BoiteMail', BTE], ['BoiteReception', BRC],
      ['Conversation', CNV], ['PleinEcranBoite', PLE]] as const) {
      expect(src, nom).not.toContain('annoncerCorbeille');
    }
  });

  /** 🔴 LES TROIS GESTES PASSENT BIEN PAR LÀ : fil, message, et lot. */
  it('🔴 les trois gestes appellent `appelerCorbeille`, et aucun ne fetche la route lui-même', () => {
    for (const geste of ['gesteCorbeille(', 'gesteCorbeilleMessage(', 'gesteCorbeilleLot(']) {
      expect(corpsDe(GESTES, `export async function ${geste}`)).toContain('appelerCorbeille(');
    }
  });
});

describe('② en cas d’échec, la ligne revient à sa place', () => {
  it('🔴🔴 une annonce d’annulation part quand le serveur refuse, et seulement alors', () => {
    const corps = corpsDe(GESTES, 'async function appelerCorbeille(');
    /* L'annulation est écrite UNE fois, dans `revenir`, et `revenir` est appelée aux deux formes d'échec. */
    expect(corps).toContain('annoncerCorbeille({ ...signal, annule: true })');
    expect(corps).toContain('return base.ok ? issue : revenir(issue)');
    /* Le `catch` (serveur muet) passe aussi par `revenir` : c'est l'échec qu'on oublie, parce qu'il ne se teste
       pas à la main. */
    const apresCatch = corps.slice(corps.indexOf('} catch {'));
    expect(apresCatch).toContain('revenir(');
  });

  /**
   * ⚠️ RIEN N'EST ANNONCÉ AU SUCCÈS, et c'est une différence voulue avec l'étoile : celle-ci réannonce l'état
   * CONFIRMÉ, parce que Gmail peut rendre autre chose que ce qui était demandé. Ici le geste n'a que deux
   * résultats — parti, ou resté — et une seconde annonce identique ne redemanderait aux listes que ce qu'elles
   * ont déjà fait.
   */
  it('⚠️ au succès, aucune seconde annonce', () => {
    const corps = corpsDe(GESTES, 'async function appelerCorbeille(');
    expect(corps.match(/annoncerCorbeille\(/g)).toHaveLength(2);
  });
});

describe('③ le sens du geste, calculé une seule fois, dans un module pur', () => {
  /**
   * 🔴🔴 LE PIÈGE QUE CETTE ÉPREUVE FERME, ET QUI A ÉTÉ COMMIS À L'ÉCRITURE. La première version du signal ne
   * portait qu'un booléen `versLaCorbeille`, et `supprimer` s'y rangeait avec « vers la corbeille ». Dans la liste
   * de la Corbeille cela donnait : destination corbeille, liste corbeille, donc « la ligne reste ». Faux — une
   * suppression définitive la fait partir. D'où trois destinations, dont une qui ne s'affiche nulle part.
   */
  it('🔴🔴 les trois gestes mènent à trois endroits différents', () => {
    expect(ouVaLeMail(SIGNAL({ action: 'corbeille' }))).toBe('corbeille');
    expect(ouVaLeMail(SIGNAL({ action: 'reintegrer' }))).toBe('boite');
    expect(ouVaLeMail(SIGNAL({ action: 'supprimer' }))).toBe('neant');
  });

  /**
   * 🔴 UNE ANNULATION RAMÈNE AU POINT DE DÉPART, et non à l'inverse du geste : l'échec d'une réintégration ET
   * l'échec d'une suppression ramènent tous deux DANS la corbeille, puisque les deux en partaient.
   */
  it('🔴 annulé, le mail retourne d’où il venait', () => {
    expect(ouVaLeMail(SIGNAL({ action: 'corbeille', annule: true }))).toBe('boite');
    expect(ouVaLeMail(SIGNAL({ action: 'reintegrer', annule: true }))).toBe('corbeille');
    expect(ouVaLeMail(SIGNAL({ action: 'supprimer', annule: true }))).toBe('corbeille');
  });

  it('🔴🔴 dans une boîte, c’est la mise à la corbeille qui fait sortir', () => {
    expect(ligneQuitteLaListe(SIGNAL({ action: 'corbeille' }), false)).toBe(true);
    expect(ligneQuitteLaListe(SIGNAL({ action: 'reintegrer' }), false)).toBe(false);
  });

  it('🔴🔴 dans la Corbeille, c’est l’inverse — ET la suppression fait sortir aussi', () => {
    expect(ligneQuitteLaListe(SIGNAL({ action: 'corbeille' }), true)).toBe(false);
    expect(ligneQuitteLaListe(SIGNAL({ action: 'reintegrer' }), true)).toBe(true);
    expect(ligneQuitteLaListe(SIGNAL({ action: 'supprimer' }), true)).toBe(true);
  });

  /** ⚠️ ET ANNULÉ, DANS LES DEUX LISTES, LE GESTE SE DÉFAIT EXACTEMENT. */
  it('⚠️ une annulation remet la ligne dans la liste d’où elle venait de partir', () => {
    expect(ligneQuitteLaListe(SIGNAL({ action: 'corbeille', annule: true }), false)).toBe(false);
    expect(ligneQuitteLaListe(SIGNAL({ action: 'reintegrer', annule: true }), true)).toBe(false);
    expect(ligneQuitteLaListe(SIGNAL({ action: 'supprimer', annule: true }), true)).toBe(false);
  });
});

describe('④ le registre d’auditeurs tient ses promesses', () => {
  it('🔴 tous les auditeurs sont prévenus, et le désabonnement coupe vraiment', () => {
    const vus: string[] = [];
    const off1 = ecouterCorbeille(() => vus.push('a'));
    const off2 = ecouterCorbeille(() => vus.push('b'));
    annoncerCorbeille(SIGNAL({ filIds: [1] }));
    expect(vus).toEqual(['a', 'b']);
    off1();
    annoncerCorbeille(SIGNAL({ filIds: [1] }));
    expect(vus).toEqual(['a', 'b', 'b']);
    off2();
    annoncerCorbeille(SIGNAL({ filIds: [1] }));
    expect(vus).toEqual(['a', 'b', 'b']);
  });

  /**
   * ⚠️ UNE LISTE EN FAUTE NE FAIT PAS TAIRE LES AUTRES : si la première jette, la ligne doit tout de même quitter
   * les autres listes — sans quoi l'erreur d'un écran recréerait précisément le mail « à deux endroits ».
   */
  it('⚠️ un auditeur qui jette n’empêche pas les suivants d’être prévenus', () => {
    const vus: string[] = [];
    const off1 = ecouterCorbeille(() => { throw new Error('écran en faute'); });
    const off2 = ecouterCorbeille(() => vus.push('b'));
    expect(() => annoncerCorbeille(SIGNAL({ filIds: [7] }))).not.toThrow();
    expect(vus).toEqual(['b']);
    off1(); off2();
  });
});

describe('⑤ les listes masquent sur le signal, et affichent ce qu’elles masquent', () => {
  /**
   * 🔴🔴 LE PIÈGE RENCONTRÉ À L'ÉCRITURE, ET QUI VAUT SON ÉPREUVE. `BoiteMail` a une propriété `corbeille`, et
   * elle ne dit PAS « cette liste est la Corbeille » : elle dit que le GESTE est disponible (la migration est-elle
   * appliquée). La lire pour le sens aurait inversé le comportement de TOUTES les listes dès que le geste est
   * disponible, c'est-à-dire partout. Le seul test juste est l'ÉTIQUETTE affichée.
   */
  it('🔴🔴 `BoiteMail` lit l’ÉTIQUETTE pour savoir si elle est la Corbeille, pas sa propriété `corbeille`', () => {
    expect(BTE).toContain("ligneQuitteLaListe(s, etiquette.sorte === 'corbeille')");
    expect(BTE).not.toContain('ligneQuitteLaListe(s, corbeille)');
  });

  /**
   * 🔴🔴 ET LE MASQUE SE VIDE QUAND ON CHANGE D'ÉTIQUETTE — sans quoi le correctif se retourne : l'échange jeté
   * depuis Réception serait INVISIBLE dans la Corbeille, soit le mail nulle part là où le défaut le montrait à
   * deux endroits.
   */
  it('🔴🔴 changer d’étiquette vide le masque', () => {
    expect(BTE).toContain('useEffect(() => { setPartis(new Set()); }, [etiquette.sorte]);');
  });

  /**
   * 🔴🔴 CE QUI EST AFFICHÉ EST CE QUI EST COMPTÉ. Si la pagination, le message « aucun échange », la hauteur du
   * squelette ou la mention de fin lisaient encore `etat.lignes`, l'écran annoncerait « 25 » au-dessus de 24
   * lignes — et la clé remontée au parent garderait une case cochée sur un mail qu'on ne voit plus.
   */
  it('🔴🔴 plus aucun affichage de `BoiteMail` ne lit `etat.lignes` directement', () => {
    expect(BTE).toContain('const lignesVues = etat.v === \'ok\' ? etat.lignes.filter((l) => !partis.has(l.filId)) : [];');
    for (const lu of [
      'lignes={lignesVues.length}',
      '{lignesVues.length === 0 && !(cherche && etat.brouillons.lignes.length > 0)',
      '{lignesVues.map((l) => {',
      "{etat.suivant === null && lignesVues.length > 0 && (",
    ]) expect(BTE, lu).toContain(lu);
    /**
     * ⚠️ IL N'EN RESTE QU'UNE, ET C'EST CELLE QUI FABRIQUE `lignesVues` — mesuré, commentaires retirés. Toute
     * nouvelle lecture de `etat.lignes` dans cet écran parlerait de ce que le SERVEUR a rendu là où il faut dire
     * ce qu'on AFFICHE : c'est exactement la divergence qui ferait réapparaître le nombre de lignes d'avant.
     */
    const sansCommentaires = BTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const restes = [...sansCommentaires.matchAll(/etat\.lignes/g)].length;
    expect(restes, 'etat.lignes ne doit plus servir qu’à fabriquer lignesVues').toBe(1);
  });

  /**
   * 🔴🔴 LA COLONNE DE L'ÉCRAN PARTAGÉ LIT LES DEUX DÉSIGNATIONS, et c'est la seule liste du module dans ce cas :
   * ses lignes sont des MAILS, pas des échanges. N'y lire que `filIds` aurait laissé la grande corbeille du mail
   * ouvert sans effet ; n'y lire que `messageIds` aurait laissé la barre de survol sans effet.
   */
  it('🔴🔴 `BoiteReception` masque par fil ET par message', () => {
    const corps = corpsDe(BRC, 'useEffect(() => ecouterCorbeille(');
    expect(corps).toContain('for (const id of s.filIds)');
    expect(corps).toContain('for (const id of s.messageIds)');
    expect(BRC).toContain('!partis.fils.has(l.filId) && !partis.messages.has(l.messageId)');
    expect(BRC).toContain('{lignesVues.map((l) => (');
    expect(BRC).toContain("{etat.v === 'ok' && lignesVues.length === 0 && (");
  });
});

describe('⑥ la conversation : une seule source pour le message jeté', () => {
  /**
   * 🔴🔴 `jetes` EST DÉSORMAIS PILOTÉ PAR L'ÉCOUTE, et plus posé à la main après la réponse. C'est le même
   * correctif que l'étoile au point 1, et pour la même raison : deux sources, deux moments — donc un mail encore
   * lisible dans sa conversation alors que sa ligne avait déjà quitté la boîte.
   */
  it('🔴🔴 `setJetes` ne vit plus que dans l’auditeur', () => {
    expect(CNV).toContain('useEffect(() => ecouterCorbeille((s) => {');
    const dansLAuditeur = corpsDe(CNV, 'useEffect(() => ecouterCorbeille((s) => {');
    expect(dansLAuditeur).toContain('setJetes(');
    expect([...CNV.matchAll(/setJetes\(/g)]).toHaveLength(1);
  });

  /**
   * 🔴🔴 LA LIGNE DE L'ÉCHANGE NE PART QUE SI LE FIL SE VIDE, et c'est la conversation qui le décide parce
   * qu'elle est la seule à le savoir. L'échange de douze mails dont on jette le troisième DOIT rester affiché :
   * le faire disparaître serait un mensonge pire que le retard qu'on corrige.
   */
  it('🔴🔴 le fil n’est annoncé que si ce message était le dernier hors corbeille', () => {
    const corps = corpsDe(CNV, 'async function corbeilleDuMessage(');
    expect(corps).toContain('!x.aLaCorbeille && !jetes.has(x.messageId)');
    expect(corps).toContain('restants.length === 0 ? filId : undefined');
    /* 🔴 Et la décision est prise AVANT le geste : après, elle arriverait trop tard pour « la même image ». */
    expect(corps.indexOf('const restants')).toBeLessThan(corps.indexOf('await gesteCorbeilleMessage('));
  });

  /**
   * ⚠️ LE FIL EST TOUJOURS RÉCLAMÉ À LA RÉINTÉGRATION : un échange qui n'avait plus rien hors corbeille en a de
   * nouveau un dès qu'un message y rentre. Le conditionner aurait laissé la ligne absente de sa boîte.
   */
  it('⚠️ « Annuler » réclame le fil sans condition', () => {
    expect(corpsDe(CNV, 'async function annulerCorbeilleDuMessage('))
      .toContain('gesteCorbeilleMessage(messageId, false, filId)');
  });

  /**
   * 🔴🔴 ET LE FIL ANNONCÉ NE PART JAMAIS DANS LE CORPS DE LA REQUÊTE. La route n'attend que `filIds`,
   * `messageIds` et `action` : y glisser l'identifiant du fil ferait jeter TOUT l'échange alors qu'on ne jette
   * qu'un message. C'est le défaut le plus grave que ce lot pouvait introduire — d'où son épreuve.
   */
  it('🔴🔴 `filsAnnonces` n’entre pas dans le corps envoyé au serveur', () => {
    const corps = corpsDe(GESTES, 'async function appelerCorbeille(');
    expect(corps).toContain('body: JSON.stringify(corps)');
    expect(corps).toContain('filIds: [...(corps.filIds ?? []), ...filsAnnonces]');
    /* Le corps est passé tel quel : rien n'y est ajouté entre la signature et le `fetch`. */
    const avant = corps.slice(0, corps.indexOf('await fetch('));
    expect(avant).not.toMatch(/corps\.(filIds|messageIds|action)\s*=/);
    expect(avant).not.toContain('{ ...corps,');
  });
});

describe('⑦ les écrans ne font plus dépendre le départ d’une relecture', () => {
  /**
   * 🔴🔴 LA RELECTURE RESTE, MAIS ELLE N'EST PLUS CE QUI FAIT PARTIR LA LIGNE. Elle apporte ce qu'elle seule
   * apporte — les totaux exacts, et la ligne SUIVANTE qui complète la page. La retirer aurait laissé une page de
   * 24 lignes et des compteurs figés.
   */
  it('🔴 la relecture de la liste survit, et le commentaire dit qu’elle n’est plus le ressort', () => {
    const corps = corpsDe(PLE, 'const agirSurLigne = async (');
    expect(corps).toContain('setVersionStatuts((v) => v + 1)');
    expect(corps).toContain('EST PLUS CE QUI FAIT PARTIR LA LIGNE');
  });

  /**
   * ══ 🔴🔴 LE DÉFAUT QUE SEULE LA MESURE POUVAIT TROUVER — ET LA PLUS IMPORTANTE ÉPREUVE DE CE FICHIER ════════
   *
   * `versionListe` est la CLÉ de `<BoiteMail>` : l'incrémenter DÉMONTE la liste et la remonte neuve, donc vide le
   * masque qui venait d'en retirer la ligne. MESURÉ À L'ÉCRAN (06/10/2026, étiquette Spam) : la ligne partait
   * bien en **26 ms**, puis REVENAIT. L'instantané était annulé par la ligne de code suivante.
   *
   * 🔴 LE DÉPÔT AVAIT DÉJÀ TRANCHÉ, pour une autre raison : l'encadré de `versionStatuts` dit mot pour mot qu'on
   * ne touche pas à la clé, « on perdrait la page où l'on était, la recherche tapée et la position de
   * défilement ». Vérifié à l'écran après correction : la recherche « _TEST corbeille » survit au geste.
   *
   * ⚠️ AUCUN GESTE DE CORBEILLE NE DOIT PLUS TOUCHER `setVersionListe` — ni la ligne, ni le lot, ni les annulations.
   */
  it('🔴🔴 aucun geste de corbeille ne démonte la liste', () => {
    /* ⚠️ COMMENTAIRES RETIRÉS : `agirSurLigne` CITE l'ancienne ligne dans son encadré, et doit pouvoir la citer —
       c'est ce qui explique au prochain lecteur pourquoi la clé ne se touche pas. */
    const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const fn of ['const agirSurLigne = async (', 'const reintegrer = async (',
      'const annulerReintegration = async (', 'const supprimerDefinitivement = async (',
      'const annulerReintegrationDuMail = async (', 'const annulerCorbeille = async (']) {
      expect(sansCommentaires(corpsDe(PLE, fn)), fn).not.toContain('setVersionListe');
    }
    /* 🔴 ET LA CLÉ EST BIEN `versionListe` : si elle cessait de l'être, l'épreuve ci-dessus ne protégerait plus rien. */
    expect(PLE).toContain('<BoiteMail key={versionListe}');
    /* ⚠️ LE TOTAL DE LA CORBEILLE SUIT LE MÊME BATTEMENT, sans quoi il resterait figé après chaque réintégration. */
    expect(PLE).toContain('}, [estCorbeille, versionStatuts]);');
  });

  /**
   * 🔴🔴 LA BOÎTE D'ORIGINE SE LIT AVANT LE GESTE — DÉFAUT QUE CE LOT AURAIT CRÉÉ. Elle se lisait après la
   * réponse, dans `lignesCorbeille`, qui dérive de ce que la colonne AFFICHE. La ligne partant maintenant dans
   * l'image du clic, la lecture d'après aurait rendu `null` : le bandeau aurait dit « Mail réintégré » sans
   * nommer la boîte. Tout code qui lisait l'affichage APRÈS son geste lisait en fait l'état d'AVANT, par la seule
   * grâce de la lenteur du réseau.
   */
  it('🔴🔴 `boiteDuFil` est lue AVANT `gesteCorbeille`', () => {
    const corps = corpsDe(PLE, 'const agirSurLigne = async (');
    const lecture = corps.indexOf('const boiteDuFil =');
    const geste = corps.indexOf('await gesteCorbeille(');
    expect(lecture).toBeGreaterThan(0);
    expect(geste).toBeGreaterThan(0);
    expect(lecture).toBeLessThan(geste);
  });

  /**
   * 🔴 « ANNULER » RESTE DISPONIBLE — Arno l'exige dans la même phrase. Le bandeau arrive après la confirmation,
   * lui, et c'est voulu : « Annuler » promet de défaire un ENREGISTREMENT, et l'offrir avant qu'il existe
   * laisserait cliquer dans le vide. Ce qui doit être instantané, c'est que le mail ne soit plus à deux endroits.
   */
  it('🔴 le bandeau « Annuler » et son délai sont intacts, dans les deux sens', () => {
    const corps = corpsDe(PLE, 'const agirSurLigne = async (');
    expect(corps).toContain('setCorbeilleFaite(versLaCorbeille ? { filId } : null)');
    expect(corps).toContain('setReintegreFait(versLaCorbeille ? null : { filId, boite: boiteDuFil })');
    expect(PLE).toContain('DUREE_ANNULATION_MS');
    expect(CNV).toContain('annulerCorbeilleDuMessage');
  });

  /**
   * ══ 🔴🔴 LES COMPTEURS PARTENT AVANT L'ÉCRITURE — SECONDE MOITIÉ DE LA RÈGLE, ET ELLE A ÉTÉ MANQUÉE ═════════
   *
   * MESURÉ À L'ÉCRAN (06/10/2026) : la ligne quittait la liste en **5,9 ms**, et le compteur « Corbeille » ne
   * montait qu'à **843 ms** — après la réponse du serveur (832 ms), parce que le delta s'envoyait en FIN de
   * fonction. Pendant huit dixièmes de seconde le mail n'était NULLE PART : parti de sa boîte, pas encore compté
   * dans la Corbeille. Arno met les deux dans la même phrase, donc dans la même image.
   *
   * 🔴 SEULE UNE MESURE POUVAIT LE MONTRER : les épreuves de texte voyaient bien le delta partir, et il partait
   * — simplement trop tard. C'est pourquoi celle-ci éprouve l'ORDRE, pas la présence.
   */
  it('🔴🔴 le delta de compteurs précède l’écriture, dans les deux chemins', () => {
    const plein = corpsDe(PLE, 'const agirSurLigne = async (');
    const deltaP = plein.indexOf('compteurs: versLaCorbeille ? DELTA_FIL_CORBEILLE : DELTA_FIL_RESTAURE');
    const ecritP = plein.indexOf('await gesteCorbeille(');
    expect(deltaP).toBeGreaterThan(0);
    expect(deltaP, 'le compteur doit bouger avant l’écriture').toBeLessThan(ecritP);

    const conv = corpsDe(CNV, 'async function corbeilleDuMessage(');
    const deltaC = conv.indexOf("onGeste('', { compteurs: DELTA_FIL_CORBEILLE, avantEcriture: true })");
    const ecritC = conv.indexOf('await gesteCorbeilleMessage(');
    expect(deltaC).toBeGreaterThan(0);
    expect(deltaC).toBeLessThan(ecritC);
  });

  /**
   * ══ 🔴🔴 ET LE DELTA ANTICIPÉ NE DÉCLENCHE PAS SA PROPRE RELECTURE ═════════════════════════════════════════
   *
   * MESURÉ À L'ÉCRAN (06/10/2026) : la relecture partie en même temps que le delta revenait avec le nombre
   * d'AVANT et l'écrasait — Corbeille **89** affiché contre **88** répondu par le serveur, et elle y restait.
   * D'où `avantEcriture: true` à l'aller, et une confirmation SANS delta une fois l'écriture revenue.
   */
  it('🔴🔴 le delta anticipé porte `avantEcriture`, et la confirmation suit l’écriture', () => {
    const plein = corpsDe(PLE, 'const agirSurLigne = async (');
    expect(plein).toContain('avantEcriture: true,');
    expect(plein.indexOf("onGeste('');"), 'la confirmation vient APRÈS l’écriture')
      .toBeGreaterThan(plein.indexOf('await gesteCorbeille('));
    const conv = corpsDe(CNV, 'async function corbeilleDuMessage(');
    expect(conv.indexOf("onGeste('');")).toBeGreaterThan(conv.indexOf('await gesteCorbeilleMessage('));
  });

  /**
   * 🔴🔴 ET IL SE DÉFAIT AU REFUS. Sans le delta inverse, un refus laisserait « Corbeille » compter un mail qui
   * n'y est jamais allé — jusqu'à une relecture qui peut ne jamais venir sur cet écran. C'est la moitié qu'on
   * oublie, parce qu'elle ne se voit que quand Google dit non.
   */
  it('🔴🔴 un refus rend les compteurs à leur état d’avant', () => {
    expect(corpsDe(PLE, 'const agirSurLigne = async ('))
      .toContain('onGeste(r.message, { compteurs: versLaCorbeille ? DELTA_FIL_RESTAURE : DELTA_FIL_CORBEILLE })');
    expect(corpsDe(CNV, 'async function corbeilleDuMessage('))
      .toContain('onGeste(r.message, { compteurs: DELTA_FIL_RESTAURE })');
    expect(corpsDe(CNV, 'async function annulerCorbeilleDuMessage('))
      .toContain('onGeste(r.message, { compteurs: DELTA_FIL_CORBEILLE })');
  });
});

describe('⑧ la sélection multiple suit la même règle, sans code à elle', () => {
  /**
   * 🔴 « MÊME RÈGLE POUR LA SÉLECTION MULTIPLE » (Arno) — et elle est tenue SANS RIEN ÉCRIRE DE PLUS, parce que
   * le lot passe par la même porte et que le signal porte une LISTE d'identifiants depuis le début. Un chemin
   * séparé pour le lot aurait été une seconde vérité à tenir d'accord.
   */
  it('🔴 un lot annonce tous ses échanges d’un coup', () => {
    const vus: SignalCorbeille[] = [];
    const off = ecouterCorbeille((s) => vus.push(s));
    annoncerCorbeille(SIGNAL({ filIds: [11, 22, 33], action: 'reintegrer' }));
    off();
    expect(vus).toHaveLength(1);
    expect(vus[0].filIds).toEqual([11, 22, 33]);
    expect(ligneQuitteLaListe(vus[0], true)).toBe(true);
  });

  /**
   * ⚠️ UN LOT PARTIELLEMENT REFUSÉ N'EST PAS UNE ANNULATION. `etat` vaut « ok », les lignes faites sont bien
   * parties, et l'écran de la Corbeille affiche déjà le compte des refusées. Tout remettre serait faux pour la
   * majorité qui a réussi — c'est pourquoi le retour ne dépend que de `ok`, jamais de `faits`.
   */
  it('⚠️ le retour en arrière ne dépend que de `ok`, jamais du compte des faits', () => {
    const corps = corpsDe(GESTES, 'async function appelerCorbeille(');
    expect(corps).toContain('return base.ok ? issue : revenir(issue)');
    expect(corps).not.toMatch(/revenir\([^)]*\)\s*;?\s*\/\/.*faits/);
    expect(corps).not.toContain('d.faits === 0 ? revenir');
  });
});

describe('⑨ le module du signal reste importable d’un `use client`', () => {
  /**
   * 🔴🔴 LA RÈGLE DU DÉPÔT DEPUIS L'INCIDENT DU 24/09/2026 : un module tiré par un composant client ne doit
   * atteindre NI `pg`, NI le réseau, NI React. Le garde de graphe l'attrape dans la suite ; ceci le dit à
   * l'endroit où on écrirait l'import de trop.
   */
  it('🔴🔴 aucun import, aucune I/O, aucun React dans `signalCorbeille`', () => {
    const src = readFileSync('app/lib/gestion/signalCorbeille.ts', 'utf8');
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('require(');
  });
});

describe('⑩ le contrat retourné aux écrans n’a pas changé', () => {
  /**
   * ⚠️ CE QUE LES ÉCRANS LISENT DOIT RESTER CE QU'ILS LISAIENT : `ok` et `message` pour un geste simple, plus
   * `faits`, `refuses` et `droitManquant` pour un lot. Le point 2 change QUAND les listes apprennent le départ,
   * pas ce que la porte rapporte — et un `revenir` qui aurait avalé l'issue aurait fait disparaître le message
   * d'erreur que la règle exige (« il revient à sa place, avec un message »).
   */
  const fetchOrigine = globalThis.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = fetchOrigine; });

  it('🔴🔴 un refus rend l’issue ET annonce l’annulation', async () => {
    const { gesteCorbeille } = await import('./gestesLigne');
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ etat: 'erreur', message: 'Google a refusé.' }), { status: 200 },
    )) as unknown as typeof fetch;
    const vus: SignalCorbeille[] = [];
    const off = ecouterCorbeille((s) => vus.push(s));
    const r = await gesteCorbeille(4242, true);
    off();
    expect(r).toEqual({ ok: false, message: 'Google a refusé.' });
    expect(vus.map((s) => s.annule)).toEqual([false, true]);
    expect(vus[0].filIds).toEqual([4242]);
    expect(vus[1].filIds).toEqual([4242]);
  });

  it('🔴 un succès rend l’issue et n’annonce rien de plus', async () => {
    const { gesteCorbeille } = await import('./gestesLigne');
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ etat: 'ok', message: 'Mail mis à la corbeille.' }), { status: 200 },
    )) as unknown as typeof fetch;
    const vus: SignalCorbeille[] = [];
    const off = ecouterCorbeille((s) => vus.push(s));
    const r = await gesteCorbeille(4242, true);
    off();
    expect(r).toEqual({ ok: true, message: 'Mail mis à la corbeille.' });
    expect(vus.map((s) => s.annule)).toEqual([false]);
  });

  /** 🔴 LE SERVEUR MUET EST UN ÉCHEC COMME UN AUTRE : la ligne revient, et le message le dit. */
  it('🔴 un serveur muet fait revenir la ligne', async () => {
    const { gesteCorbeilleLot } = await import('./gestesLigne');
    globalThis.fetch = vi.fn(async () => { throw new Error('réseau coupé'); }) as unknown as typeof fetch;
    const vus: SignalCorbeille[] = [];
    const off = ecouterCorbeille((s) => vus.push(s));
    const r = await gesteCorbeilleLot([7, 8], 'supprimer');
    off();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('n’a pas répondu');
    expect(r.faits).toBe(0);
    expect(vus.map((s) => s.annule)).toEqual([false, true]);
    expect(vus[1].action).toBe('supprimer');
  });

  /** ⚠️ ET LE FIL ANNONCÉ EN PLUS VOYAGE DANS LE SIGNAL, JAMAIS DANS LE CORPS ENVOYÉ. */
  it('⚠️ un message jeté annonce son fil sans l’envoyer au serveur', async () => {
    const { gesteCorbeilleMessage } = await import('./gestesLigne');
    const corpsEnvoyes: string[] = [];
    globalThis.fetch = vi.fn(async (_u: unknown, o: { body?: string } = {}) => {
      corpsEnvoyes.push(o.body ?? '');
      return new Response(JSON.stringify({ etat: 'ok' }), { status: 200 });
    }) as unknown as typeof fetch;
    const vus: SignalCorbeille[] = [];
    const off = ecouterCorbeille((s) => vus.push(s));
    await gesteCorbeilleMessage(999, true, 36748);
    off();
    expect(vus[0].messageIds).toEqual([999]);
    expect(vus[0].filIds).toEqual([36748]);
    /* 🔴 LE CORPS NE PORTE QUE LE MESSAGE : sinon on jetterait tout l'échange. */
    expect(JSON.parse(corpsEnvoyes[0])).toEqual({ messageIds: [999], action: 'corbeille' });
  });
});
