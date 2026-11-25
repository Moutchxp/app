import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { marqueVingtPourcent, MOTIF_DEUX_LOCATAIRES, MOTIF_LOCATAIRE_PAS_SEUL, refusUnLocataireParMail } from './mailVingtPourcent';

/** 🔴🔴 Arno (25/11/2026, décision 2A) — « un mail par locataire » : la règle, et son contrôle au serveur (adresses relues en base). */
describe('🔴🔴 refusUnLocataireParMail', () => {
  const LOCS = [['alice@exemple.test', 'alice.pro@exemple.test'], ['leo@exemple.test']];
  it('un seul locataire, à lui seul (une ou plusieurs de SES adresses, casse indifférente) : accepté', () => {
    expect(refusUnLocataireParMail(LOCS, ['Alice@Exemple.test'])).toBeNull();
    expect(refusUnLocataireParMail(LOCS, ['alice@exemple.test', 'alice.pro@exemple.test'])).toBeNull();
  });
  it('deux locataires dans le même mail (À, Cc ou Cci) : refusé', () => {
    expect(refusUnLocataireParMail(LOCS, ['alice@exemple.test', 'leo@exemple.test'])).toBe(MOTIF_DEUX_LOCATAIRES);
  });
  it('un locataire avec un autre destinataire (propriétaire, syndic, n’importe qui) : refusé — aucun client ne voit l’adresse d’un autre', () => {
    expect(refusUnLocataireParMail(LOCS, ['leo@exemple.test', 'jean@exemple.test'])).toBe(MOTIF_LOCATAIRE_PAS_SEUL);
  });
  it('aucun locataire (syndic, propriétaires, syndic avec propriétaires en copie) : pas concerné', () => {
    expect(refusUnLocataireParMail(LOCS, ['syndic@exemple.test', 'jean@exemple.test', 'sci@exemple.test'])).toBeNull();
    expect(refusUnLocataireParMail([], ['x@exemple.test'])).toBeNull();
  });
  it('la marque est lue strictement (un entier positif)', () => {
    expect(marqueVingtPourcent({ sortieId: 5 })).toEqual({ sortieId: 5 });
    for (const x of [undefined, null, 5, {}, { sortieId: '5' }, { sortieId: 0 }, { sortieId: 1.5 }]) expect(marqueVingtPourcent(x)).toBeNull();
  });
});

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/client', () => ({ query: h.query }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
const { adressesDesLocatairesDeLaSortie, refusMailVingtPourcent } = await import('./mailVingtPourcentRepo');

describe('🔴🔴 le contrôle du serveur', () => {
  it('relit en base les adresses de chaque locataire de la sortie (paramètre lié), et refuse deux locataires', async () => {
    h.query.mockResolvedValue({ rows: [{ locataire: '1', adresse: 'alice@exemple.test' }, { locataire: '1', adresse: 'alice.pro@exemple.test' }, { locataire: '2', adresse: 'leo@exemple.test' }, { locataire: '3', adresse: null }] });
    expect(await adressesDesLocatairesDeLaSortie(7)).toEqual([['alice@exemple.test', 'alice.pro@exemple.test'], ['leo@exemple.test'], []]);
    expect(h.query.mock.calls[0][1]).toEqual([7]);
    expect(String(h.query.mock.calls[0][0]).replace(/\s+/g, ' ')).toContain("c.sujet = 'locataire' AND c.sujet_id = o.locataire_id AND c.sorte = 'email'");
    expect(await refusMailVingtPourcent(7, ['alice@exemple.test', 'leo@exemple.test'])).toBe(MOTIF_DEUX_LOCATAIRES);
    expect(await refusMailVingtPourcent(7, ['leo@exemple.test'])).toBeNull();
  });
  it('la route d’envoi l’applique aux seuls mails marqués, avant la mise en file comme avant l’envoi direct', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    const i = r.indexOf('const vingt = marqueVingtPourcent(corps.vingtPourcent);');
    expect(i).toBeGreaterThan(r.indexOf('const habitantVisible = await refusEnvoiHabitants(demande);'));
    expect(i).toBeLessThan(r.indexOf('if (await fileEnvoiDisponible()) {'));
    expect(r).toContain("if (motif !== null) return Response.json({ erreur: motif, code: 'invalide' }, { status: 422 });");
  });
});

