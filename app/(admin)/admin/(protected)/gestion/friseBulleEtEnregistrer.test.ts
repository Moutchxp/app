/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LOT FRISE-BULLE-ET-ENREGISTRER (08/10/2026) — LA BULLE QU'ON PEUT ATTEINDRE, LE BOUTON QUI S'EXPLIQUE ═══
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   1. « Au survol d'un point, la bulle (texte + liens “Modifier”, “Retirer”, pièces) se ferme dès que la souris
 *      quitte le point → on ne peut jamais cliquer dans la bulle. […] Un CLIC sur le point épingle la bulle :
 *      elle reste ouverte jusqu'à un clic ailleurs ou Échap. Même comportement pour la bulle du “i” des carrés.
 *      Aucun lien ni action de la bulle n'est retiré. »
 *   2. « BOUTON “ENREGISTRER” JAMAIS ACTIF dans “Modifier — <carte>” […] Le formulaire de modification doit être
 *      pré-rempli avec TOUTES les valeurs actuelles de la carte (forme, type, date, heure, montant, texte, pièce
 *      jointe), et le bouton s'active dès qu'une valeur change. Si une règle bloque l'enregistrement (champ
 *      requis, format), un message clair s'affiche à côté du bouton au lieu d'un bouton grisé muet. »
 *
 * ══ 🔴🔴 CE QUE LE DIAGNOSTIC A TROUVÉ, ET CE QU'IL N'A PAS TROUVÉ ══════════════════════════════════════════════
 *
 * LA CONDITION EXACTE qui éteignait le bouton : `disabled={occupe || jour === '' || titreManquant ||
 * montantFaux}`, au rendu du formulaire. Des trois raisons de refuser, DEUX écrivaient leur phrase et la
 * troisième — `jour === ''` — n'en avait aucune. Un bouton gris, et pas un mot : c'est ce qu'Arno a vu.
 *
 * ⚠️ LE DÉCLENCHEUR, LUI, N'A PAS ÉTÉ REPRODUIT à l'état du dépôt, y compris sur la carte même d'Arno (devis
 * reçu du 11/10/2026, 650 €) : le formulaire s'y ouvre prérempli et le bouton y est actif. Le journal du serveur
 * de développement porte, à la minute où cette carte a été créée, un `Uncaught Error … Expected a semicolon`
 * livré au navigateur — un littéral gabarit cassé pendant le lot précédent. La cause probable est donc un module
 * à moitié rechargé ; elle n'est pas prouvée, et ces épreuves ne font pas semblant de la tenir.
 *
 * 🔴 CE QU'ELLES TIENNENT, EN REVANCHE : que l'état ne PEUT plus se produire. Le préremplissage n'est plus un
 * effet qui doit se déclencher — il est l'état initial, dérivé d'une fonction pure, sur un formulaire monté à
 * neuf par carte. Et quand un refus survient, il porte sa phrase.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EtapeAAfficher } from '../../../../lib/gestion/frise';
import { refusDEnregistrement, valeursDeLaCarte } from '../../../../lib/gestion/frise';

const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useBulleSurvol.ts', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');
const REPO = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8');

let n = 0;
const etape = (p: Partial<EtapeAAfficher>): EtapeAAfficher => ({
  id: (n += 1), reference: null, type: 'devis_recu', survenuLe: '2026-10-11 00:00:00+02', heureConnue: false,
  heureFin: null, numero: null, rang: null, montantCents: 65000, texte: null, auteur: null,
  source: 'manuelle', certitude: 'fiable', messageId: null, aEuUnMail: false, filId: null,
  creeParLibelle: 'Arnaud', creeLe: '2026-10-08 21:26:38+02', titre: null, pieceNom: null,
  rangDevis: null, rangPose: 31, poseChoisie: false, ...p,
});

