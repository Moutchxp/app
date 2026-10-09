import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etiquettesDeLEcran } from './GestionVue';
import { ETAT_DEFAUT, memeEtat, type EtatEcranUrl } from '../../../../lib/gestion/ecranUrl';
import { motNonLusSur } from '../../../../lib/gestion/uniteListe';
import type { EtatEcran } from '../../../../lib/gestion/fileRepo';

/**
 * ══ 🔴🔴 LOT FILTRE-NON-LUS-BLOQUANT (09/10/2026) ═══════════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO, dans la boîte en plein écran :
 *   « Clic sur “27 non lus” → la liste ne montre que les 27 (normal). MAIS ensuite : clic sur “Réception” → il ne
 *     se passe RIEN, on reste bloqué sur les 27 non lus. ET en mode non-lus, la colonne de gauche perd des
 *     informations : le total de Réception disparaît, les compteurs d'Envoyés, Courrier automatique, À classer,
 *     Spam disparaissent, et l'entrée “Corbeille” disparaît complètement. »
 *
 * ══ CE QUE LA MESURE A TROUVÉ, ET QUI N'ÉTAIT PAS CE QU'ON CROYAIT ══════════════════════════════════════════════
 *
 * ① LE BLOCAGE EST RÉEL, et sa cause est en un mot : `allerAuDossier` ne touchait pas au filtre. L'étiquette ne
 *    changeait pas non plus (on était déjà sur Réception) : le clic n'écrivait donc RIEN, et l'écran ne bougeait
 *    pas. Ce n'était pas une entrée morte, c'était une entrée qui n'avait rien à dire.
 *
 * ② LA COLONNE, ELLE, NE DÉPEND PAS DU FILTRE — vérifié à l'écran : un chargement direct de `?filtre=non-lus`
 *    rend une colonne COMPLÈTE, Corbeille comprise. Ce qui la vide, c'est `comptesBoite` resté `null`, et ce
 *    `null` pouvait durer : la garde d'unicité consommait la version AVANT la requête, de sorte qu'une lecture
 *    seulement ABANDONNÉE (changement d'écran pendant les ~124 ms qu'elle prend) n'était jamais reprise.
 *
 * ③ ET IL Y AVAIT UN TROISIÈME DÉFAUT, TROUVÉ EN VÉRIFIANT : entrer dans « non lus » puis cliquer « À classer »
 *    écrivait **27** comme total de « À classer » dans la colonne — un nombre filtré, remonté comme total d'un
 *    dossier entier, et qui y restait.
 */

const PLEIN = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');

const ecran = (o: Partial<EtatEcran> = {}): EtatEcran => ({
  file: [], filsTotal: 442, fenetreJours: 30, filsTropAnciens: 12,
  sansSuite: [], sansSuiteTotal: 7, evenements: [], evenementsTotal: 0, evenementsOuverts: 0,
  messagesCaptures: 56000, messagesExclus: 40000, derniereReleveLe: '2026-10-09T10:00:00Z',
  dernierMailLe: '2026-10-09T09:42:00Z',
  veille: { derniereLe: '2026-10-09T10:00:00Z', resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10 },
  suite: { resultat: 'ok', detail: 'rien de nouveau à rattacher', ms: 5 },
  copie: { derniere: null, restantes: null, motifs: [] },
  ...o,
});

