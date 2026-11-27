import { describe, expect, it } from 'vitest';
import { appellation, differenceRestitution, mailAdresseLibre, MOTIF_ADRESSE_LIBRE_DOUBLON, MOTIF_ADRESSE_LIBRE_FORMAT, MOTIF_ADRESSE_LIBRE_VIDE, verifierAdresseLibre, mailRestitutionLocataire, mailRestitutionPartenaire, nouvelleAdresse, rubriquesPartenaire, verifierDifference, type DonneesRestitution } from './mailRestitutionVingt';

/** 🔴🔴 Arno (25/11/2026, 22h06) — les deux modèles de la restitution des 20 % : remplis avec les vraies données, ligne absente si la donnée manque, sans répétition. */
const SARAH = { civilite: 'Mme', nom: 'BENOÎT Sarah', nomFamille: 'BENOÎT', telephone: '06 12 34 56 78', email: 'a.jorel+locataire-benoit@sansvisavis.com', adresse: '8 rue des Lilas, 92150 Suresnes' };
const D: DonneesRestitution = {
  logement: '63 rue de la Convention, 75015 Paris', numLots: ['58', '112'], batiment: 'D', etage: '6', coproNom: 'Résidence Convention', syndic: 'Agence Rivière Copropriétés',
  dateSortie: '2026-02-15', locataires: [SARAH],
  proprietaires: [{ civilite: 'M.', nom: 'Didier PERRIN', nomFamille: 'PERRIN', telephone: '01 47 00 00 01', email: 'a.jorel+proprio-perrin@sansvisavis.com', adresse: '4 avenue Foch, 75116 Paris' }],
  arrete: { jour: 30, mois: 9 }, derniereAgo: '2025-12-10', montantVingt: 400, montantRestitue: 370, motif: 'régularisation de charges', dateValidation: '2026-11-25',
};

describe('mail au LOCATAIRE', () => {
  it('partiel (400 € retenus, 370 € restitués, motif) : le texte d’Arno, rempli', () => {
    const m = mailRestitutionLocataire(D, SARAH);
    expect(m.objet).toBe('Restitution du solde de votre dépôt de garantie — 63 rue de la Convention, 75015 Paris');
    expect(m.texte).toBe([
      'Bonjour Madame BENOÎT,',
      'Nous revenons vers vous à la suite de votre départ, le 15/02/2026, du logement situé 63 rue de la Convention, 75015 Paris, lots n° 58 et 112, bâtiment D, 6e étage.',
      'Lors de votre sortie, 20 % de votre dépôt de garantie, soit 400,00 €, avaient été conservés dans l’attente de l’approbation des comptes de la copropriété, comme le prévoit l’article 22 de la loi n° 89-462 du 6 juillet 1989.',
      'Les comptes ayant été approuvés, nous vous confirmons que la restitution d’un montant de 370,00 € a été validée. La somme de 30,00 € a été conservée pour le motif suivant : régularisation de charges.',
      'La demande de virement a été transmise à notre service comptabilité ; le montant vous sera versé dans les meilleurs délais.',
      'Nous restons à votre disposition pour toute question.',
      'Nous vous prions d’agréer, Madame, l’expression de nos salutations distinguées.',
    ].join('\n\n'));
  });
  it('total : « nous avons le plaisir de vous confirmer » ; civilité inconnue : « Madame, Monsieur » ; lot non renseigné : la ligne s’arrête à l’adresse', () => {
    const t = mailRestitutionLocataire({ ...D, montantRestitue: 400, motif: null, numLots: [], batiment: null, etage: null }, { ...SARAH, civilite: null }).texte;
    expect(t).toContain('Les comptes ayant été approuvés, nous avons le plaisir de vous confirmer que la restitution de ce solde, soit 400,00 €, a été validée.');
    expect(t).not.toContain('conservée pour le motif');
    expect(t.startsWith('Bonjour Madame, Monsieur,')).toBe(true);
    expect(t).toContain('du logement situé 63 rue de la Convention, 75015 Paris.');
    expect(t).toContain('Nous vous prions d’agréer, Madame, Monsieur, l’expression');
    expect(t.match(/63 rue de la Convention/g)).toHaveLength(1);                  // aucune répétition dans le corps
  });
});