describe('🔴🔴 ① le formulaire naît rempli — la carte d’Arno, telle qu’elle est en base', () => {
  /**
   * 🔴🔴 LE CAS EXACT : devis reçu du 11/10/2026, 650 €, posé à la main (carte 480 de l'événement 1, relevée en
   * base le 08/10/2026). C'est celui qu'Arno a vu s'ouvrir avec une date vide.
   */
  it('🔴🔴 toutes les valeurs de la carte sont là, date comprise', () => {
    const v = valeursDeLaCarte(etape({}), '2026-10-08', 'autre');
    expect(v.jour).toBe('2026-10-11');
    expect(v.montant).toBe('650');
    expect(v.forme).toBe('etape');
    expect(v.type).toBe('devis_recu');
    /* 🔴 ET CETTE VALEUR-LÀ SUFFIT À RENDRE LE BOUTON ACTIF : plus de refus, donc plus de bouton gris. */
    expect(refusDEnregistrement({ jour: v.jour, type: v.type, titre: v.titre, montantLisible: true })).toBeNull();
  });

  /** ⚠️ L'HEURE N'EST LUE QUE SI LA CARTE EN PORTE UNE : « 00:00 » affiché pour une heure inconnue serait faux. */
  it('⚠️ l’heure ne s’invente pas, et se lit quand elle existe', () => {
    expect(valeursDeLaCarte(etape({ heureConnue: false }), '2026-10-08', 'autre').heure).toBe('');
    expect(valeursDeLaCarte(
      etape({ heureConnue: true, survenuLe: '2026-10-11 14:30:00+02' }), '2026-10-08', 'autre').heure)
      .toBe('14:30');
  });

  /**
   * 🔴🔴 ET LA DATE NE PEUT PLUS ÊTRE VIDE. C'est la garde de fond : quelle que soit la forme de `survenuLe` —
   * y compris une chaîne que personne n'attend —, le formulaire s'ouvre sur un jour utilisable. Le cas n'existe
   * pas en base (`survenu_le` est NOT NULL, 0 ligne sur 177 hors forme AAAA-MM-JJ), mais le type du dépôt
   * l'autorise, et c'est précisément par là que le bouton devenait gris.
   */
  it('🔴🔴 une date illisible retombe sur le jour proposé, jamais sur le vide', () => {
    for (const bizarre of ['', '11/10/2026', '2026-10', 'bientôt']) {
      const v = valeursDeLaCarte(etape({ survenuLe: bizarre }), '2026-10-08', 'autre');
      expect(v.jour, bizarre).toBe('2026-10-08');
      /* ⚠️ ET L'HEURE NE SE LIT PAS NON PLUS sur une chaîne illisible : « 26:10 » viderait le champ `time`. */
      expect(valeursDeLaCarte(etape({ survenuLe: bizarre, heureConnue: true }), '2026-10-08', 'autre').heure)
        .toBe('');
    }
  });

  /** 🔴 « pré-rempli avec TOUTES les valeurs » — le texte, le titre et la pièce jointe en font partie. */
  it('🔴🔴 le texte, le titre et la pièce jointe sont préremplis eux aussi', () => {
    const v = valeursDeLaCarte(
      etape({ type: 'autre', titre: 'Volet bloqué', texte: 'le voisin a prévenu', pieceNom: 'devis.pdf' }),
      '2026-10-08', 'autre');
    expect(v.titre).toBe('Volet bloqué');
    expect(v.texte).toBe('le voisin a prévenu');
    expect(v.piece).toBe('devis.pdf');
  });

  /** ⚠️ UNE CARTE NEUVE PART DU JOUR PROPOSÉ et de rien d'autre : le formulaire d'ajout n'hérite de personne. */
  it('⚠️ sans carte, le formulaire est vierge et daté du jour proposé', () => {
    const v = valeursDeLaCarte(null, '2026-10-08', 'facture');
    expect(v).toEqual({
      forme: 'information', type: 'facture', jour: '2026-10-08',
      heure: '', texte: '', titre: '', montant: '', piece: '',
    });
  });

  /** ⚠️ LE MONTANT REVIENT EN EUROS À VIRGULE, sans flottant : 1 234,50 € et non 1234.4999999. */
  it('⚠️ le montant en centimes redevient des euros à virgule', () => {
    expect(valeursDeLaCarte(etape({ montantCents: 123450 }), '2026-10-08', 'autre').montant).toBe('1234,5');
    expect(valeursDeLaCarte(etape({ montantCents: null }), '2026-10-08', 'autre').montant).toBe('');
  });
});

