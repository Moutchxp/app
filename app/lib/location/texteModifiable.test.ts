import { describe, expect, it } from 'vitest';
import { estModifie, lireRetouches, paragraphesDesParties, partiesDuMail, refusRetouche, remplirReperes, reperesDe } from './texteModifiable';
import { mailsDuPreavis, mailsSortieLocataires, mailAdhocSortie, REPERE_NOM, type DonneesPreavisMails } from './mailsPreavisSortie';

/**
 * 🔴🔴 LE TEXTE MODIFIABLE AVANT ENVOI, AVEC SES PARTIES PROTÉGÉES (décision d'Arno du 10/11/2026, option 1). MODULE PUR et composeurs.
 * Parties modifiables modifiées ; parties protégées impossibles à changer (clé refusée, repère retiré refusé) ; texte d'origine inchangé sans
 * retouche ; plusieurs locataires, chacun son nom ; le texte proposé gardé quand il est modifié.
 */
const D: DonneesPreavisMails = {
  adresse: '4 rue Fictive, 92800 Puteaux', proprietaire: 'DUPONT Jean', enGestion: true,
  locataires: [
    { occupationId: 11, nom: 'BERNARD Alice', prenom: null, emails: ['alice@exemple.test'] },
    { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: ['paul@exemple.test'] },
  ],
  recuLe: '2026-11-10', choix: { mode: 'mois', duree: 1 }, expediteur: 'gestion@criterimmo.fr', copropriete: true,
  valideur: { nom: 'Lucie Fictive', email: 'lucie.fictive@exemple.test', prenom: 'Lucie', nomFamille: 'Fictive' }, signature: { html: '<b>Gestion</b>', texte: 'Gestion' },
  partenaires: ['gestion.criterimmo@gmail.com'],
};
const RETOUCHE = {
  appel: `Chère, cher {${REPERE_NOM}},`,
  intro: 'Nous avons bien reçu le {date de réception} votre congé pour le logement du {adresse}.',
  conclusion: 'Belle fin de semaine à vous.',
  politesse: 'Bien cordialement,',
};

describe('le module pur', () => {
  it('repères : lus, remplis ; un repère inconnu reste tel quel', () => {
    expect(reperesDe('a {x} b {y} {x}')).toEqual(['x', 'y']);
    expect(remplirReperes('{x} et {z}', { x: '1' })).toBe('1 et {z}');
  });
  it('🔴 la lecture d’une requête REFUSE toute partie protégée ou inconnue, et toute sorte non permise', () => {
    expect(lireRetouches({ preavis_locataires: { intro: 'x' } }, ['preavis_locataires'])).toEqual({ ok: true, retouches: { preavis_locataires: { intro: 'x' } } });
    for (const cle of ['objet', 'signature', 'mention', 'protege_0', 'depot', 'copie']) {
      const r = lireRetouches({ preavis_locataires: { [cle]: 'piraté' } }, ['preavis_locataires']);
      expect(r.ok, cle).toBe(false);
      if (!r.ok) expect(r.motif).toContain('partie protégée');
    }
    expect(lireRetouches({ previsite_alerte: { intro: 'x' } }, ['preavis_locataires']).ok).toBe(false);
    expect(lireRetouches({ preavis_locataires: { intro: 42 } }, ['preavis_locataires']).ok).toBe(false);
    expect(lireRetouches({ preavis_locataires: { intro: 'x'.repeat(5001) } }, ['preavis_locataires']).ok).toBe(false);
    expect(lireRetouches(undefined, ['preavis_locataires'])).toEqual({ ok: true, retouches: {} });
  });
  it('🔴 un repère protégé retiré ou changé est REFUSÉ', () => {
    const parties = partiesDuMail({ appel: 'Bonjour,', intro: 'Le {adresse}, le {date}.', proteges: [{ libelle: 'P', texte: 'protégé' }], politesse: 'Cordialement,' });
    expect(refusRetouche(parties, { intro: 'Le {adresse}, le {date}, merci.' })).toBeNull();
    expect(refusRetouche(parties, { intro: 'Le 12 rue Inventée, le {date}.' })).toContain('« {adresse} » est une donnée protégée');
    expect(refusRetouche(parties, { protege_0: 'changé' } as never)).toContain('n’est pas modifiable');
  });
  it('conclusion vide par défaut (absente du texte) ; politesse effaçable ; retapé à l’identique : pas une modification', () => {
    const parties = partiesDuMail({ appel: 'Bonjour,', intro: 'Intro.', proteges: [], politesse: 'Cordialement,' });
    expect(paragraphesDesParties(parties, null, {})).toEqual(['Bonjour,', 'Intro.', 'Cordialement,']);
    expect(paragraphesDesParties(parties, { conclusion: 'Merci.', politesse: '' }, {})).toEqual(['Bonjour,', 'Intro.', 'Merci.']);
    expect(estModifie(parties, { intro: 'Intro.  ' })).toBe(false);
    expect(estModifie(parties, { intro: 'Autre.' })).toBe(true);
  });
});