describe('mail au PARTENAIRE', () => {
  it('partiel : objet, rubriques dans l’ordre, chaque donnée une seule fois ; titres en capitales (texte) et en gras (HTML)', () => {
    const m = mailRestitutionPartenaire(D);
    expect(m.objet).toBe('Restitution du solde du dépôt de garantie — 63 rue de la Convention, 75015 Paris — BENOÎT');
    expect(rubriquesPartenaire(D)).toEqual([
      { titre: 'Le bien', lignes: ['Adresse : 63 rue de la Convention, 75015 Paris', 'Lots loués : n° 58 (lot principal), n° 112', 'Bâtiment : D', 'Étage : 6e étage',
        'Copropriété : Résidence Convention', 'Syndic : Agence Rivière Copropriétés'] },
      { titre: 'Le locataire sortant', lignes: ['Mme BENOÎT Sarah — téléphone 06 12 34 56 78 — e-mail a.jorel+locataire-benoit@sansvisavis.com — nouvelle adresse : 8 rue des Lilas, 92150 Suresnes',
        'Date de sortie : 15/02/2026'] },
      { titre: 'Le propriétaire', lignes: ['M. Didier PERRIN — téléphone 01 47 00 00 01 — e-mail a.jorel+proprio-perrin@sansvisavis.com — adresse : 4 avenue Foch, 75116 Paris'] },
      { titre: 'La copropriété (lot principal)', lignes: ['Date de clôture annuelle des comptes : 30 septembre', 'Dernière AGO officielle : 10/12/2025'] },
      { titre: 'La restitution', lignes: ['20 % retenus à la sortie : 400,00 €', 'Montant restitué : 370,00 €', 'Différence : 30,00 € — motif : régularisation de charges',
        'Date de validation : 25/11/2026', 'Demande de virement transmise à notre service comptabilité.'] },
    ]);
    expect(m.texte).toContain('LE BIEN\n- Adresse : 63 rue de la Convention, 75015 Paris');
    expect(m.texte.startsWith('Bonjour,\n\nNous vous informons que la restitution du solde du dépôt de garantie retenu à la sortie du locataire ci-dessous a été validée ce jour.')).toBe(true);
    expect(m.texte.endsWith('Nous restons à votre disposition pour tout complément.\n\nBien cordialement,')).toBe(true);
    expect(m.html).toContain('<p><strong>Le bien</strong></p><ul><li>Adresse : 63 rue de la Convention, 75015 Paris</li>');
    expect(m.texte.match(/63 rue de la Convention/g)).toHaveLength(1);
  });
  it('total : pas de différence ; données manquantes : lignes absentes ; AGO non confirmée ; deux locataires : au pluriel, chacun', () => {
    const r = rubriquesPartenaire({ ...D, montantRestitue: 400, motif: null, batiment: null, etage: null, coproNom: null, syndic: null, numLots: [], proprietaires: [], derniereAgo: null, arrete: null,
      locataires: [{ ...SARAH, adresse: '63 rue de la Convention, 75015 Paris', telephone: null }, { civilite: null, nom: 'MARTIN Paul', nomFamille: 'MARTIN', telephone: null, email: null, adresse: null }] });
    expect(r.map((x) => x.titre)).toEqual(['Le bien', 'Les locataires sortants', 'La copropriété (lot principal)', 'La restitution']);
    expect(r[0].lignes).toEqual(['Adresse : 63 rue de la Convention, 75015 Paris']);
    expect(r[1].lignes).toEqual(['Mme BENOÎT Sarah — e-mail a.jorel+locataire-benoit@sansvisavis.com', 'MARTIN Paul', 'Date de sortie : 15/02/2026']);
    expect(r[2].lignes).toEqual(['Dernière AGO officielle : date de l’AGO non confirmée']);
    expect(r[3].lignes.some((l) => l.startsWith('Différence'))).toBe(false);
    expect(mailRestitutionPartenaire({ ...D, locataires: [SARAH, { ...SARAH, nom: 'MARTIN Paul', nomFamille: 'MARTIN' }] }).objet).toBe('Restitution du solde du dépôt de garantie — 63 rue de la Convention, 75015 Paris — BENOÎT et MARTIN');
  });
});

