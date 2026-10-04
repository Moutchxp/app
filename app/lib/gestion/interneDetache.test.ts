import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  messageDetachement, motApresAnnulation, motApresDetachement,
  MOTIF_DETACHE_PAR_INTERNE, MOTIF_REMIS_APRES_ANNULATION, SECONDES_ANNULER, type BienDetache,
} from './interneDetache';
import { mailsCouvertsParLeChoix } from './interneDuMail';

/**
 * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — MARQUER « INTERNE » DÉTACHE LES BIENS ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) : « Règle symétrique de `leverInterneApresRattachement` : marquer Interne DÉTACHE les
 * biens de ce mail, selon la fenêtre choisie (Ce mail uniquement / Ce mail et la conversation à venir / Toute la
 * conversation), par la porte existante (statut 'retire'), tracé. — AVANT d'appliquer, un message clair : “Marquer
 * interne détachera : <liste des biens>” avec Confirmer / Annuler. Après : “Annuler” pendant quelques secondes, qui
 * remet exactement les rattachements d'avant. — Si aucun bien n'est rattaché : comportement actuel inchangé, sans
 * message. »
 *
 * ═══ ⚠️ CE QUE J'AI TROUVÉ EN CHERCHANT LA SYMÉTRIE, ET QU'IL FAUT DIRE ══════════════════════════════════════════
 *
 * `leverInterneApresRattachement` existe, est documentée comme l'arbitrage du conflit… et **n'a JAMAIS eu
 * d'appelant** (vérifié sur tout le dépôt et depuis son commit d'origine, 68f8a254). Ce point est donc le PREMIER
 * des deux sens à exister réellement, et non le second. L'autre sens reste à trancher par Arno : le câbler
 * RETIRERAIT une marque posée à la main lors d'un autre geste humain.
 *
 * ⚠️ CE FICHIER EST PUR : il éprouve les MOTS, la DÉCOUPE des fenêtres, et la FORME du code qui agit. Le
 * détachement réel est éprouvé à l'écran, sur un mail « _TEST » remis dans son état.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const bien = (lienId: number, libelle: string): BienDetache => ({ lienId, libelle });

describe('🔴🔴 ① le message de confirmation, mot pour mot', () => {
  /**
   * 🔴🔴 LA LISTE EST NOMMÉE, JAMAIS COMPTÉE. « détachera 3 biens » n'apprend rien : on ne peut pas décider sans
   * savoir LESQUELS. C'est tout l'objet de la confirmation — et c'est aussi ce qui autorise ce geste à toucher un
   * lien posé à la main, la même raison que « Toute la conversation ».
   */
  it('🔴🔴 « Marquer interne détachera : <liste des biens> »', () => {
    expect(messageDetachement([bien(1, '19 Rue Diderot, Issy-les-Moulineaux — lot 478')]))
      .toBe('Marquer interne détachera : 19 Rue Diderot, Issy-les-Moulineaux — lot 478');
  });

  /** 🔴 UN MAIL MULTI-BIENS LES NOMME TOUS, séparés par des virgules — cas d'Arno. */
  it('🔴 plusieurs biens, tous nommés', () => {
    expect(messageDetachement([bien(1, 'lot 478'), bien(2, 'lot 479'), bien(3, 'lot 480')]))
      .toBe('Marquer interne détachera : lot 478, lot 479, lot 480');
  });

  /**
   * 🔴🔴 AUCUN MESSAGE QUAND IL N'Y A RIEN À DÉTACHER — seconde phrase d'Arno, et c'est le cas le plus fréquent.
   * Une boîte de confirmation vide serait un geste de plus pour rien.
   */
  it('🔴🔴 aucun bien ⇒ `null`, donc aucun message', () => {
    expect(messageDetachement([])).toBeNull();
  });
});

