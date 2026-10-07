/**
 * ══ 🔴🔴 LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE — LES DIX CAS D'ARNO, SUR LES VRAIES DONNÉES ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « Tests : mail rattaché (1 et plusieurs biens), locataire actuel, ancien
 * locataire, propriétaire mono-bien, multi-biens avec et sans dossier propriétaire, carte de contact, adresse de
 * l'agence ignorée, aucune correspondance. »
 *
 * 🔴 ILS SE MESURENT SUR LA VRAIE BASE, et c'est la leçon du lot précédent (FILTRE-A-LA-ROUTE) : une mesure qui
 * contourne la lecture réelle ne dit rien de ce que l'écran reçoit. « Quel bien pour quelle adresse » n'est pas
 * une règle de forme — c'est une question posée à l'annuaire, et la réponse dépend des données.
 *
 * ⚠️ HORS DE `npm test` (motif `*.itest.ts`, `npm run test:integration`) : il serait rouge sur toute machine sans
 * l'annuaire et son arbre Drive, et une suite rouge pour une raison normale finit par ne plus être lue
 * (précédent `curation.test.ts`, AGENTS.md). La MISE EN FORME, elle, tourne dans `npm test` —
 * `raccourciDrive.test.ts`.
 *
 * 🔴 LES ADRESSES CITÉES SONT CELLES DE LA BASE DE TRAVAIL, pas des inventions. Si l'annuaire change, ces cas
 * doivent changer avec lui : chaque épreuve dit donc CE QU'ELLE ATTEND et POURQUOI, pour qu'on puisse la relire
 * plutôt que la deviner.
 *
 * ⚠️ LECTURE SEULE, INTÉGRALEMENT : `biensPourLaFenetreDrive` n'émet que des SELECT, et aucun appel à Google.
 * Rien n'est écrit, rien n'est à remettre en l'état — et rien n'approche « Documents clients scannés ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool } from '../db/client';
import { biensPourLaFenetreDrive } from './raccourciDriveRepo';
import { dossierDOuverture, vignettesDeLaFenetre } from './raccourciDrive';

afterAll(async () => { await closePool(); });

/** Un appel complet, de l'adresse jusqu'aux vignettes — exactement ce que la route rend. */
async function fenetre(o: { a?: string[]; fil?: number | null; lots?: string[] } = {}) {
  const r = await biensPourLaFenetreDrive({
    filId: o.fil ?? null, cles: o.lots ?? [], adresses: o.a ?? [],
  });
  const vignettes = vignettesDeLaFenetre(r.biens, r.proprietaire);
  return { ...r, vignettes, ouvre: dossierDOuverture(vignettes) };
}