describe('🔴 l’accusé de préavis : parties modifiables modifiées, parties protégées intactes, chaque locataire avec son nom', () => {
  it('sans retouche : texte d’origine INCHANGÉ (et aucun texte d’origine gardé)', () => {
    const sans = mailsDuPreavis(D).mails;
    const vide = mailsDuPreavis({ ...D, retouches: {} }).mails;
    expect(vide.map((m) => m.texte)).toEqual(sans.map((m) => m.texte));
    expect(sans[0].texte.startsWith('Bonjour Alice BERNARD,\n\nNous accusons réception de votre congé pour le logement situé 4 rue Fictive, 92800 Puteaux, reçu le 10/11/2026.')).toBe(true);
    expect(sans.every((m) => m.texteOrigine === undefined)).toBe(true);
    expect(sans[0].edition?.modifie).toBe(false);
  });
  it('avec retouche : appel, introduction, conclusion et politesse changent ; dates, adresse, provision, article, mention et signature restent ; chacun SON nom', () => {
    const l = mailsDuPreavis({ ...D, retouches: { preavis_locataires: RETOUCHE } }).mails;
    const [alice, paul, copie] = l;
    expect(alice.texte.startsWith('Chère, cher Alice BERNARD,\n\nNous avons bien reçu le 10/11/2026 votre congé pour le logement du 4 rue Fictive, 92800 Puteaux.\n\nVotre préavis étant de 1 mois, votre bail prendra fin le 10/12/2026.')).toBe(true);
    expect(paul.texte.startsWith('Chère, cher Paul MARTIN,')).toBe(true);
    for (const m of [alice, paul]) {
      expect(m.texte).toContain('(article 22 de la loi n° 89-462 du 6 juillet 1989)');
      expect(m.texte).toContain('Enfin, le logement étant situé dans un immeuble en copropriété');
      expect(m.texte).toContain('Belle fin de semaine à vous.\n\nBien cordialement,\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n-- \nGestion');
      expect(m.texte).not.toContain('Nous restons à votre disposition');
      expect(m.cc).toEqual([]);
      expect(m.edition?.modifie).toBe(true);
      expect(m.texteOrigine?.startsWith(`Bonjour ${m === alice ? 'Alice BERNARD' : 'Paul MARTIN'},\n\nNous accusons réception`)).toBe(true);
    }
    expect(`${alice.texte} ${alice.html}`).not.toMatch(/paul|MARTIN/i); // confidentialité inchangée
    expect(copie.objet.startsWith('[Copie interne]')).toBe(true);
    expect(copie.texte.endsWith(alice.texte)).toBe(true);
    // Le mail aux partenaires porte la copie de l'accusé RÉELLEMENT envoyé.
    expect(l[3].texte).toContain(alice.texte);
  });
  it('les partenaires : leur propre texte modifiable, la copie de l’accusé protégée', () => {
    const l = mailsDuPreavis({ ...D, retouches: { preavis_adhoc: { intro: 'Congé de {locataires} reçu le {date de réception} — {adresse} ({propriétaire}), fin le {date de fin du bail}.', politesse: 'Merci,' } } }).mails;
    const adhoc = l[3];
    expect(adhoc.texte.startsWith('Bonjour,\n\nCongé de Alice BERNARD et Paul MARTIN reçu le 10/11/2026 — 4 rue Fictive, 92800 Puteaux (DUPONT Jean), fin le 10/12/2026.')).toBe(true);
    expect(adhoc.texte).toContain('Merci,\n\nMail envoyé par Lucie FICTIVE');
    expect(adhoc.texte).toContain(`---------- Copie du mail envoyé aux locataires ----------\nDe : gestion@criterimmo.fr\nÀ : alice@exemple.test\nObjet : ${l[0].objet}\n\n${l[0].texte}`);
    expect(adhoc.edition?.suite.map((s) => s.libelle)).toEqual(['Mention de l’expéditeur', 'Signature Gmail', 'Copie de l’accusé (protégée)']);
  });
});

describe('🔴 le mail de départ et le mail aux partenaires de la sortie', () => {
  const base = { adresse: '4 rue Fictive', locataires: D.locataires, dateSortie: '2026-11-04', copropriete: null, expediteur: 'gestion@criterimmo.fr', valideur: D.valideur, signature: D.signature };
  it('départ : chacun son nom, le dépôt de garantie et le RIB protégés', () => {
    const l = mailsSortieLocataires({ ...base, retouches: { sortie_locataires: { appel: `Bonjour {${REPERE_NOM}} !`, conclusion: 'Au plaisir.' } } });
    expect(l[0].texte.startsWith('Bonjour Alice BERNARD !\n\nNous vous confirmons votre départ du logement situé 4 rue Fictive, effectif le 04/11/2026')).toBe(true);
    expect(l[1].texte.startsWith('Bonjour Paul MARTIN !')).toBe(true);
    expect(l[0].texte).toContain('Le dépôt de garantie vous sera restitué dans un délai maximal d’un mois');
    expect(l[0].texte).toContain('Au plaisir.\n\nNous vous remercions pour la confiance');
    expect(l[0].texteOrigine?.startsWith('Bonjour Alice BERNARD,')).toBe(true);
  });
  it('partenaires de la sortie : sans politesse par défaut, une politesse ajoutée part', () => {
    const S = { adresse: '4 rue Fictive', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: [], proprietaire: 'DUPONT Jean',
      sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: true, restants: [],
      auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z',
      enGestion: true, expediteur: 'gestion@criterimmo.fr', signature: { html: '', texte: '' }, partenaires: ['gestion.criterimmo@gmail.com'] };
    const sans = mailAdhocSortie(S)!;
    const avec = mailAdhocSortie({ ...S, retouches: { sortie_adhoc: { politesse: 'Bonne journée,' } } })!;
    expect(avec.texte).toBe(sans.texte.replace('aucune action n’est attendue de votre part.', 'aucune action n’est attendue de votre part.\n\nBonne journée,'));
  });
});