describe('🔴 ② les comptes rendus, après le geste et après l’annulation', () => {
  it('🔴 le compte rendu dit le nombre, au singulier comme au pluriel', () => {
    expect(motApresDetachement(0)).toBe('Mail marqué « interne ».');
    expect(motApresDetachement(1)).toBe('Mail marqué « interne » · 1 bien détaché.');
    expect(motApresDetachement(3)).toBe('Mail marqué « interne » · 3 biens détachés.');
  });

  it('🔴 l’annulation aussi', () => {
    expect(motApresAnnulation(0)).toBe('Marque « interne » retirée.');
    expect(motApresAnnulation(2)).toBe('Marque « interne » retirée · 2 biens remis.');
  });

  /** ⚠️ « QUELQUES SECONDES », dit Arno. Douze : assez pour lire le compte rendu et se raviser, pas assez pour
      que l'« Annuler » devienne un meuble. */
  it('⚠️ l’« Annuler » ne reste offert que quelques secondes', () => {
    expect(SECONDES_ANNULER).toBeGreaterThanOrEqual(5);
    expect(SECONDES_ANNULER).toBeLessThanOrEqual(30);
  });
});

describe('🔴🔴 ③ les trois fenêtres d’Arno découpent le geste', () => {
  /**
   * 🔴🔴 LA DÉCOUPE N'EST PAS RÉÉCRITE POUR CE POINT : c'est `mailsCouvertsParLeChoix`, le module pur qui porte
   * déjà les trois fenêtres du marquage « interne ». En écrire une seconde aurait donné deux portées pour un
   * même mot à l'écran.
   *
   * ⚠️ L'ORDRE DE `mails` EST CHRONOLOGIQUE, du plus ancien au plus récent — jamais celui de l'affichage. « Ce
   * mail et la conversation à venir » veut dire « à venir DANS LE TEMPS », et l'écran peut très bien montrer le
   * plus récent en haut.
   */
  const MAILS = [10, 20, 30, 40, 50];

  it('🔴🔴 « Ce mail uniquement » ⇒ ce mail, et lui seul', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 30, 'mail')).toEqual([30]);
  });

  it('🔴🔴 « Ce mail et la conversation à venir » ⇒ de lui jusqu’au dernier', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 30, 'suite')).toEqual([30, 40, 50]);
  });

  it('🔴🔴 « Toute la conversation » ⇒ tous, passés compris', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 30, 'conversation')).toEqual(MAILS);
  });

  /**
   * ⚠️ UN MAIL ABSENT DE LA LISTE NE COUVRE RIEN : on ne devine pas une position. Mieux vaut un geste qui ne
   * porte sur rien — et qui le dit — qu'un geste qui porte sur toute la conversation par accident.
   */
  it('⚠️ un mail inconnu de la liste ne détache rien', () => {
    expect(mailsCouvertsParLeChoix(MAILS, 99, 'mail')).toEqual([]);
    expect(mailsCouvertsParLeChoix(MAILS, 99, 'suite')).toEqual([]);
  });

  /** 🔴 ET LA ROUTE EMPLOIE BIEN CETTE DÉCOUPE pour choisir les mails à détacher. */
  it('🔴 la route détache les mails que la fenêtre couvre, et pas d’autres', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/interne/route.ts', 'utf8');
    expect(r).toContain('const couverts = mailsDuGeste(corps);');
    expect(r).toContain('const detaches = await detacherBiensApresInterne(couverts, auteur);');
    /* 🔴 ET L'APERÇU DE LA CONFIRMATION PORTE SUR LA MÊME DÉCOUPE : une confirmation qui nommerait d'autres biens
       que ceux qui partiront serait pire que pas de confirmation. */
    expect(r).toContain("if (url.searchParams.get('detacherait') === '1')");
    expect(r).toContain('biens: await biensADetacher(couverts)');
  });
});

