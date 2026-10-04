import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lienGmail, COMPTE_GESTION_DEFAUT } from './gmailMenu';
import { MENTION_DEFAUT } from './pieceSecurite';

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — « PIÈCE NON RÉCUPÉRÉE — VOIR DANS GMAIL » ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « PIÈCES VIDES (67 pièces / 53 mails) ET MAIL SANS CORPS : diagnostique la cause. Si
 * les octets sont récupérables chez Gmail, re-télécharge-les […]. Sinon, affiche sur ces seules pièces “Pièce non
 * récupérée — voir dans Gmail” avec un lien. Ne touche à rien dans le Drive. »
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE — ET POURQUOI C'EST LA SECONDE BRANCHE QUI S'APPLIQUE ═════════════════════════════════
 *
 * Mesuré le 04/10/2026 sur les 27 143 pièces de la base : **394** sans octets, sur 323 mails — dont **67 sur 53
 * mails** visibles dans l'historique d'un bien, ce qui est exactement le chiffre de l'audit.
 *
 *   · 389 : « type non autorisé pour la gestion » — la capture n'accepte qu'une liste blanche de types ;
 *   ·   5 : « pièce trop volumineuse » — au-dessus du plafond de 25 Mo.
 *
 * 🔴 CE N'EST DONC PAS UNE PANNE : la relève n'a pas ÉCHOUÉ, elle a REFUSÉ. Mon audit écrivait « c'est la relève qui
 * n'a pas pu conserver ces octets » ; c'était imprécis, et la nuance décide de la suite.
 *
 * 🔴 LES OCTETS SONT BIEN CHEZ GMAIL — les 394 mails ont tous un `Message-ID`, donc tous sont atteignables. Mais
 * les re-télécharger voudrait dire stocker des types que la liste blanche écarte exprès (`application/octet-stream`,
 * zip, `pkcs7-signature`, `image/heif`…) et passer outre le plafond. C'est un CHANGEMENT DE POLITIQUE de capture,
 * avec des conséquences de place et de sûreté : la décision est à Arno, pas à moi. J'applique donc la branche qu'il
 * a prévue pour ce cas, et je le lui dis.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PJ = readFileSync('app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx', 'utf8');