describe('ⓐ le mail est rattaché — ces biens-là, et rien d’autre', () => {
  it('🔴 UN bien rattaché : une vignette, raison « rattaché au mail »', async () => {
    const f = await fenetre({ lots: ['418'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
    expect(f.biens[0].raison).toBe('rattache');
    expect(f.vignettes[0].detail).toContain('rattaché au mail');
    // 🔴 Le dossier est celui DU BIEN — le même que « Dossier Drive » sur la fiche du lot.
    expect(f.biens[0].dossierId).not.toBeNull();
  });

  it('🔴 PLUSIEURS biens rattachés : une vignette par bien, dans l’ordre demandé', async () => {
    const f = await fenetre({ lots: ['418', '282'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418', '282']);
    expect(f.vignettes).toHaveLength(2);
    expect(f.vignettes.every((v) => v.sorte === 'bien')).toBe(true);
  });

  /**
   * ══ 🔴🔴 « ET RIEN D'AUTRE » — LA MOITIÉ IMPORTANTE DE LA RÈGLE ⓐ ════════════════════════════════════════════
   *
   * Le lot 418 est rattaché, et le destinataire est le bailleur de SIX AUTRES lots. On doit voir le 418, et lui
   * seul : quelqu'un a déjà tranché en rattachant, et une déduction ne discute pas une décision.
   */
  it('🔴🔴 rattaché + un destinataire d’un AUTRE bien : l’annuaire n’est même pas consulté', async () => {
    const f = await fenetre({ lots: ['418'], a: ['ddl@rdpromotion.fr'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
    expect(f.proprietaire).toBeNull();
  });
});

describe('ⓑ rien de rattaché — la première adresse du « À » décide', () => {
  it('🔴 LOCATAIRE ACTUEL : son bien, raison « locataire »', async () => {
    // JAFFRET, entré le 05/11/2025 dans le lot 418, toujours en place.
    const f = await fenetre({ a: ['yoann.jaffret@yahoo.com'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
    expect(f.biens[0].raison).toBe('locataire');
  });

  /**
   * 🔴 ANCIEN LOCATAIRE : le même bien, mais le MOT change. DA RUI est sortie du 418 le 20/10/2025. Écrire
   * « locataire » pour quelqu'un qui est parti ferait douter de tout le reste de la vignette.
   */
  it('🔴 ANCIEN LOCATAIRE : le bien qu’il a occupé, raison « ancien locataire »', async () => {
    const f = await fenetre({ a: ['melanie.darui@gmail.com'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
    expect(f.biens[0].raison).toBe('ancien_locataire');
    expect(f.vignettes[0].detail).toContain('ancien locataire');
  });

  /**
   * 🔴 UN LOCATAIRE DE PLUSIEURS BIENS LES VOIT TOUS, le plus récent en premier — demande d'Arno. C'est une
   * différence VOULUE avec `reconnaitre`, qui, lui, renonce quand plusieurs baux se chevauchent : lui décide d'un
   * rattachement (une seule réponse possible), ici on propose des raccourcis.
   */
  it('🔴 locataire de plusieurs biens : TOUS, et aucune vignette de propriétaire', async () => {
    const f = await fenetre({ a: ['tcs.contact@enyter.com'] });
    expect(f.biens.length).toBeGreaterThan(1);
    expect(f.proprietaire).toBeNull();
    expect(f.vignettes.every((v) => v.sorte === 'bien')).toBe(true);
  });

  it('🔴 PROPRIÉTAIRE MONO-BIEN : son bien, raison « propriétaire », aucune vignette de tête', async () => {
    // NDOLO et BILE Agnès et Jean David — un seul lot, le 418.
    const f = await fenetre({ a: ['jeandavid.bile@gmail.com'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
    expect(f.biens[0].raison).toBe('proprietaire');
    expect(f.proprietaire).toBeNull();
    expect(f.vignettes).toHaveLength(1);
  });

  /**
   * 🔴🔴 PROPRIÉTAIRE MULTI-BIENS : le dossier du propriétaire en tête, puis un par bien, et c'est le dossier du
   * PROPRIÉTAIRE qui s'ouvre. RD PROMOTION ET CIE porte six lots — tous au 19 rue Diderot : c'est le numéro de
   * lot, et lui seul, qui distingue les six vignettes.
   */
  it('🔴🔴 PROPRIÉTAIRE MULTI-BIENS avec dossier : tête + un par bien, et on ouvre la tête', async () => {
    const f = await fenetre({ a: ['ddl@rdpromotion.fr'] });
    expect(f.biens.length).toBe(6);
    expect(f.proprietaire?.nbBiens).toBe(6);
    expect(f.proprietaire?.dossierId).not.toBeNull();
    expect(f.vignettes[0].sorte).toBe('proprietaire');
    expect(f.vignettes[0].detail).toBe('propriétaire de 6 biens');
    expect(f.vignettes).toHaveLength(7);
    expect(f.ouvre?.dossierId).toBe(f.proprietaire?.dossierId);
    // Les six lots sont nommés un par un : à cette adresse, c'est tout ce qui les distingue.
    for (const lot of ['478', '479', '480', '481', '482', '483']) {
      expect(f.vignettes.some((v) => v.detail.includes(`lot ${lot}`))).toBe(true);
    }
  });

  /**
   * ⚠️ MULTI-BIENS **SANS** DOSSIER PROPRIÉTAIRE : la base de travail n'en porte aucun (307 propriétaires sur
   * 307 ont leur dossier, mesuré le 07/10/2026). Le cas est donc éprouvé sur la MISE EN FORME, où il se décide
   * — `raccourciDrive.test.ts`, « multi-biens SANS dossier propriétaire ». Le dire ici plutôt que l'oublier :
   * une épreuve absente qu'on ne nomme pas finit par passer pour une épreuve verte.
   */
  it('⚠️ aucun propriétaire multi-biens n’est privé de dossier dans cette base — le cas est éprouvé au pur', () => {
    expect(true).toBe(true);
  });

  /**
   * 🔴 LA CARTE DE CONTACT DU « + » : « mêmes règles que son client, POUR LE BIEN CONCERNÉ ». Une carte porte UN
   * bien (`lot_cle` est sa clé) — c'est celui-là qu'on propose, jamais tous les biens de son client.
   */
  it('🔴 CARTE DE CONTACT créée par le « + » : son bien, et son côté', async () => {
    const f = await fenetre({ a: ['estebanfrdpro@gmail.com'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['432']);
    expect(f.biens[0].raison).toBe('contact_locataire');
    expect(f.vignettes[0].detail).toContain('contact du locataire');
  });
});

describe('ⓒ et les deux cas où l’on ne propose rien', () => {
  /**
   * ══ 🔴🔴 UNE ADRESSE DE L'AGENCE N'EST JAMAIS UNE CLÉ ════════════════════════════════════════════════════════
   *
   * `c.jullien@sansvisavis.com` EST propriétaire de cinq lots dans l'annuaire — six fiches WIPPIMMO portent une
   * de nos adresses, nous sommes bailleurs à titre personnel. Répondre à un collègue ne doit évidemment pas
   * ouvrir le dossier d'un de ces logements. C'est exactement le défaut que la liste centrale
   * (`adresseInterne.ts`) existe pour empêcher, et cette épreuve le tient de ce côté-ci.
   */
  it('🔴🔴 une adresse de l’agence est IGNORÉE, même si elle est propriétaire dans l’annuaire', async () => {
    const f = await fenetre({ a: ['c.jullien@sansvisavis.com'] });
    expect(f.biens).toHaveLength(0);
    expect(f.vignettes).toHaveLength(0);
  });

  it('🔴 l’agence est SAUTÉE, pas bloquante : la première adresse utile derrière elle décide', async () => {
    const f = await fenetre({ a: ['a.jorel@sansvisavis.com', 'jeandavid.bile@gmail.com'] });
    expect(f.biens.map((b) => b.cle)).toEqual(['418']);
  });

  it('⚠️ aucune correspondance ⇒ rien, et la fenêtre est celle d’avant ce lot', async () => {
    const f = await fenetre({ a: ['personne.inconnue@example.invalid'] });
    expect(f.biens).toHaveLength(0);
    expect(f.proprietaire).toBeNull();
    expect(f.ouvre).toBeNull();
  });

  it('⚠️ aucune adresse du tout : aucune lecture ne part en vain', async () => {
    const f = await fenetre({});
    expect(f.vignettes).toHaveLength(0);
  });
});