describe('🔴🔴 ④ par la porte existante, et traçé', () => {
  const REPO = readFileSync('app/lib/gestion/interneRepo.ts', 'utf8');

  /**
   * 🔴🔴 `changerStatut`, ET RIEN D'AUTRE. C'est la porte du lot RATTACHEMENT-1, celle de l'écran, avec son
   * journal, son auteur et son motif. Un `UPDATE` écrit ici aurait contourné le journal — et un retrait sans
   * trace n'est pas réversible.
   */
  it('🔴🔴 aucun UPDATE écrit à la main : tout passe par `changerStatut`', () => {
    const code = REPO.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const detache = code.slice(code.indexOf('export async function detacherBiensApresInterne'));
    const bloc = detache.slice(0, detache.indexOf('\n}'));
    expect(bloc).toContain('changerStatut({');
    expect(bloc).toContain("statut: 'retire'");
    expect(bloc).toContain('motif: MOTIF_DETACHE_PAR_INTERNE');
    expect(bloc).not.toContain('UPDATE ');
  });

  /**
   * 🔴🔴 LE MOTIF EST CE QUI REND L'« ANNULER » SÛR. On ne remet que ce que CE geste-là avait retiré : un lien
   * retiré par le suivi d'une conversation, ou à la main, n'a pas à ressusciter parce qu'on annule un marquage
   * « interne ». Sans ce garde, un « Annuler » cliqué un peu tard aurait remis n'importe quoi.
   */
  it('🔴🔴 « Annuler » ne remet que les liens portant CE motif', () => {
    expect(MOTIF_DETACHE_PAR_INTERNE).toBe('détaché en marquant le mail « interne »');
    expect(REPO).toContain("WHERE id = ANY($1::bigint[]) AND statut = 'retire' AND coalesce(statut_motif, '') = $2");
    expect(REPO).toContain('[ids, MOTIF_DETACHE_PAR_INTERNE]');
    expect(REPO).toContain('motif: MOTIF_REMIS_APRES_ANNULATION');
    expect(MOTIF_REMIS_APRES_ANNULATION).toContain('remis');
  });

  /**
   * 🔴 LE MOTIF EST DISTINCT DE CELUI DE LA PROJECTION D'UNE FENÊTRE, et il doit le rester : les deux ne se
   * défont pas de la même façon, et confondre leurs traces rendrait l'« Annuler » incapable de savoir ce qu'il a
   * le droit de remettre.
   */
  it('🔴 il ne se confond pas avec le retrait par le suivi d’une conversation', () => {
    const periode = readFileSync('app/lib/gestion/periodeRepo.ts', 'utf8');
    expect(periode).toContain("MOTIF_RETIRE_PAR_SUIVI = 'retiré par le suivi de la conversation'");
    expect(MOTIF_DETACHE_PAR_INTERNE).not.toBe('retiré par le suivi de la conversation');
  });

  /**
   * 🔴 LA RÈGLE DU LIEN DE BIEN VIENT DU FRAGMENT UNIQUE (`sqlLiensDuBien`, lot précédent) : on ne redit pas ici
   * ce qu'est un bien rattaché. Les propositions ne sont pas détachées — elles ne sont pas des rattachements.
   */
  it('🔴 la lecture des biens à détacher lit le fragment unique', () => {
    expect(REPO).toContain("AND ${sqlLiensDuBien('r')}");
  });

  /**
   * ══ 🔴🔴 « EXACTEMENT LES RATTACHEMENTS D'AVANT » — Y COMPRIS LES INTERVENTIONS ════════════════════════════
   *
   * ⚠️ DÉFAUT TROUVÉ PAR LA PHOTOGRAPHIE D'EMPREINTES, PAS PAR UN RAISONNEMENT. Après l'essai à l'écran sur le
   * mail « _TEST », la comparaison mail par mail montrait encore `interventions[longueur]` différent : retirer un
   * bien déclenche `retirerInterventionsSansBien` (migration 293 — une intervention ne survit pas au départ de
   * son bien), et mon « Annuler » remettait les biens SANS remettre les interventions. La promesse d'Arno était
   * donc fausse de deux lignes, et rien dans les tests ne l'aurait dit.
   *
   * 🔴 APRÈS LES BIENS, ET JAMAIS AVANT : la base refuse une intervention sans lien vivant vers un bien sur le
   * même mail. L'ordre n'est pas un style, c'est la contrainte de la migration 293.
   *
   * 🔴 ET SEULEMENT CELLES QUE LA CASCADE A RETIRÉES, reconnues à leur motif : une intervention retirée à la main
   * n'a pas à ressusciter ici.
   */
  it('🔴🔴 « Annuler » remet aussi les interventions que la cascade avait emportées', () => {
    expect(REPO).toContain('WHERE message_id = $1 AND regle = $2 AND statut = \'retire\'');
    expect(REPO).toContain('[m, REGLE_INTERVENTION, MOTIF_INTERVENTION_SANS_BIEN]');
    /* 🔴 L'ORDRE : la boucle des interventions vient APRÈS celle des biens. */
    const iBiens = REPO.indexOf("statut: 'confirme', auteur, motif: MOTIF_REMIS_APRES_ANNULATION");
    const iInter = REPO.indexOf('REGLE_INTERVENTION, MOTIF_INTERVENTION_SANS_BIEN');
    expect(iBiens).toBeGreaterThan(0);
    expect(iInter).toBeGreaterThan(iBiens);
  });

  /** ⚠️ UN ÉCHEC NE FAIT PAS ÉCHOUER LE MARQUAGE : la marque est posée, l'écran est juste de toute façon. */
  it('⚠️ le détachement avale ses erreurs et rend ce qu’il a pu faire', () => {
    expect(REPO).toContain("console.error('[gestion/interne] détachement après marquage impossible', e)");
    expect(REPO).toContain("console.error('[gestion/interne] remise après annulation impossible', e)");
  });
});