describe('🔴🔴 ① le mot d’Arno, au caractère près', () => {
  /**
   * 🔴🔴 LA PHRASE EXACTE, et le MOTIF qui reste à côté. Le motif n'est pas du bavardage : il dit POURQUOI nous ne
   * l'avons pas gardée. Sans lui, on croirait à une panne de la relève et on la relancerait en vain.
   */
  it('🔴🔴 « — Pièce non récupérée — » puis le lien, puis le motif', () => {
    /**
     * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — LA PHRASE VIENT MAINTENANT D'UN MODULE PUR
     *
     * Elle était écrite en clair dans le composant ; Arno en a demandé DEUX AUTRES (« Signature électronique du
     * mail — pas un document », « Programme non récupéré par sécurité — voir dans Gmail »). Trois phrases dans
     * un JSX auraient fait trois conditions à relire ; `mentionPieceRefusee` les décide, et l'écran les écrit.
     *
     * 🔴 LA PHRASE D'ORIGINE EST INCHANGÉE AU CARACTÈRE PRÈS, et c'est ce que `MENTION_DEFAUT` fige.
     */
    expect(MENTION_DEFAUT.mention).toBe('Pièce non récupérée — voir dans Gmail');
    expect(MENTION_DEFAUT.avecLienGmail).toBe(true);
    expect(PJ).toContain('const r = mentionPieceRefusee(p.motifNonStocke);');
    expect(PJ).toContain('voir dans Gmail ↗');
    /* 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — le motif n'est écrit que SOUS LA PHRASE PAR
       DÉFAUT. Sous les deux phrases de sécurité il ne faisait que les répéter, et c'était illisible à l'écran :
       « Signature électronique du mail — pas un document (signature électronique du mail (pkcs7) : ce n'est pas
       un document) ». Le motif garde tout son sens là où il apprend quelque chose. */
    expect(PJ).toContain(
      "{r.mention === MENTION_DEFAUT.mention && p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}",
    );
  });

  /**
   * 🔴🔴 ET SEULEMENT LÀ. « sur ces seules pièces », dit Arno : la mention vit dans la liste des pièces REFUSÉES
   * (`pj-refusee`), jamais sur une carte de pièce disponible. Une seule occurrence dans tout le fichier.
   */
  it('🔴🔴 la mention n’existe que dans la liste des pièces refusées', () => {
    /**
     * 🔴🔴 LA PHRASE N'EST PLUS ÉCRITE DANS L'ÉCRAN DU TOUT — elle vient du module pur. L'assertion devient donc
     * plus forte qu'avant : zéro occurrence dans le code du composant, et le verdict lu à UN seul endroit, dans
     * la liste des pièces refusées.
     *
     * ⚠️ ON COMPTE DANS LE CODE, PAS DANS LA PROSE : l'encadré qui explique la règle la CITE, forcément. Même
     * leçon que les gardes de ce dépôt, qui se dénonçaient sur leur propre documentation.
     */
    const code = PJ.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    expect((code.match(/Pièce non récupérée/g) ?? [])).toHaveLength(0);
    expect((code.match(/mentionPieceRefusee\(/g) ?? [])).toHaveLength(1);
    const debut = PJ.indexOf('<li key={p.pieceId} className="pj-refusee">');
    const fin = PJ.indexOf('</li>', debut);
    expect(debut).toBeGreaterThan(0);
    expect(PJ.slice(debut, fin)).toContain('mentionPieceRefusee(p.motifNonStocke)');
  });

  /**
   * ⚠️ SANS LIEN, LA MENTION RESTE — en texte, sans la flèche. Un constat nu vaut mieux qu'un lien qui ouvrirait
   * la mauvaise boîte, et `lienGmail` rend `null` quand il ne sait pas où pointer.
   */
  it('⚠️ sans adresse Gmail, la mention est un mot, pas un lien', () => {
    expect(PJ).toContain('const lien = r.avecLienGmail && gmailDuMail !== null;');
    expect(PJ).toContain('<span className="pj-refusee-gmail">voir dans Gmail</span>');
  });

  /**
   * 🔴 LE NOM DE LA PIÈCE N'EST JAMAIS UN LIEN — propriété tenue depuis le premier jour de ce bloc : il n'y a pas
   * d'octets derrière, donc un lien sur le nom serait un lien mort. La flèche est sur « voir dans Gmail », qui
   * mène au MAIL, et le dit.
   */
  it('🔴 le lien est sur « voir dans Gmail », pas sur le nom du fichier', () => {
    expect(PJ).toContain('<span className="pj-refusee-nom" title={p.nomFichier}>');
    expect(PJ).toContain('title="Ouvrir ce mail dans Gmail — la pièce y est encore"');
  });
});

describe('🔴🔴 ② l’adresse Gmail vient du module pur, et d’un seul endroit', () => {
  /**
   * 🔴🔴 UNE SEULE FAÇON DE POINTER VERS GMAIL DANS CE MODULE. `lienGmail` servait déjà au menu « Ouvrir dans
   * Gmail » du coin d'un message ; cette mention emploie la MÊME fonction. En écrire une seconde aurait donné
   * deux formes d'URL, et c'est celle qu'on regarde le moins qui aurait fini par ne plus marcher.
   */
  it('🔴🔴 la recherche par `rfc822msgid`, avec le compte présélectionné', () => {
    expect(lienGmail('gestion@criterimmo.fr', { messageIdRfc: '<abc@def.fr>' }))
      .toBe('https://mail.google.com/mail/u/?authuser=gestion%40criterimmo.fr'
        + '#search/rfc822msgid%3Aabc%40def.fr');
  });

  /** ⚠️ LES CHEVRONS SONT RETIRÉS : Gmail les refuse dans une recherche `rfc822msgid:`. */
  it('⚠️ les chevrons du Message-ID ne partent pas dans l’URL', () => {
    const avec = lienGmail('g@x.fr', { messageIdRfc: '<m-42@orange.fr>' });
    expect(avec).toContain('rfc822msgid%3Am-42%40orange.fr');
    expect(avec).not.toContain('%3C');
  });

  /** 🔴 SANS `Message-ID`, PAS DE LIEN — et c'est `null`, pas une URL approximative. */
  it('🔴 sans Message-ID, aucun lien', () => {
    expect(lienGmail('g@x.fr', { messageIdRfc: null })).toBeNull();
    expect(lienGmail('g@x.fr', { messageIdRfc: '   ' })).toBeNull();
  });

  /**
   * 🔴🔴 LE COMPTE PAR DÉFAUT EST ÉCRIT UNE SEULE FOIS. Il était en dur dans `Conversation.tsx` ; les deux écrans
   * d'historique en avaient besoin aussi. Trois copies auraient fait trois vérités, et le jour où l'adresse de
   * gestion change, c'est celle qu'on ne voit pas qui reste fausse.
   */
  it('🔴🔴 un seul compte par défaut, et personne ne le réécrit', () => {
    expect(COMPTE_GESTION_DEFAUT).toBe('gestion@criterimmo.fr');
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/Conversation.tsx',
      'app/(admin)/admin/(protected)/gestion/HistoriqueCible.tsx',
      'app/(admin)/admin/(protected)/gestion/VieDuBien.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('COMPTE_GESTION_DEFAUT');
      /* ⚠️ ET PLUS AUCUNE ADRESSE EN DUR : c'est la forme qui ferait réapparaître la seconde vérité. */
      expect(src).not.toContain("'gestion@criterimmo.fr'");
    }
  });
});

describe('🔴 ③ les trois écrans où une pièce non conservée peut apparaître', () => {
  /**
   * 🔴 LES TROIS, ET PAS DEUX. Une pièce non conservée se voit dans la conversation, dans l'historique d'une cible
   * et dans « Vie du bien » — ce sont les trois endroits qui montent `PiecesJointes`. N'en brancher que deux
   * aurait donné une mention qui apparaît ou disparaît selon l'écran, pour la même pièce.
   */
  it('🔴 les trois montages passent l’adresse Gmail du mail', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/Conversation.tsx',
      'app/(admin)/admin/(protected)/gestion/HistoriqueCible.tsx',
      'app/(admin)/admin/(protected)/gestion/VieDuBien.tsx',
    ]) {
      expect(readFileSync(f, 'utf8')).toContain('gmailDuMail={lienGmail(');
    }
  });

  /**
   * 🔴 ET LE `Message-ID` VOYAGE AVEC LA LIGNE. Les deux écrans d'historique lisent `l.messageIdRfc`, que le
   * dépôt rend désormais — sans lui, la mention serait nue dans une frise et cliquable dans une conversation.
   */
  it('🔴 la ligne d’historique porte le Message-ID', () => {
    expect(readFileSync('app/lib/gestion/historique.ts', 'utf8')).toContain('messageIdRfc: string | null;');
    expect(readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8'))
      .toContain('m.message_id AS message_id_rfc');
    expect(readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8'))
      .toContain('messageIdRfc: r.message_id_rfc,');
  });
});
