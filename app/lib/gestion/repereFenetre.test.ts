import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AIDE_PASTILLE_REPERE, AUCUN_BIEN, AUCUNE_PERSONNE, CHOIX_CONVERSATION, CHOIX_SUITE,
  comparatifRepere, coteDuRepere, etatDuClassement, lignesComparatif, motChoixFenetre,
  motMailsCouverts, nbMailsCouverts, personnesAvecRole, phraseRepere, RIEN_AVANT,
  STATUT_A_CLASSER, titreModaleChangement,
} from './repereFenetre';
import { reperesDuFil, type Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 2 — LE REPÈRE « À PARTIR D'ICI » ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 3490 : « le repère “À partir d'ici : aucun bien · jeudi 1 octobre 2026 à 20:12
 * · a.jorel@…” n'est pas placé au bon endroit. »
 *
 * ═══ 🔴🔴 LE DIAGNOSTIC, MESURÉ EN BASE PUIS À L'ÉCRAN ═══════════════════════════════════════════════════════════
 *
 * ① EN BASE. Six mails — 5495 (23/09 15:25), 5499 (23/09 15:55), 57122 (28/09), 57368 (01/10 12:46), 57472
 *    (03/10 14:31), 57473 (03/10 15:00) — et deux fenêtres vivantes : la 23836 depuis le mail 5495 (lot 484), la
 *    23812 depuis le mail 57368 (« aucun bien », 01/10 20:12, a.jorel@). La première ne produit AUCUN repère —
 *    elle commence au premier mail. La seconde est celle qu'Arno voit, et elle commence bien au mail **57368**.
 *
 * ② À L'ÉCRAN, liste en « Plus récent d'abord » :
 *      03/10 15:00 · 03/10 14:31 · **[REPÈRE]** · 01/10 12:46 · 28/09 · 23/09 15:55 · 23/09 15:25
 *    Le repère était rendu JUSTE AU-DESSUS de son mail — exact dans l'ordre ancien → récent, FAUX dans celui-ci :
 *    au-dessus veut dire « plus tard », et la ligne paraissait appartenir au mail du 03/10 14:31.
 *
 * 🔴 LA CAUSE TIENT EN UNE LIGNE : le repère était rendu AVANT son mail dans le DOM, quel que soit le tri. Le mail
 * visé, lui, a toujours été le bon — ni la date du geste ni le calcul n'étaient en cause.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les six mails du fil 3490, dans l'ordre chronologique. */
const MAILS = [5495, 5499, 57122, 57368, 57472, 57473];

const PERIODE = (id: number, depuis: number, c: Periode['classement'], o: Partial<Periode> = {}): Periode =>
  ({ id, depuisMessageId: depuis, classement: c, ...o });

/** Les deux fenêtres vivantes du fil 3490, telles qu'elles sont en base. */
const PERIODES: Periode[] = [
  PERIODE(23836, 5495, { sorte: 'biens', biens: [{ cle: '484', libelle: '2 Square Henri Régnault, Courbevoie — lot 484' }] }),
  PERIODE(23812, 57368, { sorte: 'biens', biens: [] },
    { parLibelle: 'a.jorel@sansvisavis.com', le: '2026-10-01T20:12:36+02:00' }),
];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LE CÔTÉ — C'EST TOUT LE CORRECTIF
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① le repère se pose du côté qui précède CHRONOLOGIQUEMENT', () => {
  it('🔴🔴 au-dessus en ordre ancien → récent, en dessous en ordre récent → ancien', () => {
    expect(coteDuRepere('ancien')).toBe('dessus');
    expect(coteDuRepere('recent')).toBe('dessous');
  });

  /**
   * 🔴 LE MAIL VISÉ N'A JAMAIS CHANGÉ, et ce test le fige : c'est bien le 57368, dans les deux tris. Le défaut
   * n'était pas dans le choix du mail — seulement dans le côté où la ligne était rendue.
   */
  it('🔴 le repère du fil 3490 vise le mail 57368, et lui seul', () => {
    const r = reperesDuFil(MAILS, PERIODES);
    expect(r).toHaveLength(1);
    expect(r[0].avantMessageId).toBe(57368);
    expect(r[0].id).toBe(23812);
  });

  /** ⚠️ ET LA FENÊTRE DU PREMIER MAIL NE PRODUIT TOUJOURS RIEN : « À partir d'ici » en tête ne sépare rien. */
  it('⚠️ la fenêtre qui commence au premier mail ne pose aucun repère', () => {
    expect(reperesDuFil(MAILS, PERIODES).some((r) => r.id === 23836)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 CE QUE LA PASTILLE EXPLIQUE : L'AVANT / APRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le comparatif avant / après', () => {
  it('🔴🔴 le cas d’Arno, à la virgule près', () => {
    const c = comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 23812 });
    expect(c).not.toBeNull();
    expect(c?.avant).toEqual({
      statut: 'Classé',
      biens: '2 Square Henri Régnault, Courbevoie — lot 484',
      personnes: AUCUNE_PERSONNE,
    });
    /* 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES — « À CLASSER », et non plus « Classé » : une fenêtre
       « biens » SANS aucun bien ne classe rien, et Arno nomme ce statut dans sa liste des quatre. C'est
       exactement la fenêtre du 01/10 20:12 du fil 3490. */
    expect(c?.apres).toEqual({ statut: STATUT_A_CLASSER, biens: AUCUN_BIEN, personnes: AUCUNE_PERSONNE });
    expect(c?.choix).toBe(CHOIX_SUITE);
    expect(c?.qui).toBe('a.jorel@sansvisavis.com');
    expect(c?.quand).toBe('2026-10-01T20:12:36+02:00');
  });

  /**
   * 🔴 L'« AVANT » EST LA FENÊTRE QUI COUVRAIT LE MAIL PRÉCÉDENT, et non la dernière créée dans le temps : la
   * question posée est « qu'est-ce qui change À CET ENDROIT du fil ? ».
   */
  it('🔴 l’avant est la fenêtre qui couvrait le mail d’avant, pas la plus récente', () => {
    const periodes = [
      ...PERIODES,
      /* Posée APRÈS dans le temps, mais plus LOIN dans le fil : elle ne précède pas le mail 57368. */
      PERIODE(99999, 57472, { sorte: 'interne', biens: [] }),
    ];
    const c = comparatifRepere({ mails: MAILS, periodes, periodeId: 23812 });
    expect(c?.avant?.biens).toBe('2 Square Henri Régnault, Courbevoie — lot 484');
  });

  it('⚠️ rien avant : la première fenêtre du fil le dit', () => {
    const c = comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 23836 });
    expect(c?.avant).toBeNull();
    expect(c?.choix).toBe(CHOIX_CONVERSATION);
  });

  it('⚠️ une fenêtre inconnue ne rend rien, sans lever', () => {
    expect(comparatifRepere({ mails: MAILS, periodes: PERIODES, periodeId: 123 })).toBeNull();
  });

  /** 🔴🔴 LES QUATRE STATUTS D'ARNO, mot pour mot : « Classé / Interne / Hors gestion / À classer ». */
  it('🔴🔴 les QUATRE statuts s’écrivent en toutes lettres', () => {
    expect(etatDuClassement({ sorte: 'interne', biens: [] }).statut).toBe('Interne');
    expect(etatDuClassement({ sorte: 'hors_gestion', biens: [] }).statut).toBe('Hors gestion');
    /* 🔴 LA DISTINCTION QUI MANQUAIT : avec un bien c'est classé, sans aucun bien il reste à classer. */
    expect(etatDuClassement({ sorte: 'biens', biens: [{ cle: '1', libelle: 'A' }] }).statut).toBe('Classé');
    expect(etatDuClassement({ sorte: 'biens', biens: [] }).statut).toBe('À classer');
  });

  /** 🔴🔴 « PERSONNES CONCERNÉES (AVEC RÔLE) » (Arno) : un nom seul ne dit pas si c'est le bailleur ou l'occupant. */
  it('🔴🔴 les personnes du comparatif portent leur rôle', () => {
    const e = etatDuClassement({
      sorte: 'biens', biens: [{ cle: '1', libelle: 'A' }],
      personnes: [
        { sorte: 'proprietaire', cle: 'p1', libelle: 'FORERO Marie-Yvonne' },
        { sorte: 'locataire', cle: 'l1', libelle: 'DUPONT Jean' },
      ],
    });
    expect(e.personnes).toBe('FORERO Marie-Yvonne (propriétaire), DUPONT Jean (locataire)');
    expect(personnesAvecRole({ sorte: 'biens', biens: [] })).toBe(AUCUNE_PERSONNE);
  });

  it('🔴 le type de choix se déduit du rang du mail', () => {
    expect(motChoixFenetre(0)).toBe(CHOIX_CONVERSATION);
    expect(motChoixFenetre(3)).toBe(CHOIX_SUITE);
  });

  /** ⚠️ LA PHRASE EST CELLE D'AVANT CE LOT, mot pour mot : seul son DESSIN change. */
  it('⚠️ la phrase du repère est inchangée', () => {
    expect(phraseRepere({ sorte: 'biens', biens: [] })).toBe('À partir d’ici : aucun bien');
    expect(phraseRepere({ sorte: 'interne', biens: [] })).toBe('À partir d’ici : Interne');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE DESSIN, ET CE QU'IL NE TOUCHE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ ce que l’écran dessine', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

  /** 🔴🔴 LES DEUX CÔTÉS SONT RENDUS, chacun du bon côté du message. C'est le correctif, dans le JSX. */
  it('🔴🔴 le repère est rendu avant OU après le message, selon le tri', () => {
    expect(src).toContain("coteDuRepere(ordre) === 'dessus' && reperes");
    expect(src).toContain("coteDuRepere(ordre) === 'dessous' && reperes");
  });

  /** 🔴 LA PHRASE EST ROUGE ET CENTRÉE, entre les deux bras du cadre (demande d'Arno). */
  it('🔴 phrase rouge, centrée entre les deux bras', () => {
    expect(src).toContain('grid-template-columns:1fr auto 1fr');
    expect(src).toContain('.cnv-repere-mot{font-size:.76rem;font-weight:700;letter-spacing:.01em;color:var(--color-svv-red)');
    expect(src).toContain('cnv-repere-bras cnv-repere-bras--gauche');
    expect(src).toContain('cnv-repere-bras cnv-repere-bras--droite');
  });

  /**
   * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LE LISERÉ EST CONTINU, ET SES ANGLES SONT ARRONDIS ═══════════════
   *
   * CONSTAT D'ARNO (03/10/2026) : « liseré CONTINU, sans coupure aux angles, avec des angles ARRONDIS ».
   *
   * 🔴 LA SEULE FAÇON D'Y ARRIVER SANS COUPURE : UNE SEULE BOÎTE PAR CÔTÉ, qui porte les DEUX bordures et le
   * rayon qui les joint. La version d'avant dessinait quatre traits indépendants — deux horizontaux en
   * pseudo-éléments, deux verticaux en `span` — et il restait au coin un décroché d'un pixel, visible à l'œil.
   * Deux traits qui se rejoignent ne font pas un trait.
   */
  it('🔴🔴 un seul trait par côté : deux bordures et un rayon sur la même boîte', () => {
    expect(src).toContain('.cnv-repere-bras::before{content:"";position:absolute;left:0;right:0;');
    expect(src).toContain('border:0 solid var(--color-svv-red)');
    expect(src).toContain('.cnv-repere--dessus .cnv-repere-bras--gauche::before{border-left-width:1px;border-top-left-radius:10px}');
    expect(src).toContain('.cnv-repere--dessous .cnv-repere-bras--droite::before{border-right-width:1px;border-bottom-right-radius:10px}');
    /* 🔴 ET PLUS AUCUN TRAIT SÉPARÉ : les anciens montants et les filets horizontaux ont disparu. */
    expect(src).not.toContain('cnv-repere-montant');
    expect(src).not.toContain('.cnv-repere::before,.cnv-repere::after');
  });

  /** 🔴 LE BRAS FAIT LA MOITIÉ DE LA HAUTEUR MESURÉE DU MAIL, jamais une valeur figée. */
  it('🔴🔴 le bras fait la moitié de la hauteur MESURÉE du mail', () => {
    expect(src).toContain('height:calc(var(--cnv-repere-h) / 2)');
    expect(src).toContain('new ResizeObserver(mesurer)');
    /* ⚠️ ET IL NE PÈSE RIEN DANS LA MISE EN PAGE : hauteur zéro, le tracé déborde par le ::before. */
    expect(src).toContain('.cnv-repere-bras{position:relative;height:0;min-width:0}');
  });

  /** 🔴 LE SENS SUIT LE CÔTÉ : au-dessus le trait descend, en dessous il monte. */
  it('🔴🔴 le trait descend au-dessus du mail, et monte en dessous', () => {
    expect(src).toContain('.cnv-repere--dessus .cnv-repere-bras::before{top:0;border-top-width:1px}');
    expect(src).toContain('.cnv-repere--dessous .cnv-repere-bras::before{bottom:0;border-bottom-width:1px}');
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 3 — LA PETITE FLÈCHE AU BOUT DE CHAQUE BRANCHE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════

     Arno : « une petite flèche rouge à l'extrémité de chaque branche (gauche et droite), qui pointe vers le côté
     de la conversation concerné par le changement », et « elles s'inversent avec Plus récent d'abord / Plus
     ancien d'abord ». */

  /**
   * 🔴🔴 CE QUI EST FIGÉ ICI N'EST PAS UN DESSIN, C'EST UNE ABSENCE DE SECONDE RÈGLE. Les flèches pendent des
   * variantes `--dessus` / `--dessous` — celles que `coteDuRepere(ordre)` pose déjà —, donc l'inversion avec le
   * tri est acquise par construction. Si quelqu'un relisait un jour l'ordre d'affichage pour orienter la flèche,
   * il y aurait deux vérités à tenir, et le point 4 de ce même lot a montré ce qu'il arrive quand elles divergent.
   */
  it('🔴🔴 la flèche s’inverse par la variante du côté, et non par une seconde lecture du tri', () => {
    expect(src).toContain('.cnv-repere--mesure.cnv-repere--dessus .cnv-repere-bras::after{');
    expect(src).toContain('.cnv-repere--mesure.cnv-repere--dessous .cnv-repere-bras::after{');
    /* ⚠️ AUCUNE RÈGLE DE FLÈCHE NE NOMME L'ORDRE : pas de classe de tri sur le repère. */
    expect(src).not.toContain('.cnv-repere--recent');
    expect(src).not.toContain('.cnv-repere--ancien');
  });

  /**
   * 🔴 ELLE POINTE DANS LE SENS OÙ LA BRANCHE VA, donc vers le mail concerné : vers le bas quand le repère est
   * au-dessus (`border-top-color` → triangle vers le bas), vers le haut quand il est en dessous.
   */
  it('🔴🔴 au-dessus la flèche pointe vers le bas, en dessous vers le haut', () => {
    expect(src).toContain('border-top-color:var(--color-svv-red)}');
    expect(src).toContain('border-bottom-color:var(--color-svv-red)}');
    /* 🔴 LES DEUX BRANCHES EN PORTENT UNE, chacune centrée sur son propre trait. */
    expect(src).toContain('.cnv-repere-bras--gauche::after{left:-4.5px}');
    expect(src).toContain('.cnv-repere-bras--droite::after{right:-4.5px}');
  });

  /**
   * ⚠️ LA POINTE TOMBE AU BOUT DU TRAIT, PAS 5 PX APRÈS. Le sommet d'un triangle de bordure est au CENTRE de sa
   * boîte : d'où le retrait d'une demi-flèche sur la mi-hauteur du mail. C'est la seule arithmétique du dessin, et
   * c'est précisément celle qu'une retouche à la main casserait sans que rien ne la rattrape.
   */
  it('⚠️ la pointe est posée sur la fin du trait, demi-flèche retirée', () => {
    expect(src).toContain('top:calc(var(--cnv-repere-h) / 2 - 5px)');
    expect(src).toContain('bottom:calc(var(--cnv-repere-h) / 2 - 5px)');
    expect(src).toContain('.cnv-repere-bras::after{content:"";position:absolute;width:0;height:0;'
      + 'border:5px solid transparent}');
  });

  /**
   * 🔴🔴 PAS DE FLÈCHE SANS SA BRANCHE. Tant que le `ResizeObserver` n'a pas mesuré le mail voisin — et pour
   * toujours s'il n'y a pas de voisin — `--cnv-repere-h` vaut 0 : la branche ne se voit pas. Une flèche posée là
   * flotterait seule à côté de la phrase, sans rien désigner. `cnv-repere--mesure` est ce garde-fou, et les deux
   * règles orientées en dépendent.
   */
  it('🔴🔴 la flèche n’apparaît qu’avec sa branche (hauteur mesurée)', () => {
    expect(src).toContain("cnv-repere--${cote}${hauteur > 0 ? ' cnv-repere--mesure' : ''}");
    /* ⚠️ ET AUCUNE RÈGLE ORIENTÉE NE S'ÉCHAPPE DU GARDE-FOU : on les énumère, et chacune le porte. */
    const orientees = [...src.matchAll(/\.cnv-repere[^{\n]*--(?:dessus|dessous)[^{\n]*\.cnv-repere-bras::after/g)];
    expect(orientees).toHaveLength(2);
    for (const m of orientees) expect(m[0], m[0]).toContain('--mesure');
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES, POINT 2 — LA PASTILLE OUVRE AU CLIC, PLUS AU SURVOL
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴🔴 LE CLIC OUVRE LA MODALE. Arno : « la pastille s'ouvre au CLIC (et à Entrée ou Espace au clavier), plus
   * au survol ».
   *
   * 🔴 ET C'EST UN VRAI `<button>` : Entrée et Espace déclenchent nativement son `onClick`. Un `onKeyDown` de
   * plus l'aurait ouvert DEUX fois sur Entrée (le navigateur émet aussi le clic) — c'est pour cela qu'on fige
   * ici le bouton natif, et pas un gestionnaire de touches.
   */
  it('🔴🔴 la pastille est un bouton, et le clic ouvre la modale', () => {
    expect(src).toContain('<button type="button" className="cnv-repere-i" aria-haspopup="dialog"');
    expect(src).toContain('onClick={() => setOuverte(true)}');
    expect(src).toContain('<ModaleChangementSuivi comparatif={c} mail={mail} nbMails={nbMails}');
    expect(src).toContain('{c !== null && ouverte && (');
  });

  /** 🔴 LE SURVOL NE FAIT PLUS QU'UNE CHOSE : dire ce que le clic va ouvrir. Et la bulle d'avant a disparu. */
  it('🔴🔴 au survol, seulement « Voir le détail du changement »', () => {
    expect(AIDE_PASTILLE_REPERE).toBe('Voir le détail du changement');
    expect(src).toContain('title={AIDE_PASTILLE_REPERE} aria-label={AIDE_PASTILLE_REPERE}');
    /* ⚠️ PLUS AUCUNE BULLE SUR LE REPÈRE : les lignes qu'elle composait sont parties dans la modale. */
    expect(src).not.toContain('lignes={lignesBulle}');
    expect(src).not.toContain('<InfoBien cle=""');
  });

  /**
   * 🔴🔴 AUCUNE RÈGLE DE FENÊTRE N'EST TOUCHÉE — « affichage seulement » (Arno). Le module du repère ne sait ni
   * créer, ni fermer, ni déplacer une période : il décide d'un côté et compose des mots.
   */
  it('🔴🔴 le module du repère n’écrit rien et n’appelle rien', () => {
    const pur = readFileSync('app/lib/gestion/repereFenetre.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const mot of ['fetch(', 'query(', 'INSERT', 'UPDATE', 'DELETE', 'projeter', 'periodeRepo']) {
      expect(pur, mot).not.toContain(mot);
    }
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT REPERE-INTEGRE — LE REPÈRE PREND LA PLACE DU SÉPARATEUR, IL NE S'Y AJOUTE PAS
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════

     Arno : « sur le mail qui porte un repère, la ligne de séparation grise du côté du repère (en bas en “Plus
     récent d'abord”, en haut en “Plus ancien d'abord”) est SUPPRIMÉE. La phrase et le liseré rouge prennent
     exactement sa place. » */

  /**
   * 🔴🔴 UNE SEULE RÈGLE COUVRE LES DEUX TRIS, et c'est ce qui la rend juste. Le repère est TOUJOURS rendu juste
   * après le mail dont il dépend en « plus récent d'abord », et juste avant lui en « plus ancien d'abord » — or
   * dans ce second cas, le trait gris qui le précède appartient au mail PRÉCÉDENT. Dans les deux cas, le trait à
   * effacer est donc celui du mail qui est JUSTE AVANT le repère.
   */
  it('🔴🔴 le mail qui précède un repère perd son trait gris, dans les deux tris', () => {
    expect(src).toContain('.cnv-msg:has(+ .cnv-repere){border-bottom-color:transparent}');
  });

  /**
   * 🔴🔴 ET LA HAUTEUR DE LA LIGNE NE BOUGE PAS D'UN PIXEL. `border-bottom-color:transparent` — et non
   * `border:none` ni `border-width:0` : la bordure reste dans la boîte, donc aucune reprise de mise en page.
   * Mesuré dans le navigateur sur le fil 3490 : 90,60 px avant comme après, écart 0 px (Arno en tolérait 4).
   */
  it('🔴🔴 le trait est rendu INVISIBLE, jamais retiré de la boîte', () => {
    expect(src).not.toContain('.cnv-msg:has(+ .cnv-repere){border-bottom:none}');
    expect(src).not.toContain('.cnv-msg:has(+ .cnv-repere){border-bottom-width:0}');
  });

  /** 🔴 ET LE REPÈRE SE SERRE : il remplace un trait de 1 px, il ne creuse pas un trou à sa place. */
  it('🔴 le repère ne garde que des marges minces', () => {
    expect(src).toContain('margin:.1rem 0;padding:0;list-style:none;--cnv-repere-h:0px');
  });

  /** ⚠️ UN REPÈRE PAR FENÊTRE, JAMAIS EMPILÉ : la clé reste celle de la PÉRIODE, pas celle du mail. */
  it('⚠️ la clé du repère reste celle de la période', () => {
    expect((src.match(/key=\{`rep-\$\{r\.id\}`\}/g) ?? [])).toHaveLength(2);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 4 — LA MODALE DISAIT « À CLASSER », LA LISTE DISAIT « INTERNE »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (04/10/2026) : « dans la fenêtre ouverte par le ⓘ de la ligne rouge, le statut “après” s'affiche
   À CLASSER, alors que les mails concernés affichent INTERNE dans la liste. Trouve laquelle des deux affirmations
   est fausse, avec la base comme juge. »

   CE QUE LA BASE A DIT, FIL 3490 :
     · `gestion_fil_interne` — ligne 75 ACTIVE depuis le 04/10 à 01:28:30 : l'échange EST marqué interne ;
     · `gestion_fil_periode` — les CINQ fenêtres du fil sont de sorte « biens ». Aucune n'est « interne ». Et sur
       TOUTE la base, les 23 819 fenêtres vivantes sont de sorte « biens » : le mécanisme de fenêtre n'a jamais
       porté « interne » ;
     · `gestion_message_interne` (migration 297, appliquée) — VIDE, et la table n'est NOMMÉE NULLE PART dans le
       code. La projection par mail n'a jamais été câblée : ce n'est pas une source vivante.

   🔴 VERDICT : LA LISTE AVAIT RAISON, LA MODALE AVAIT TORT. La liste lit la marque d'échange (`capsuleStatut`, qui
   place « interne » juste après les deux verts) ; la modale ne lisait QUE les fenêtres, et une fenêtre « biens »
   sans bien se lit « À classer ». Elle omettait une source.

   ÉTENDUE MESURÉE : 9 échanges portent une marque « Interne » active ; 3 d'entre eux ont aussi une fenêtre vivante
   (donc une ligne rouge avec son ⓘ) ; et ces 3 avaient le défaut. */

describe('🔴🔴 la marque « Interne » de l’échange est le repli du statut', () => {
  const sansBien: Periode['classement'] = { sorte: 'biens', biens: [] };
  const avecBien: Periode['classement'] = {
    sorte: 'biens', biens: [{ cle: 'L484', libelle: '2 Square Henri Régnault — lot 484' }],
  };

  /** 🔴 LE DÉFAUT EXACT D'ARNO : une fenêtre « biens » sans bien, sur un échange marqué interne. */
  it('🔴🔴 une fenêtre sans bien, sur un échange interne, se lit « Interne » et non « À classer »', () => {
    expect(etatDuClassement(sansBien).statut).toBe(STATUT_A_CLASSER);
    expect(etatDuClassement(sansBien, true).statut).toBe('Interne');
  });

  /**
   * 🔴 L'ORDRE EST CELUI DE LA CAPSULE DE LA LISTE, AU MOT PRÈS : des biens valent « Classé », et la marque
   * d'échange ne s'y substitue JAMAIS. Deux ordres différents auraient fait diverger la liste et la modale sur un
   * autre cas, un autre jour.
   */
  it('🔴 des biens l’emportent toujours sur la marque d’échange', () => {
    expect(etatDuClassement(avecBien, true).statut).toBe('Classé');
  });

  /** 🔴 ET UNE FENÊTRE QUI PARLE D'ELLE-MÊME GARDE SON MOT : la marque ne recouvre pas une décision explicite. */
  it('🔴 une fenêtre « hors gestion » reste « Hors gestion », même sur un échange interne', () => {
    expect(etatDuClassement({ sorte: 'hors_gestion', biens: [] }, true).statut).toBe('Hors gestion');
    expect(etatDuClassement({ sorte: 'interne', biens: [] }, false).statut).toBe('Interne');
  });

  /**
   * 🔴🔴 LA MARQUE S'APPLIQUE AUX DEUX CÔTÉS DU COMPARATIF, et c'est important : elle ne commence pas à cette
   * fenêtre, elle couvre tout l'échange. Ne l'appliquer qu'à l'« après » aurait FABRIQUÉ un changement qui n'a
   * pas eu lieu — « À classer → Interne » — c'est-à-dire remplacé une incohérence par une autre.
   */
  it('🔴🔴 le comparatif l’applique à l’avant comme à l’après', () => {
    const periodes = [
      PERIODE(1, 5495, sansBien),
      PERIODE(2, 57368, sansBien),
    ];
    const sans = comparatifRepere({ mails: MAILS, periodes, periodeId: 2 });
    expect(sans?.avant?.statut).toBe(STATUT_A_CLASSER);
    expect(sans?.apres.statut).toBe(STATUT_A_CLASSER);

    const avec = comparatifRepere({ mails: MAILS, periodes, periodeId: 2, interneDeLEchange: true });
    expect(avec?.avant?.statut).toBe('Interne');
    expect(avec?.apres.statut).toBe('Interne');
    /* 🔴 ET LA LIGNE N'EST DONC PAS MARQUÉE « MODIFIÉE » : rien n'a changé à cet endroit du fil. */
    const l = lignesComparatif(avec as NonNullable<typeof avec>).find((x) => x.libelle === 'Statut');
    expect(l?.modifie).toBe(false);
  });

  /** ⚠️ ET SANS LA MARQUE, LE COMPORTEMENT D'AVANT CE LOT EST INCHANGÉ : le paramètre est facultatif. */
  it('⚠️ le défaut du paramètre ne change rien pour les appelants existants', () => {
    const periodes = [PERIODE(1, 5495, avecBien), PERIODE(2, 57368, sansBien)];
    const c = comparatifRepere({ mails: MAILS, periodes, periodeId: 2 });
    expect(c?.avant?.statut).toBe('Classé');
    expect(c?.apres.statut).toBe(STATUT_A_CLASSER);
  });

  /**
   * 🔒 L'ÉCRAN PASSE LA MARQUE QU'IL TIENT DÉJÀ, et n'en lit pas une seconde : une seule source pour la case du
   * bandeau, la capsule du mail et cette modale.
   */
  it('🔒 la conversation passe sa propre marque, sans requête de plus', () => {
    const cnv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(cnv).toContain('interneDeLEchange={interne === true}');
    expect((cnv.match(/interneDeLEchange=\{interne === true\}/g) ?? []).length).toBe(2);
    expect(cnv).toContain('periodeId: r.id, interneDeLEchange,');
  });
});