describe('🔴🔴 ② le refus a une phrase — il n’y a plus de bouton gris muet', () => {
  /**
   * 🔴🔴 LA RÉGRESSION QU'ON FERME : la date manquante était la SEULE des trois conditions sans message. Elle
   * en a un, et il vient du même endroit que le refus — on ne peut plus ajouter l'un sans l'autre.
   */
  it('🔴🔴 une date vide se dit, au lieu d’éteindre le bouton en silence', () => {
    expect(refusDEnregistrement({ jour: '', type: 'devis_recu', titre: '', montantLisible: true }))
      .toBe('La date manque : une carte se range à une date.');
  });

  /** ⚠️ ET UNE DATE QUI NE SE LIT PAS LE DIT AUTREMENT : ce n'est pas la même erreur, ni le même geste. */
  it('⚠️ une date illisible porte sa propre phrase', () => {
    expect(refusDEnregistrement({ jour: '11/10/2026', type: 'devis_recu', titre: '', montantLisible: true }))
      .toBe('La date ne se lit pas : attendu JJ/MM/AAAA.');
  });

  /** 🔴 LES DEUX RÈGLES QUI AVAIENT DÉJÀ LEUR PHRASE L'ONT GARDÉE, MOT POUR MOT. */
  it('🔴 le titre manquant et le montant illisible disent ce qu’ils disaient', () => {
    expect(refusDEnregistrement({ jour: '2026-10-08', type: 'autre', titre: '  ', montantLisible: true }))
      .toBe('Une carte libre demande un titre.');
    expect(refusDEnregistrement({ jour: '2026-10-08', type: 'devis_recu', titre: '', montantLisible: false }))
      .toBe('Le montant ne se lit pas : un nombre, en euros.');
  });

  /** 🔴 ET QUAND TOUT VA BIEN, IL N'Y A PAS DE PHRASE — donc pas de bouton éteint. */
  it('🔴 rien à dire, rien qui bloque', () => {
    expect(refusDEnregistrement({ jour: '2026-10-08', type: 'devis_recu', titre: '', montantLisible: true }))
      .toBeNull();
  });

  /**
   * 🔴🔴 UNE SEULE SOURCE POUR LE REFUS ET POUR LA PHRASE, dans l'écran : le bouton se désactive sur le MÊME
   * `refus` que la ligne qui l'explique. C'est la garde structurelle — un quatrième cas de refus apportera sa
   * phrase, parce qu'il n'y a pas d'autre endroit où l'écrire.
   */
  it('🔴🔴 l’écran n’a qu’une façon de refuser, et elle parle', () => {
    expect(FRISE).toContain('const refus = refusDEnregistrement({');
    expect(FRISE).toContain('disabled={occupe || refus !== null}');
    expect(FRISE).toContain('{refus !== null && <p className="fav-perdu" role="status">{refus}</p>}');
    /* ⚠️ ET L'ENVOI LIT LA MÊME RÈGLE : un bouton actif dont l'envoi refuserait serait pire que l'inverse. */
    expect(FRISE).toContain('if (occupe || refus !== null) return;');
  });
});

