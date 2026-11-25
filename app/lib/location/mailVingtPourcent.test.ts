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
    expect(marqueVingtPourcent({ sortieId: 5 })).toEqual({ sortieId: 5, modele: null }); // 🔴 (25/11) + le modèle (absent : message libre)
    for (const x of [undefined, null, 5, {}, { sortieId: '5' }, { sortieId: 0 }, { sortieId: 1.5 }]) expect(marqueVingtPourcent(x)).toBeNull();
  });
});

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/client', () => ({ query: h.query }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
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

import { destinatairesModeleVingt, MODELES_VINGT, nomDeResidence, texteModeleVingt } from './mailVingtPourcent';
/** 🔴🔴 Arno (25/11/2026) — les quatre modèles validés : le texte exact, et les destinataires qu'ils sélectionnent d'office. */
describe('🔴🔴 les quatre modèles', () => {
  const D = { logement: '3 rue A, 75011 Paris', exercice: '2026-06-30', ago: { date: '2026-12-10', statut: 'projetee' as const },
    dateSortie: '2026-03-01', locataires: ['Alice DUPONT'], proprietaires: ['Jean DURAND'] };
  it('les libellés, dans l’ordre', () => {
    expect(MODELES_VINGT.map((m) => m.libelle)).toEqual(['Syndic — date de la prochaine AGO', 'Propriétaire — date de la prochaine AGO',
      'Syndic, propriétaire(s) en copie — date de la prochaine AGO', 'Locataire — restitution du solde effectuée']);
  });
  // 🔴🔴 (Arno, 25/11/2026) — l'adresse UNE fois ; « connaître » ; lots, bâtiment et étage de la fiche ; nom de copropriété seulement s'il diffère
  const QUESTION = 'Pourriez-vous nous indiquer la date retenue, ou nous transmettre la convocation dès qu’elle sera disponible ?';
  const FIN = 'Nous vous remercions par avance et restons à votre disposition.';
  const RICHE = { ...D, numLots: ['12'], batiment: 'A', etage: '3', coproNom: 'Résidence Les Tilleuls', proprietaires: ['M. Jean DURAND'] };
  // 🔴 (Arno, 25/11/2026, dernière rédaction) l'introduction réécrite : claire, sans répétition, l'adresse une seule fois
  const INTRO_RICHE = 'Nous sommes le cabinet CRITERIMMO, gestionnaire du lot n° 12 (bâtiment A, 3e étage) situé 3 rue A, 75011 Paris, pour le compte de notre client M. Jean DURAND, copropriétaire dans la résidence Les Tilleuls, dont vous êtes le syndic.';
  const BESOIN = 'Afin de finaliser la restitution du solde du dépôt de garantie de son ancien locataire, nous avons besoin de connaître la date de la prochaine assemblée générale ordinaire, au cours de laquelle seront approuvés les comptes de l’exercice clos le 30/06/2026.';
  const nb = (t: string, x: string): number => t.split(x).length - 1;
  it('a. lot avec bâtiment et étage, copropriété nommée : la présentation, l’adresse UNE fois, « Résidence » non doublé, le locataire non nommé', () => {
    const r = texteModeleVingt('syndic', RICHE);
    expect(r).toEqual({ objet: 'Date de la prochaine AGO — 3 rue A, 75011 Paris', texte: [INTRO_RICHE, BESOIN, QUESTION, FIN].join('\n\n') });
    expect(nb(r.texte, '3 rue A')).toBe(1);
    expect(r.texte).not.toMatch(/r[ée]sidence R[ée]sidence/i);
    expect(r.texte).not.toContain('Alice');
  });
  it('a. sans lot, sans propriétaire, copropriété sans nom distinct : « gestionnaire du lot situé … », « pour le compte de notre client, », « dans cet immeuble »', () => {
    const t = texteModeleVingt('syndic', { ...D, proprietaires: [], logement: '1 rue du Préavis de Test (FICTIF), 00000 TEST', coproNom: '1 rue du Préavis de Test (FICTIF)' }).texte;
    expect(t.split('\n\n')[0]).toBe('Nous sommes le cabinet CRITERIMMO, gestionnaire du lot situé 1 rue du Préavis de Test (FICTIF), 00000 TEST, pour le compte de notre client, copropriétaire dans cet immeuble, dont vous êtes le syndic.');
    expect(texteModeleVingt('syndic', { ...D, coproNom: null }).texte).toContain('copropriétaire dans cet immeuble, dont vous êtes le syndic.');
    expect(nb(t, '1 rue du Préavis')).toBe(1);
    expect(t).not.toMatch(/ ,|,,/);
  });
  it('a. lots multiples (le bien et ses annexes), bâtiment seul, étage seul, plusieurs propriétaires', () => {
    expect(texteModeleVingt('syndic', { ...RICHE, numLots: ['12', '45', '78'], etage: null }).texte)
      .toContain('gestionnaire des lots n° 12, 45 et 78 (bâtiment A) situés 3 rue A, 75011 Paris, pour le compte');
    expect(texteModeleVingt('syndic', { ...RICHE, batiment: null, etage: '0' }).texte).toContain('gestionnaire du lot n° 12 (rez-de-chaussée) situé 3 rue A');
    expect(texteModeleVingt('syndic', { ...RICHE, batiment: ' ', etage: null }).texte).toContain('gestionnaire du lot n° 12 situé 3 rue A, 75011 Paris, pour le compte');
    expect(texteModeleVingt('syndic', { ...RICHE, numLots: [], batiment: 'B', etage: null }).texte).toContain('gestionnaire du lot (bâtiment B) situé 3 rue A');
    const t = texteModeleVingt('syndic', { ...RICHE, proprietaires: ['M. Jean DURAND', 'Mme Anne DURAND'] }).texte;
    expect(t).toContain('pour le compte de nos clients M. Jean DURAND et Mme Anne DURAND, copropriétaires dans la résidence Les Tilleuls, dont vous êtes le syndic.');
    expect(t).toContain('du dépôt de garantie de leur ancien locataire');
  });
  it('le nom de la copropriété : cité s’il diffère de l’adresse ; « Résidence » retiré en tête ; ni l’adresse ni une adresse qui la contient', () => {
    expect(nomDeResidence('Résidence Les Tilleuls', '3 rue A, 75011 Paris')).toBe('Les Tilleuls');
    expect(nomDeResidence('Les Jardins', '3 rue A, 75011 Paris')).toBe('Les Jardins');
    expect(nomDeResidence('3 rue A', '3 rue A, 75011 Paris')).toBeNull();
    expect(nomDeResidence('Résidence du 3 rue A', '3 Rue A, 75011 Paris')).toBeNull();
    expect(nomDeResidence(null, '3 rue A')).toBeNull();
    expect(nomDeResidence('  ', '3 rue A')).toBeNull();
  });
  it('🔴 « nous avons besoin de connaître la date » partout ; plus AUCUNE phrase d’estimation, quel que soit le statut de l’AGO', () => {
    for (const cle of ['syndic', 'syndic_copie'] as const) expect(texteModeleVingt(cle, RICHE).texte).toContain('nous avons besoin de connaître la date de la prochaine assemblée générale ordinaire');
    for (const statut of ['projetee', 'officielle'] as const) for (const cle of ['syndic', 'proprietaire', 'syndic_copie', 'locataire'] as const) {
      const t = texteModeleVingt(cle, { ...RICHE, ago: { date: '2026-12-10', statut } }).texte;
      expect(t, `${cle} ${statut}`).not.toMatch(/estim|aux environs|À défaut d’information|besoin de la date/);
    }
  });
  it('b. propriétaire : l’adresse dans l’objet seulement, la copropriété nommée si elle a un nom distinct ; pluriel des colocataires', () => {
    expect(texteModeleVingt('proprietaire', RICHE)).toEqual({ objet: 'Date de la prochaine AGO — 3 rue A, 75011 Paris', texte:
      'Suite au départ de votre locataire Alice DUPONT le 01/03/2026, nous avons conservé 20 % de son dépôt de garantie, dans l’attente de l’approbation des comptes de l’exercice clos le 30/06/2026 par l’assemblée générale de la copropriété Les Tilleuls.\n\n'
      + 'Si vous avez reçu la convocation, ou si vous connaissez la date de la prochaine assemblée générale ordinaire, pourriez-vous nous la communiquer ? Cela nous permettra de procéder à la régularisation et à la restitution du solde dans les délais.\n\nMerci par avance.' });
    expect(texteModeleVingt('proprietaire', { ...RICHE, coproNom: '3 rue A' }).texte).toContain('par l’assemblée générale de la copropriété.');
    expect(texteModeleVingt('proprietaire', RICHE).texte).not.toContain('3 rue A');
    expect(texteModeleVingt('proprietaire', { ...RICHE, locataires: ['Paul MARTIN', 'Léa MARTIN'] }).texte).toContain('Suite au départ de vos locataires Paul MARTIN et Léa MARTIN le 01/03/2026, nous avons conservé 20 % de leur dépôt');
  });
  it('c. le modèle a, avec la ligne de copie juste avant les remerciements (un propriétaire ; plusieurs) ; même objet', () => {
    const c = texteModeleVingt('syndic_copie', RICHE);
    expect(c).toEqual({ objet: 'Date de la prochaine AGO — 3 rue A, 75011 Paris', texte: [INTRO_RICHE, BESOIN, QUESTION, 'M. Jean DURAND, propriétaire, est en copie de ce mail.', FIN].join('\n\n') });
    expect(texteModeleVingt('syndic_copie', { ...RICHE, proprietaires: ['M. Jean DURAND', 'SCI Les Tilleuls'] }).texte)
      .toContain('M. Jean DURAND et SCI Les Tilleuls, propriétaires, sont en copie de ce mail.\n\nNous vous remercions');
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

/** 🔴🔴 Arno (25/11/2026) — « x mail(s) envoyé(s) depuis cette page » : la marque porte le modèle ; le lien est noté à la demande ; seuls les envois PARTIS comptent. */
describe('🔴🔴 les mails envoyés depuis la ligne', () => {
  it('la marque porte le modèle choisi (l’un des quatre, sinon null = message libre)', () => {
    expect(marqueVingtPourcent({ sortieId: 5, modele: 'syndic_copie' })).toEqual({ sortieId: 5, modele: 'syndic_copie' });
    expect(marqueVingtPourcent({ sortieId: 5, modele: 'autre' })).toEqual({ sortieId: 5, modele: null });
    expect(marqueVingtPourcent({ sortieId: 5 })).toEqual({ sortieId: 5, modele: null });
  });
  it('noterMailVingt : la sortie, la clé d’idempotence, le modèle (paramètres liés) ; jamais deux fois la même clé', async () => {
    h.query.mockReset().mockResolvedValue({ rows: [] });
    const { noterMailVingt } = await import('./mailVingtPourcentRepo');
    await noterMailVingt({ sortieId: 7, cleIdempotence: 'cle-123456', modele: 'syndic' });
    const [sql, p] = h.query.mock.calls.at(-1)! as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).toContain('INSERT INTO gestion_location_mail_vingt (sortie_validee_id, cle_idempotence, modele) VALUES ($1, $2, $3) ON CONFLICT (cle_idempotence) DO NOTHING');
    expect(p).toEqual([7, 'cle-123456', 'syndic']);
  });
  it('mailsEnvoyesDesSorties : seulement les envois « envoye » et partis, JAMAIS une simulation de la recette (« recette-… ») ; le lien dès la relève', async () => {
    h.query.mockReset().mockResolvedValue({ rows: [
      { sortie: '7', modele: 'syndic', le: '2026-11-25T10:12', a: ['syndic@x.test'], cc: ['jean@x.test'], cci: [], message: '901', fil: '55' },
      { sortie: '7', modele: null, le: '2026-11-25T11:00', a: ['alice@x.test'], cc: [], cci: [], message: null, fil: null }] });
    const { mailsEnvoyesDesSorties } = await import('./mailVingtPourcentRepo');
    const m = await mailsEnvoyesDesSorties([7]);
    expect(m.get(7)).toEqual([
      { le: '2026-11-25T10:12', a: ['syndic@x.test'], copies: 1, modele: 'syndic', lien: '/admin/gestion?fil=55&message=901', messageId: 901, filId: 55 },
      { le: '2026-11-25T11:00', a: ['alice@x.test'], copies: 0, modele: null, lien: null, messageId: null, filId: null }]);
    const sql = String(h.query.mock.calls.at(-1)![0]).replace(/\s+/g, ' ');
    expect(sql).toContain("e.etat = 'envoye' AND e.parti_le IS NOT NULL");
    expect(sql).toContain("coalesce(e.gmail_message_id, '') NOT LIKE 'recette-%'");
    expect(sql).toContain('JOIN gestion_envoi e ON e.cle_idempotence = l.cle_idempotence');
    expect(h.query.mock.calls.at(-1)![1]).toEqual([[7]]);
  });
  it('la route note le lien APRÈS le contrôle « un mail par locataire » (un mail refusé n’est jamais noté)', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    expect(r.indexOf('await noterMailVingt({ sortieId: vingt.sortieId, cleIdempotence: demande.cleIdempotence, modele: vingt.modele });'))
      .toBeGreaterThan(r.indexOf('const motif = await refusMailVingtPourcent(vingt.sortieId'));
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8')).toContain('modele: b.vingtPourcent.modele ?? null');
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « il faut une traçabilité depuis le préavis de ce locataire, pour que le bien soit clairement identifié du début du préavis
 * jusqu'à la restitution finale des 20 %, plusieurs mois après » ; le bien reste identifié même si le logement est reloué entre-temps.
 */
describe('🔴🔴 le bien d’un mail parti d’une ligne : celui de la SORTIE VALIDÉE, jamais un autre', () => {
  it('cibleDeLaSortie lit s.lot_id (posé à la validation) : ni occupation en cours, ni adresse, ni nom — un logement reloué garde son bien', async () => {
    h.query.mockReset().mockResolvedValue({ rows: [{ id: '445', cle: 'W445', libelle: '1 rue du Préavis de Test, 00000 TEST' }] });
    const { cibleDeLaSortie } = await import('./mailVingtPourcentRepo');
    expect(await cibleDeLaSortie(7)).toEqual({ sorte: 'lot', cle: 'W445', id: 445, libelle: '1 rue du Préavis de Test, 00000 TEST' });
    const [sql, p] = h.query.mock.calls.at(-1)! as [string, unknown[]];
    const n = sql.replace(/\s+/g, ' ');
    expect(n).toContain('FROM gestion_location_sortie_validee s JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id WHERE s.id = $1');
    expect(p).toEqual([7]);
    // relocation : un nouveau locataire = une NOUVELLE occupation sur le même lot ; la lecture n'en dépend pas
    expect(n).not.toContain('gestion_annuaire_occupation');
    expect(n).not.toMatch(/sortie IS NULL|adresse =|ILIKE/);
    h.query.mockReset().mockResolvedValue({ rows: [] });
    expect(await cibleDeLaSortie(999)).toBeNull();
  });
  it('la route REPOSE ce seul bien (ni interne, ni hors gestion) après le contrôle « un mail par locataire », avant la mise en file ; sortie introuvable : refus', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    const bien = r.indexOf('const bien = await cibleDeLaSortie(vingt.sortieId);');
    expect(bien).toBeGreaterThan(r.indexOf('const motif = await refusMailVingtPourcent(vingt.sortieId'));
    expect(bien).toBeGreaterThan(r.indexOf('demande.cibles = gardees;'));    // après le filet : rien ne peut l'écarter
    expect(bien).toBeLessThan(r.indexOf('if (await fileEnvoiDisponible()) {'));
    const suite = r.slice(bien, bien + 500);
    expect(suite).toContain('demande.cibles = ciblesDemandees([bien]);');
    expect(suite).toContain('demande.interne = false;');
    expect(suite).toContain('demande.horsGestion = false;');
    expect(suite).toContain("if (bien === null) return Response.json({ erreur: 'Sortie introuvable : le mail n’est pas envoyé.', code: 'invalide' }, { status: 422 });");
  });
  it('l’écran « 20 % à restituer » et « Restitutions faites » lisent aussi le bien par s.lot_id, les locataires par s.occupation_ids', () => {
    const v = readFileSync('app/lib/location/vingtPourcentRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(v).toContain('JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id');
    expect(v).toContain('ANY(s.occupation_ids)');
    const f = readFileSync('app/lib/location/restitutionVingtRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(f).toContain('lo.id = s.lot_id');
    expect(f).toContain('s.occupation_ids');
  });
});

import { suggestionsDeLaSortie } from './mailVingtPourcent';
/** 🔴 Décision d'Arno (25/11/2026) — « ne propose comme locataire que le(s) locataire(s) sorti(s) de cette ligne, jamais le nouveau locataire du logement ». */
describe('🔴 suggestionsDeLaSortie', () => {
  const S = (adresse: string, ton: string, role = ton) => ({ adresse, nom: null, role, ton, propre: true, civilite: null, nomFamille: null }) as never;
  const G = [
    { cle: 'clients' as const, titre: 'Clients de l’agence', lignes: [S('proprio@x.fr', 'proprietaire'), S('nouveau@x.fr', 'locataire'), S('Alice@X.fr', 'ancien_locataire'), S('autre.ancien@x.fr', 'ancien_locataire')] },
    { cle: 'immeuble' as const, titre: 'Immeuble', lignes: [S('syndic@x.fr', 'syndic')] },
    { cle: 'autres' as const, titre: 'Autres', lignes: [S('nouveau@x.fr', 'neutre', 'vu dans 2 mails'), S('artisan@x.fr', 'neutre')] },
  ];
  it('écarte le locataire actuel et les autres anciens PARTOUT (« vu dans N mails » compris) ; garde le sorti (casse ignorée), propriétaire, syndic', () => {
    const r = suggestionsDeLaSortie(G, [{ nom: 'Alice', emails: ['alice@x.fr'] }]);
    expect(r.map((g) => g.lignes.map((x: { adresse: string }) => x.adresse))).toEqual([['proprio@x.fr', 'Alice@X.fr'], ['syndic@x.fr'], ['artisan@x.fr']]);
  });
  it('un locataire sorti absent de la liste (relocation : il n’y est plus) est AJOUTÉ aux clients, « Locataire sorti »', () => {
    const r = suggestionsDeLaSortie(G, [{ nom: 'Léo', emails: ['leo@x.fr'] }]);
    expect(r[0].lignes.at(-1)).toMatchObject({ adresse: 'leo@x.fr', nom: 'Léo', role: 'Locataire sorti', ton: 'ancien_locataire' });
    expect(r[0].lignes.map((x: { adresse: string }) => x.adresse)).not.toContain('nouveau@x.fr');
    expect(suggestionsDeLaSortie([], [{ nom: 'Léo', emails: ['leo@x.fr'] }])[0].cle).toBe('clients');
  });
});

import { echangesDeLaLigne, mentionMailsEchanges } from './vingtPourcent';
/**
 * 🔴🔴 Arno (25/11/2026) — la conversation d'une ligne (les fils de ses mails partis, réponses comprises) et « combien de mails ont été échangés »
 * (envoyés + reçus), sous la capsule AGO de la ligne repliée.
 */
describe('🔴🔴 les échanges d’une ligne', () => {
  const E = (le: string, filId: number | null) => ({ le, a: ['x@x.test'], copies: 0, modele: null, lien: null, messageId: filId === null ? null : 1, filId });
  it('echangesDeLaLigne : les fils (sans doublon), les mails de chaque fil (envoyés + reçus) + les partis pas encore capturés ; le plus récent', () => {
    const comptes = new Map([[55, { nombre: 3, dernierLe: '2026-11-25T08:00' }], [56, { nombre: 1, dernierLe: '2026-11-24T18:30' }]]);
    expect(echangesDeLaLigne([E('2026-11-24T09:05', 55), E('2026-11-24T10:00', 55), E('2026-11-24T11:00', 56), E('2026-11-25T10:12', null)], comptes))
      .toEqual({ fils: [55, 56], nombre: 5, dernierLe: '2026-11-25T10:12' });
    expect(echangesDeLaLigne([E('2026-11-24T09:05', 55)], comptes)).toEqual({ fils: [55], nombre: 3, dernierLe: '2026-11-25T08:00' });
    expect(echangesDeLaLigne([], comptes)).toBeNull();
    expect(echangesDeLaLigne([E('2026-11-24T09:05', 99)], comptes)).toBeNull();   // fil sans mail lisible (déplacé) : rien
  });
  it('mentionMailsEchanges : pluriel, singulier, rien', () => {
    expect(mentionMailsEchanges({ fils: [1], nombre: 3, dernierLe: '2026-11-25T10:12' })).toBe('3 mails échangés — dernier le 25/11/2026');
    expect(mentionMailsEchanges({ fils: [1], nombre: 1, dernierLe: '2026-11-24T18:30' })).toBe('1 mail échangé — dernier le 24/11/2026');
    expect(mentionMailsEchanges({ fils: [], nombre: 0, dernierLe: null })).toBeNull();
    expect(mentionMailsEchanges(undefined)).toBeNull();
  });
  it('comptesDesFils : par fil, comptés comme la conversation les montre (sans les mails déplacés), le dernier à l’heure de Paris ; paramètres liés', async () => {
    h.query.mockReset().mockResolvedValue({ rows: [{ fil: '55', nombre: '3', dernier: '2026-11-25T08:00' }] });
    const { comptesDesFils } = await import('./mailVingtPourcentRepo');
    expect(await comptesDesFils([55, 56])).toEqual(new Map([[55, { nombre: 3, dernierLe: '2026-11-25T08:00' }]]));
    const [sql, p] = h.query.mock.calls.at(-1)! as [string, unknown[]];
    const n = sql.replace(/\s+/g, ' ');
    expect(n).toContain('WHERE m.fil_id = ANY($1::bigint[])');
    expect(n).toContain('NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.message_id = m.id AND am.actif)');
    expect(n).toContain("max(m.recu_le) AT TIME ZONE 'Europe/Paris'");
    expect(p).toEqual([[55, 56]]);
    h.query.mockReset();
    expect(await comptesDesFils([])).toEqual(new Map());
    expect(h.query).not.toHaveBeenCalled();
  });
  it('« les réponses reçues sont rattachées au même bien » : la route pose la portée « Ce mail + futurs échanges » (le chemin de la fenêtre de rattachement)', () => {
    const r = readFileSync('app/(admin)/api/admin/gestion/envois/route.ts', 'utf8');
    const i = r.indexOf("demande.rattachement = { position: 'suite', retires: [] };");
    expect(i).toBeGreaterThan(r.indexOf('demande.cibles = ciblesDemandees([bien]);'));
    expect(i).toBeLessThan(r.indexOf('if (await fileEnvoiDisponible()) {'));
    // et ce rattachement voyage jusqu'à l'intention appliquée après capture (enregistrerClassementEnvoi → poserClassement)
    expect(r.match(/rattachement: demande\.rattachement,/g)?.length).toBe(2);
  });
});