import { destinatairesModeleVingt, MODELES_VINGT, texteModeleVingt } from './mailVingtPourcent';
/** 🔴🔴 Arno (25/11/2026) — les quatre modèles validés : le texte exact, et les destinataires qu'ils sélectionnent d'office. */
describe('🔴🔴 les quatre modèles', () => {
  const D = { copro: 'Résidence Les Tilleuls, 3 rue A', logement: '3 rue A, 75011 Paris', exercice: '2026-06-30', ago: { date: '2026-12-10', statut: 'projetee' as const },
    dateSortie: '2026-03-01', locataires: ['Alice DUPONT'], proprietaires: ['Jean DURAND'] };
  it('les libellés, dans l’ordre', () => {
    expect(MODELES_VINGT.map((m) => m.libelle)).toEqual(['Syndic — date de la prochaine AGO', 'Propriétaire — date de la prochaine AGO',
      'Syndic, propriétaire(s) en copie — date de la prochaine AGO', 'Locataire — restitution du solde effectuée']);
  });
  it('a. syndic (AGO projetée : l’estimation est dite)', () => {
    expect(texteModeleVingt('syndic', D)).toEqual({ objet: 'Date de la prochaine AGO — Résidence Les Tilleuls, 3 rue A', texte:
      'Nous gérons un lot de la copropriété Résidence Les Tilleuls, 3 rue A. Pour régulariser les charges d’un locataire sorti et lui restituer le solde de son dépôt de garantie, nous avons besoin de la date de la prochaine assemblée générale ordinaire, qui approuvera les comptes de l’exercice clos le 30/06/2026. À défaut d’information, nous l’estimons aux environs de décembre 2026.\n\n'
      + 'Pourriez-vous nous indiquer la date retenue, ou nous transmettre la convocation dès qu’elle sera disponible ?\n\nNous vous remercions par avance et restons à votre disposition.' });
    // AGO officielle ou inconnue : pas d'estimation ; exercice inconnu : « l'exercice concerné »
    expect(texteModeleVingt('syndic', { ...D, ago: { date: '2026-12-10', statut: 'officielle' } }).texte).not.toContain('estimons');
    expect(texteModeleVingt('syndic', { ...D, ago: null, exercice: null }).texte).toContain('les comptes de l’exercice concerné.');
  });
  it('b. propriétaire (singulier ; colocation au pluriel)', () => {
    expect(texteModeleVingt('proprietaire', D)).toEqual({ objet: 'Date de la prochaine AGO — 3 rue A, 75011 Paris', texte:
      'Suite au départ de votre locataire Alice DUPONT le 01/03/2026, nous avons conservé 20 % de son dépôt de garantie, dans l’attente de l’approbation des comptes de l’exercice clos le 30/06/2026 par l’assemblée générale de la copropriété Résidence Les Tilleuls, 3 rue A. Nous estimons cette assemblée aux environs de décembre 2026.\n\n'
      + 'Si vous avez reçu la convocation, ou si vous en connaissez la date, pourriez-vous nous la communiquer ? Cela nous permettra de procéder à la régularisation et à la restitution du solde dans les délais.\n\nMerci par avance.' });
    expect(texteModeleVingt('proprietaire', { ...D, locataires: ['Paul MARTIN', 'Léa MARTIN'] }).texte).toContain('Suite au départ de vos locataires Paul MARTIN et Léa MARTIN le 01/03/2026, nous avons conservé 20 % de leur dépôt');
  });
  it('c. le modèle a, avec la phrase de copie (un ou plusieurs propriétaires)', () => {
    const c = texteModeleVingt('syndic_copie', D);
    expect(c.texte).toBe(texteModeleVingt('syndic', D).texte.replace('\n\nNous vous remercions', '\n\nNous mettons Jean DURAND, propriétaire du lot, en copie de ce message.\n\nNous vous remercions'));
    expect(texteModeleVingt('syndic_copie', { ...D, proprietaires: ['Jean DURAND', 'SCI Les Tilleuls'] }).texte).toContain('Nous mettons Jean DURAND et SCI Les Tilleuls, propriétaires du lot, en copie de ce message.');
  });
  it('d. locataire : restitution enregistrée (montant retenu dit s’il existe) ; sinon les champs « [à compléter] »', () => {
    expect(texteModeleVingt('locataire', { ...D, restitution: { date: '2026-11-20', montantRestitue: 312.5, montantRetenuCharges: 40 } })).toEqual({
      objet: 'Restitution du solde de votre dépôt de garantie — 3 rue A, 75011 Paris', texte:
        'Lors de votre départ du logement situé 3 rue A, 75011 Paris le 01/03/2026, 20 % de votre dépôt de garantie avaient été conservés dans l’attente de l’arrêté des comptes de la copropriété.\n\n'
        + 'Les comptes ayant été approuvés, nous vous confirmons la restitution du solde le 20/11/2026, pour un montant de 312,50 €. Un montant de 40,00 € a été conservé au titre de la régularisation des charges.\n\n'
        + 'Nous restons à votre disposition pour toute question et vous souhaitons une bonne continuation.' });
    expect(texteModeleVingt('locataire', { ...D, restitution: { date: '2026-11-20', montantRestitue: 1200, montantRetenuCharges: null } }).texte).not.toContain('conservé au titre');
    const v = texteModeleVingt('locataire', D).texte;
    expect(v).toContain('la restitution du solde le [à compléter], pour un montant de [à compléter] €.');
    expect(v).toContain('Un montant de [à compléter] € a été conservé au titre de la régularisation des charges (phrase à supprimer s’il n’y a pas de retenue).');
  });
  it('les destinataires d’office : a syndic, b propriétaires, c syndic + propriétaires en copie, d un envoi par locataire (sa première adresse)', () => {
    const S = { syndics: ['syndic@x.test'], proprietaires: ['jean@x.test', 'sci@x.test'], locataires: [['alice@x.test', 'alice2@x.test'], ['leo@x.test'], []] };
    expect(destinatairesModeleVingt('syndic', S)).toEqual([{ a: ['syndic@x.test'], cc: [], locataire: null }]);
    expect(destinatairesModeleVingt('proprietaire', S)).toEqual([{ a: ['jean@x.test', 'sci@x.test'], cc: [], locataire: null }]);
    expect(destinatairesModeleVingt('syndic_copie', S)).toEqual([{ a: ['syndic@x.test'], cc: ['jean@x.test', 'sci@x.test'], locataire: null }]);
    expect(destinatairesModeleVingt('locataire', S)).toEqual([{ a: ['alice@x.test'], cc: [], locataire: 0 }, { a: ['leo@x.test'], cc: [], locataire: 1 }, { a: [], cc: [], locataire: 2 }]);
    // chaque envoi du modèle d respecte « un mail par locataire »
    for (const e of destinatairesModeleVingt('locataire', S)) expect(refusUnLocataireParMail(S.locataires, [...e.a, ...e.cc])).toBeNull();
  });
});