describe('🔴🔴 ① le clic sur « Réception » rend la liste complète', () => {
  /**
   * 🔴🔴 LA CAUSE, FIGÉE : le geste des entrées de colonne emporte le filtre avec lui, et son défaut est
   * `null` — la liste entière. Arno : « Clic sur “Réception” = toujours la liste COMPLÈTE de la réception. »
   */
  it('🔴🔴 le geste des entrées pose le filtre, et son défaut est « aucun »', () => {
    expect(PLEIN).toContain("const allerAuDossier = (e: Etiquette, f: 'non-lus' | null = null): void => {");
    expect(PLEIN).toContain('onEtiquette(e, f);');
  });

  /**
   * 🔴🔴 UN SEUL `aller()`, ET C'EST UNE CORRECTION À PART ENTIÈRE. L'écriture d'avant enchaînait
   * `allerAuDossier(e.etiquette); onFiltre('non-lus');` : les deux partaient du MÊME instantané `etatUrl`, et le
   * second écrasait l'étiquette du premier. Le défaut ne se voyait pas tant qu'on cliquait « N non lus » depuis
   * Réception, déjà ouverte — il serait apparu au premier sélecteur posé ailleurs.
   */
  it('🔴🔴 l’étiquette et le filtre partent ensemble, jamais en deux écritures', () => {
    expect(PLEIN).not.toContain("onFiltre('non-lus');");
    expect(PLEIN).not.toContain('onFiltre(null); }}');
    expect(VUE).toContain('aller({ ...etatUrl, etiquette: e, filtre: f ?? null, etoile: false, filOuvert: null });');
  });

  /** 🔴 « N non lus » EST UNE BASCULE : Arno, « 2e clic sur le même lien = retour à la liste complète ». */
  it('🔴🔴 « N non lus » bascule, le total rend la liste entière', () => {
    expect(PLEIN).toContain("onClick={() => allerAuDossier(e.etiquette, filtre === 'non-lus' ? null : 'non-lus')}");
    expect(PLEIN).toContain('onClick={() => allerAuDossier(e.etiquette, null)}');
  });

  /**
   * 🔴🔴 ET LE « PRÉCÉDENT » DU NAVIGATEUR MARCHE — c'est une VRAIE épreuve, sur le module pur qui en décide.
   *
   * `memeEtat` dit à `aller()` s'il faut empiler une entrée d'historique ou remplacer la courante. Ni `filtre`
   * ni `etoile` n'y figuraient : passer en « non lus » était donc tenu pour le MÊME état, écrit en
   * `replaceState`, et « Précédent » sautait par-dessus. C'est exactement le raisonnement que le TRI avait déjà
   * obtenu, et il vaut à plus forte raison ici : le tri change l'ordre, le filtre change ce qu'on voit.
   */
  it('🔴🔴 changer de filtre empile une entrée d’historique', () => {
    const base: EtatEcranUrl = { ...ETAT_DEFAUT, ecran: 'boite' };
    expect(memeEtat(base, { ...base, filtre: 'non-lus' })).toBe(false);
    expect(memeEtat({ ...base, filtre: 'non-lus' }, base)).toBe(false);
    expect(memeEtat(base, { ...base, etoile: true })).toBe(false);
    /* ⚠️ ET DEUX ÉTATS IDENTIQUES RESTENT IDENTIQUES : sans cela, chaque rendu empilerait une entrée et
       « Précédent » demanderait autant de clics qu'on n'en a pas donnés. `undefined` vaut `false`. */
    expect(memeEtat(base, { ...base })).toBe(true);
    expect(memeEtat({ ...base, etoile: false }, { ...base, etoile: undefined })).toBe(true);
    expect(memeEtat({ ...base, filtre: 'non-lus' }, { ...base, filtre: 'non-lus' })).toBe(true);
  });

  /**
   * ⚠️ ET SEULEMENT DANS LA BOÎTE : hors de cet écran, `filtre` et `etoile` ne désignent rien. Les compter
   * partout aurait empilé des entrées d'historique sur des écrans qui n'ont pas de filtre.
   */
  it('⚠️ hors de la boîte, le filtre ne compte pas', () => {
    const partage: EtatEcranUrl = { ...ETAT_DEFAUT, ecran: 'partage' };
    expect(memeEtat(partage, { ...partage, filtre: 'non-lus' })).toBe(true);
  });
});