describe('🔴🔴 ⑤ l’écran : demander avant, offrir la sortie après', () => {
  const ENC = readFileSync('app/(admin)/admin/(protected)/gestion/EncartRattachement.tsx', 'utf8');

  /**
   * 🔴🔴 LE CLIC DEMANDE D'ABORD — sauf s'il n'y a rien à détacher, et alors rien ne change.
   *
   * ⚠️ LE MÊME TEST COUVRE L'APERÇU EN ÉCHEC (`null`) : refuser le geste parce qu'une lecture a échoué
   * conditionnerait une fonction existante à une requête nouvelle. La confirmation est une précaution, pas un
   * péage — et c'est pourquoi `null` et « liste vide » mènent à la même ligne.
   */
  it('🔴🔴 sans bien rattaché — ou sans aperçu — le geste est exactement celui d’avant', () => {
    expect(ENC).toContain(
      'if (biens === null || biens.length === 0) { await appliquerInterne(choixInterne, []); return; }',
    );
    expect(ENC).toContain('setDemandeInterne({ choix: choixInterne, biens });');
  });

  /**
   * 🔴🔴 LES TROIS FENÊTRES SONT OFFERTES DANS LA CONFIRMATION, et la liste des biens SUIT le choix. Elles
   * existaient dans la route et dans le module pur, mais aucun écran ne les proposait pour « interne » : la case
   * du bandeau a toujours porté sur l'échange entier.
   */
  it('🔴🔴 les trois fenêtres, avec les mots déjà employés ailleurs', () => {
    expect(ENC).toContain('{CHOIX_SUIVI.map((c) => (');
    expect(ENC).toContain('void changerFenetreInterne(c.cle);');
    /* 🔴 ET LA LISTE EST RE-DEMANDÉE AU SERVEUR : une liste figée promettrait autre chose que le bouton. */
    expect(ENC).toContain('const biens = await apercuDetachement(choix);');
  });

  it('🔴 Confirmer / Annuler, et la liste nommée', () => {
    expect(ENC).toContain('{messageDetachement(demandeInterne.biens)}');
    expect(ENC).toContain('>\n              Confirmer\n            </button>');
    expect(ENC).toContain('onClick={() => setDemandeInterne(null)}');
    /* 🔴 ET QUAND LA PORTÉE CHOISIE NE DÉTACHE RIEN, L'ÉCRAN LE DIT au lieu d'une liste vide muette. */
    expect(ENC).toContain('Aucun bien à détacher avec cette portée');
  });

  /** 🔴 PUIS L'« ANNULER », qui s'efface de lui-même : un bouton éternel ferait croire que rien n'est acquis. */
  it('🔴 l’« Annuler » s’efface au bout de `SECONDES_ANNULER`', () => {
    expect(ENC).toContain('const t = setTimeout(() => setDetachesInterne(null), SECONDES_ANNULER * 1000);');
    expect(ENC).toContain('void annulerInterne();');
  });

  /**
   * ⚠️ LES ÉTATS SONT DÉCLARÉS AVANT LE PREMIER `return`, et c'est écrit ici parce que je l'ai payé : posés
   * après `if (liens === null) return null`, ils ont fait tomber 16 épreuves d'un coup (« Rendered fewer hooks
   * than expected »). React exige un nombre de hooks constant d'un rendu à l'autre.
   */
  it('⚠️ les hooks du panneau précèdent le `return null`', () => {
    const iEtat = ENC.indexOf('const [demandeInterne, setDemandeInterne]');
    const iRetour = ENC.indexOf('if (liens === null) return null;');
    expect(iEtat).toBeGreaterThan(0);
    expect(iRetour).toBeGreaterThan(iEtat);
  });
});