describe('🔴🔴 ③ le préremplissage est structurel, plus seulement un effet', () => {
  /**
   * 🔴🔴 UNE CLÉ PAR CARTE. C'est ce qui empêche l'état d'Arno de revenir : changer de carte démonte le
   * formulaire et en monte un neuf, dont les valeurs de départ SONT celles de la carte. Un effet peut ne pas
   * jouer ; une valeur initiale, non.
   */
  it('🔴🔴 le formulaire est monté à neuf pour chaque carte', () => {
    expect(FRISE).toContain("key={modifie === null ? 'ajout' : `modif-${modifie.id}`}");
  });

  /** 🔴 ET LES VALEURS DE DÉPART VIENNENT DE LA FONCTION PURE, pas d'une suite de `setX` écrite à la main. */
  it('🔴🔴 les valeurs initiales sont dérivées, pas appliquées', () => {
    expect(FRISE).toContain("const depart = valeursDeLaCarte(modifie, jourDefaut, typeImpose ?? 'autre');");
    expect(FRISE).toContain('useState(depart.jour)');
    expect(FRISE).toContain('useState(depart.montant)');
    expect(FRISE).toContain('useState(depart.piece)');
  });

  /**
   * ⚠️ L'EFFET RESTE, ET IL PASSE PAR LA MÊME FONCTION. Il sert au cas où la même carte revient relue après un
   * enregistrement. Deux préremplissages écrits séparément auraient fini par diverger sur un champ.
   */
  it('⚠️ l’effet de relecture appelle la même fonction pure', () => {
    expect(FRISE).toContain('const v = valeursDeLaCarte(modifie, jourDefaut, modifie.type);');
    expect(FRISE).toContain('setTexte(v.texte); setTitre(v.titre); setMontant(v.montant); setPiece(v.piece);');
  });

  /**
   * 🔴🔴 LA PIÈCE JOINTE S'ENREGISTRE VRAIMENT. Elle n'était offerte qu'à l'AJOUT, avec cette raison écrite :
   * « un champ qui ne s'enregistre pas est pire qu'un champ absent ». Arno la veut préremplie ; la prémisse a
   * donc dû changer d'abord — le dépôt l'écrit, la route la transmet, et l'écran peut alors la montrer.
   */
  it('🔴🔴 la pièce jointe se modifie : dépôt, route et écran se suivent', () => {
    expect(REPO).toContain('piece_nom = $8');
    expect(ROUTE).toContain("typeof corps.pieceNom === 'string' && corps.pieceNom.trim() !== ''");
    expect(FRISE).toContain("...corps, geste: 'modifier', pieceNom: piece.trim() === '' ? null : piece.trim(),");
    /* ⚠️ ET LE CHAMP N'EST PLUS CONDITIONNÉ À L'AJOUT : c'est la seule chose que ce lot RÉVÈLE à l'écran. */
    expect(FRISE).not.toContain('{modifie === null && <div className="fav-ajout-ligne">');
  });
});