describe('🔴🔴 ② la colonne est la même, quel que soit le filtre', () => {
  /**
   * 🔴🔴 « ON NE SAIT PAS ENCORE » N'EST PAS « IL N'Y EN A PAS » — et c'est une VRAIE épreuve, sur la fonction
   * pure qui construit la colonne. Sans compteurs (`null`), toutes les entrées restent, sans leurs nombres :
   * c'est la règle écrite du module. La Corbeille en était la seule exception, et par accident — un `?.` qui
   * confondait « la route n'a pas répondu » avec « la route dit qu'il n'y a pas de corbeille ».
   */
  it('🔴🔴 sans compteurs, aucune entrée ne disparaît — Corbeille comprise', () => {
    const sansComptes = etiquettesDeLEcran(ecran(), null).map((e) => e.libelle);
    expect(sansComptes).toContain('Corbeille');
    expect(sansComptes).toContain('Réception');
    expect(sansComptes).toContain('Spam');
    /* ⚠️ ET SANS NOMBRE PLUTÔT QU'AVEC UN FAUX : `null` se lit « on ne sait pas encore ». */
    const corbeille = etiquettesDeLEcran(ecran(), null).find((e) => e.libelle === 'Corbeille');
    expect(corbeille?.compte).toBeNull();
  });

  /**
   * 🔴 LE RETRAIT VOULU N'EST PAS TOUCHÉ : réponse REÇUE et corbeille absente (migration 251/275) ⇒ l'entrée
   * part, pour la raison écrite le 29/09/2026 — une corbeille qu'on ne peut pas remplir n'a rien à faire dans
   * le sommaire. C'est la moitié de la règle qu'il ne fallait PAS casser en réparant l'autre.
   */
  it('🔴 réponse reçue sans corbeille : l’entrée part, comme avant', () => {
    const comptes = { lisibles: 10, automatiques: 1, envoyes: 2, corbeille: null };
    expect(etiquettesDeLEcran(ecran(), comptes).map((e) => e.libelle)).not.toContain('Corbeille');
    const absente = { lisibles: 10, automatiques: 1, envoyes: 2 };
    expect(etiquettesDeLEcran(ecran(), absente).map((e) => e.libelle)).not.toContain('Corbeille');
  });

  /** 🔴 ET AVEC UNE CORBEILLE, ELLE PORTE SON NOMBRE — y compris zéro, qui est une réponse. */
  it('🔴 avec une corbeille, l’entrée porte son nombre', () => {
    const c = etiquettesDeLEcran(ecran(), { lisibles: 10, automatiques: 1, envoyes: 2, corbeille: 0 })
      .find((e) => e.libelle === 'Corbeille');
    expect(c?.compte).toBe(0);
  });

  /**
   * 🔴🔴 UNE LECTURE ABANDONNÉE EST REPRISE. La garde d'unicité consomme la version AVANT la requête — pour ne
   * pas réessayer en boucle après un échec. La même règle s'appliquait à une lecture seulement ABANDONNÉE, et
   * la colonne restait alors sans nombres jusqu'au prochain rechargement complet. Un abandon n'est pas un
   * échec : personne n'a répondu « non », on a cessé d'écouter.
   */
  it('🔴🔴 une lecture des compteurs abandonnée rend sa version', () => {
    expect(VUE).toContain('if (comptesCharges.current === versionComptes && comptesBoite === null) comptesCharges.current = -1;');
    /* ⚠️ ET SEULEMENT DANS CE CAS : un échec continue de ne pas réessayer, exactement comme avant ce lot. */
    expect(VUE).toContain('} catch { /* étiquettes sans nombre : voir l\'encadré */ }');
  });
});