describe('les règles', () => {
  it('différence au centime ; restitué > 20 % : refus ; différence sans motif : refus ; motif gardé seulement s’il y a une différence', () => {
    expect(differenceRestitution(400, 370)).toBe(30);
    expect(differenceRestitution(246.91, 246.91)).toBe(0);
    expect(verifierDifference(400, 401, '')).toMatchObject({ ok: false, champ: 'montantRestitue' });
    expect(verifierDifference(400, 370, '  ')).toMatchObject({ ok: false, champ: 'motifDifference' });
    expect(verifierDifference(400, 370, 'régularisation de charges')).toEqual({ ok: true, motif: 'régularisation de charges' });
    expect(verifierDifference(400, 400, 'sans objet')).toEqual({ ok: true, motif: null });
  });
  it('appellation ; nouvelle adresse seulement si elle n’est pas le logement quitté', () => {
    expect([appellation('Mme'), appellation('M.'), appellation('Mlle'), appellation(null), appellation('SCI')]).toEqual(['Madame', 'Monsieur', 'Mademoiselle', null, null]);
    expect(nouvelleAdresse({ adresse: '63 rue de la Convention' }, '63 rue de la Convention, 75015 Paris')).toBeNull();
    expect(nouvelleAdresse({ adresse: '8 rue des Lilas, 92150 Suresnes' }, '63 rue de la Convention, 75015 Paris')).toBe('8 rue des Lilas, 92150 Suresnes');
  });
});

describe('🔴🔴 Arno (27/11/2026, 22h17) — l’adresse libre de « Restitution faite »', () => {
  it('format vérifié : vide, sans @, sans domaine, avec espace, deux adresses collées → refusées ; une adresse ordinaire → gardée, sans espaces autour', () => {
    expect(verifierAdresseLibre('  ', [])).toEqual({ ok: false, motif: MOTIF_ADRESSE_LIBRE_VIDE });
    for (const x of ['pas-une-adresse', 'nom@', 'nom@domaine', 'nom @domaine.fr', 'a@b.fr, c@d.fr', 'a@b.fr;c@d.fr', '<a@b.fr>', 'nom@domaine.f']) {
      expect(verifierAdresseLibre(x, []), x).toEqual({ ok: false, motif: MOTIF_ADRESSE_LIBRE_FORMAT });
    }
    expect(verifierAdresseLibre('  Jean.Dupont+agence@cabinet-test.fr ', [])).toEqual({ ok: true, adresse: 'Jean.Dupont+agence@cabinet-test.fr' });
  });
  it('doublon refusé, sans tenir compte de la casse ni des espaces : avec un partenaire, un locataire ou une autre adresse ajoutée', () => {
    const connues = ['partenaire@exemple.test', 'Locataire@Exemple.test', null];
    expect(verifierAdresseLibre('PARTENAIRE@exemple.test', connues)).toEqual({ ok: false, motif: MOTIF_ADRESSE_LIBRE_DOUBLON });
    expect(verifierAdresseLibre(' locataire@exemple.test', connues)).toEqual({ ok: false, motif: MOTIF_ADRESSE_LIBRE_DOUBLON });
    expect(verifierAdresseLibre('autre@exemple.test', connues)).toEqual({ ok: true, adresse: 'autre@exemple.test' });
  });
  it('modèle « Partenaire » : le mail du partenaire, mot pour mot ; « Locataire » : celui du locataire, « Madame, Monsieur » (rien n’est deviné du nom saisi)', () => {
    expect(mailAdresseLibre(D, { adresse: 'cabinet@exemple.test', nom: 'Cabinet _TEST', modele: 'partenaire' })).toEqual(mailRestitutionPartenaire(D));
    const l = mailAdresseLibre(D, { adresse: 'x@exemple.test', nom: 'Jean DUPONT', modele: 'locataire' });
    expect(l.html).toBeNull();
    expect(l.texte.startsWith('Bonjour Madame, Monsieur,')).toBe(true);
    expect(l.objet).toBe(mailRestitutionLocataire(D, D.locataires[0]).objet);
  });
});