describe('🔴🔴 ④ la bulle de survol se laisse atteindre', () => {
  /**
   * 🔴🔴 ELLE N'EST PLUS INERTE. Elle portait `aria-hidden`, un `occupe` forcé et TROIS gestes remplacés par
   * `() => undefined` : même en restant ouverte, elle n'aurait rien fait. Elle porte maintenant exactement les
   * mêmes fonctions que la bulle épinglée — « aucun lien ni action de la bulle n'est retiré » (Arno).
   */
  it('🔴🔴 la bulle flottante porte les vrais gestes, et plus des fonctions vides', () => {
    const bloc = FRISE.slice(FRISE.indexOf('{detailApercu !== null && ('), FRISE.indexOf('{detailFixe !== null && ('));
    expect(bloc).not.toContain('() => undefined');
    expect(bloc).not.toContain('aria-hidden');
    /* ⚠️ LE GESTE A UN NOM DEPUIS LE LOT FRISE-PICTOS-PLUS-GRANDS… : `crayonDeLaCarte`, parce qu'il est devenu
       une BASCULE (ouvrir, changer de carte, ou refermer en demandant). C'est le MÊME geste, écrit une fois au
       lieu de trois — et la bulle flottante le partage avec les deux autres crayons, ce qui est le point ici. */
    expect(bloc).toContain('onModifier={crayonDeLaCarte}');
    expect(bloc).toContain("onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}");
    expect(bloc).toContain('onOuvrirFil={onOuvrirFil}');
  });

  /** 🔴 ET ELLE REÇOIT LE POINTEUR : `pointer-events:none` la rendait inatteignable même ouverte. */
  it('🔴🔴 les deux bulles reçoivent le pointeur', () => {
    expect(FRISE).toContain('.fav-flottante{position:absolute;left:0;top:100%;z-index:7;max-width:40rem}');
    const commentaire = FRISE.slice(FRISE.indexOf('.fav-commentaire{'), FRISE.indexOf('.fav-commentaire-vide'));
    expect(commentaire).not.toContain('pointer-events:none');
  });

  /** 🔴 LE SURVOL DE LA BULLE ANNULE SA FERMETURE — c'est le geste qui rend le trajet possible. */
  it('🔴🔴 survoler la bulle annule la fermeture, pour les deux bulles', () => {
    expect(FRISE).toContain('onMouseEnter={bulle.entrerBulle} onMouseLeave={bulle.quitterBulle}');
    expect(FRISE).toContain('onMouseEnter={bulleTexte.entrerBulle} onMouseLeave={bulleTexte.quitterBulle}');
  });

  /**
   * ⚠️ ET ÉCHAP LES CHASSE. Depuis qu'elles survivent à la sortie de la souris, il faut un moyen de s'en
   * débarrasser sans repasser dessus : `quelqueChoseEstOuvert` les compte, donc l'écouteur d'Échap et du clic
   * à côté existe tant qu'une bulle est là.
   */
  it('⚠️ Échap et le clic à côté ferment aussi les bulles de survol', () => {
    expect(FRISE).toContain('|| bulle.cible !== null || bulleTexte.cible !== null;');
    expect(FRISE).toContain('bulle.fermer(); bulleTexte.fermer(); setCommentaire(null);');
  });

  /**
   * ══ 🔴🔴 LE CLIC ÉPINGLE — ET IL NE LE POUVAIT PAS, DÉFAUT TROUVÉ À L'ÉCRAN LE 08/10/2026 ═════════════════
   *
   * ARNO : « Un CLIC sur le point épingle la bulle : elle reste ouverte jusqu'à un clic ailleurs ou Échap. »
   *
   * 🔴 LE POINT BASCULAIT SUR `ouvert`, QUI VAUT `fixe ?? apercu`. Or cliquer un point, c'est forcément le
   * survoler : `apercu` portait donc déjà sa clé, la bascule lisait « déjà ouvert » et envoyait `null`. Le clic
   * DÉFAISAIT une épingle jamais posée — mesuré à la souris, puis corrigé en distinguant les deux états :
   * `ouvert` dit ce qui est MONTRÉ (survol compris), `epingle` dit ce qu'un clic a RETENU.
   *
   * ⚠️ ET LA BASCULE RESTE UNE BASCULE : un second clic sur un point déjà épinglé le défait, comme avant.
   */
  it('🔴🔴 un clic sur un point survolé l’épingle, au lieu de le défaire', () => {
    expect(FRISE).toContain('ouvert={ouvert} epingle={fixe} onOuvrir={setOuvert}');
    expect(FRISE).toContain('onOuvrir={() => p.onOuvrir(p.epingle === `p${m.id}` ? null : `p${m.id}`)} />');
    /* 🔴 ET C'EST BIEN `fixe` QUE LE CLIC POSE, donc la bulle survit au départ de la souris. */
    expect(FRISE).toContain('const setOuvert = useCallback((cle: string | null): void => {');
    expect(FRISE).toContain('setFixe(cle);');
    /* ⚠️ LE SURLIGNAGE DU POINT, LUI, SUIT CE QUI EST MONTRÉ — survol compris : c'est `ouvert`. */
    expect(FRISE).toContain('<Point key={m.id} m={m} actif={p.ouvert === `p${m.id}`}');
  });

  /** 🔴 LE MINUTEUR EST DANS LE CROCHET, LA RÈGLE DANS LE MODULE PUR — et le crochet ne décide de rien. */
  it('🔴 le crochet ne porte que le minuteur', () => {
    expect(CROCHET).toContain('window.setTimeout');
    expect(CROCHET).toContain('DELAI_FERMETURE_BULLE_MS');
    expect(CROCHET).toContain('if (!minuteurArme(etat)) return undefined;');
    /* ⚠️ AUCUNE DURÉE EN DUR ICI : le chiffre d'Arno est nommé une seule fois, dans le module pur. */
    expect(CROCHET).not.toMatch(/setTimeout\([^)]*,\s*\d+\s*\)/);
  });
});