describe('🔴🔴 ③ un total filtré n’est pas le total du dossier', () => {
  /**
   * 🔴🔴 CE QUE LA VÉRIFICATION A TROUVÉ, ET QU'ARNO N'AVAIT PAS NOMMÉ : entrer dans « non lus » puis cliquer
   * « À classer » faisait passer l'entrée « À classer » de 10 377 à **27**. La liste remonte son total à la
   * colonne (`onTotalEtiquette`) ; or ce total est compté PAR LE SERVEUR AVEC les filtres.
   *
   * 🔴 ET LA GARDE NE POUVAIT PAS ÊTRE UN SIMPLE `filtre === null` : un clic change l'étiquette ET le filtre en
   * UN rendu, pendant lequel `etat` est encore celui de la liste précédente. Les drapeaux étaient déjà « sans
   * filtre » quand les nombres étaient encore ceux d'avant. On compare donc la QUESTION à laquelle l'état
   * répond — son empreinte — et non des drapeaux.
   */
  it('🔴🔴 l’état porte l’empreinte de la lecture qui l’a produit', () => {
    expect(BOITE).toContain('function empreinteLecture(');
    expect(BOITE).toContain('pour: empreinteLecture(e, f, et, critereActif(c)),');
    expect(BOITE).toContain('const questionCourante = empreinteLecture(etiquette, filtre, etoile, cherche);');
  });

  /** 🔴 ET LE TOTAL NE REMONTE QUE S'IL EST COMPARABLE : même question, et aucune restriction. */
  it('🔴🔴 un total restreint ne remonte pas à la colonne', () => {
    expect(BOITE).toContain('const totalAffiche = etat.v === \'ok\' && etat.pour === questionCourante\n'
      + '    && filtre === null && !etoile && !cherche ? etat.total : undefined;');
    /* ⚠️ SE TAIRE (`undefined`), ET NON ANNONCER `null` : `null` effacerait le compteur de la colonne. */
    expect(BOITE).toContain('if (onTotalEtiquette === undefined || totalAffiche === undefined) return;');
  });
});

describe('🔴🔴 ④ le filtre se voit et se quitte depuis la liste', () => {
  /** 🔴 LE REPÈRE, AU-DESSUS DE LA LISTE, avec un ✕ qui ramène à la liste complète. */
  it('🔴🔴 « Non lus uniquement ✕ » est rendu quand le filtre est actif', () => {
    expect(BOITE).toContain("{filtre === 'non-lus' && onFiltre && (");
    expect(BOITE).toContain('<span className="bte-repere-mot">Non lus uniquement</span>');
    expect(BOITE).toContain('onClick={() => onFiltre(null)}');
    /* 🔴 UN ✕ NU N'EXISTE PAS POUR UN LECTEUR D'ÉCRAN : il porte sa phrase, deux fois. */
    expect(BOITE).toContain('aria-label="Revenir à la liste complète" title="Revenir à la liste complète"');
  });

  /**
   * 🔴 ET LA CIBLE TACTILE DU ✕ FAIT 44 px (exigence transverse §15), tenue par un rectangle invisible — le même
   * moyen que les boutons de l'en-tête partagé, pour que le signe reste petit sans que la zone le soit.
   */
  it('⚠️ le ✕ garde 44 px de cible tactile', () => {
    expect(BOITE).toContain('.bte-repere-sortie::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;');
  });

  /**
   * 🔴🔴 LE COMPTEUR DIT SUR COMBIEN — vraie épreuve, sur le module pur qui écrit le mot. Arno : « 27 non lus
   * sur 10281 conversations », et non « 27 conversations », qui laisse croire que la boîte a fondu.
   */
  it('🔴🔴 le compteur d’en-tête porte son dénominateur', () => {
    expect(motNonLusSur(27, 10281)).toBe('27 non lus sur 10281 conversations');
    expect(motNonLusSur(1, 10281)).toBe('1 non lu sur 10281 conversations');
    expect(motNonLusSur(1, 1)).toBe('1 non lu sur 1 conversation');
    /* ⚠️ SANS TOTAL, ON S'ARRÊTE À CE QU'ON SAIT : un « sur 0 » serait pire que le nombre nu. */
    expect(motNonLusSur(27, null)).toBe('27 non lus');
  });

  /** ⚠️ LE DÉNOMINATEUR EST CELUI DU DOSSIER (`total`), jamais le nombre filtré de la liste. */
  it('⚠️ le titre lit le compte du dossier comme dénominateur', () => {
    expect(BOITE).toContain('? motNonLusSur(nombreDeLaListe, total ?? null)');
  });
});
