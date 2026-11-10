import { describe, it, expect } from 'vitest';
import {
  adressesUniques, copiesAvis, dateFinBail, enumerer, mailAccuseConge as accuseDe, mailAdhocPreavis, mailAdhocSortie, mailsDuPreavis,
  objetAdhocSortie, prenomNom, type DonneesPreavisMails, mailSortieLocataire, mailsSortieLocataires, paragrapheCopropriete, PROVISION_NON_RENSEIGNE,
  type LocataireAvis, type MailAvis,
} from './mailsPreavisSortie';

/** 🔴 Arno (10/11/2026, confidentialité) — l'accusé d'UN locataire (le premier, par défaut) ; le départ de même. */
const mailAccuseConge = (d: DonneesPreavisMails, i = 0): MailAvis | null => accuseDe(d, d.locataires[i]);
const mailSortieLocataires = (d: Parameters<typeof mailsSortieLocataires>[0], i = 0): MailAvis | null => mailSortieLocataire(d, d.locataires[i] as LocataireAvis);

/**
 * ══ LOCATION — LES MAILS AUTOMATIQUES DU PRÉAVIS ET DE LA SORTIE (Arno, 05/11/2026). MODULE PUR. ══════════════════════════
 * Dates de fin, destinataires et copies, texte d'Arno, bien hors gestion, locataire sans e-mail.
 */

const D: DonneesPreavisMails = {
  adresse: '4 rue Fictive, 92800 Puteaux', proprietaire: 'DUPONT Jean', enGestion: true,
  locataires: [
    { occupationId: 11, nom: 'BERNARD Alice', prenom: null, emails: ['alice@exemple.test'] },
    { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: ['paul@exemple.test', 'PAUL@exemple.test', 'pas-une-adresse'] },
  ],
  recuLe: '2026-11-10', choix: { mode: 'mois', duree: 1 }, expediteur: 'gestion@criterimmo.fr',
  valideur: { nom: 'Lucie Fictive', email: 'lucie.fictive@exemple.test', prenom: 'Lucie', nomFamille: 'Fictive' }, signature: { html: '', texte: '' },
  // 🔴 Arno (05/11/2026, 460) — les partenaires viennent de la liste « Préavis » (ici, l'amorce : ADHOC).
  partenaires: ['gestion.criterimmo@gmail.com'],
};

describe('la date de fin du bail : réception + durée, jour pour jour', () => {
  it('10/11 + 1 mois → 10/12 ; + 3 mois → 10/02', () => {
    expect(dateFinBail('2026-11-10', { mode: 'mois', duree: 1 })).toBe('2026-12-10');
    expect(dateFinBail('2026-11-10', { mode: 'mois', duree: 3 })).toBe('2027-02-10');
  });

  it('31/01 + 1 mois → le dernier jour de février (28, ou 29 une année bissextile)', () => {
    expect(dateFinBail('2027-01-31', { mode: 'mois', duree: 1 })).toBe('2027-02-28');
    expect(dateFinBail('2028-01-31', { mode: 'mois', duree: 1 })).toBe('2028-02-29');
  });

  it('3 mois : 30/11 → 28/02 ; 31/03 → 30/06 ; à cheval sur l’année', () => {
    expect(dateFinBail('2026-11-30', { mode: 'mois', duree: 3 })).toBe('2027-02-28');
    expect(dateFinBail('2027-03-31', { mode: 'mois', duree: 3 })).toBe('2027-06-30');
    expect(dateFinBail('2026-12-15', { mode: 'mois', duree: 1 })).toBe('2027-01-15');
  });

  it('la date maximale saisie à la main est gardée telle quelle', () => {
    expect(dateFinBail('2026-11-10', { mode: 'date_manuelle', dateMax: '2027-01-05' })).toBe('2027-01-05');
  });
});

describe('les noms et les adresses', () => {
  it('« Prénom Nom » : prénom saisi, ou nom WIPPIMMO « NOM Prénom » remis dans l’ordre', () => {
    expect(prenomNom({ nom: 'MARTIN', prenom: 'Paul' })).toBe('Paul MARTIN');
    expect(prenomNom({ nom: 'BERNARD Alice', prenom: null })).toBe('Alice BERNARD');
    expect(prenomNom({ nom: 'DE LA TOUR Marie-Anne', prenom: null })).toBe('Marie-Anne DE LA TOUR');
    expect(prenomNom({ nom: 'SCI LES TILLEULS', prenom: null })).toBe('SCI LES TILLEULS');
    expect(prenomNom({ nom: 'Dupont', prenom: '' })).toBe('Dupont');
  });

  it('énumération française', () => {
    expect(enumerer(['A'])).toBe('A');
    expect(enumerer(['A', 'B'])).toBe('A et B');
    expect(enumerer(['A', 'B', 'C'])).toBe('A, B et C');
  });

  it('adresses : valides, sans doublon (casse ignorée), hors exclusions', () => {
    expect(adressesUniques(['a@x.fr', 'A@X.fr', 'nope', null, 'b@x.fr'], ['b@x.fr'])).toEqual(['a@x.fr']);
    expect(copiesAvis('gestion@criterimmo.fr', { email: 'gestion@criterimmo.fr' }, ['l@x.fr'])).toEqual(['gestion@criterimmo.fr']);
    expect(copiesAvis('gestion@criterimmo.fr', { email: null }, ['l@x.fr'])).toEqual(['gestion@criterimmo.fr']);
  });
});

describe('A) l’accusé de réception du congé, aux locataires', () => {
  it('🔴 UN mail PAR locataire (seul destinataire, son nom, aucune copie visible), puis la copie interne à gestion@ + la personne qui valide', () => {
    const l = mailsDuPreavis({ ...D, partenaires: [] }).mails;
    expect(l.map((m) => [m.a, m.cc])).toEqual([
      [['alice@exemple.test'], []], [['paul@exemple.test'], []], [['gestion@criterimmo.fr', 'lucie.fictive@exemple.test'], []]]);
    expect(l[0].de).toBe('gestion@criterimmo.fr');
    expect(l[0].objet).toBe('Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux');
    // Aucune adresse ni aucun nom d'un autre client dans le mail d'un locataire.
    expect(`${l[0].texte} ${l[0].html}`).not.toMatch(/paul|MARTIN/i);
    expect(`${l[1].texte} ${l[1].html}`).not.toMatch(/alice|BERNARD/i);
    expect(l[1].texte.startsWith('Bonjour Paul MARTIN,')).toBe(true);
    for (const m of l.slice(0, 2)) expect(m.texte).toContain('Mail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)');
    // La copie interne : à qui chaque mail est parti, puis le texte du premier.
    expect(l[2].objet).toBe('[Copie interne] Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux');
    expect(l[2].texte).toContain('· Alice BERNARD — alice@exemple.test\n· Paul MARTIN — paul@exemple.test');
    expect(l[2].texte.endsWith(l[0].texte)).toBe(true);
  });

  it('le texte d’Arno, tel quel, avec les champs remplis (1 mois)', () => {
    const t = mailAccuseConge(D)!.texte;
    expect(t.startsWith('Bonjour Alice BERNARD,\n\nNous accusons réception de votre congé pour le logement situé 4 rue Fictive, 92800 Puteaux, reçu le 10/11/2026.\n\n'
      + 'Votre préavis étant de 1 mois, votre bail prendra fin le 10/12/2026. Nous vous rappelons que le loyer et les charges restent dus jusqu’à la fin du préavis, y compris si vous quittez le logement avant cette date.')).toBe(true);
    expect(t).toContain('Notre équipe vous propose d’organiser dans les 10 jours une visite de pré-état des lieux de sortie.');
    expect(t).toContain('(article 22 de la loi n° 89-462 du 6 juillet 1989)');
    expect(t.endsWith('Nous restons à votre disposition pour toute question.\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)')).toBe(true);
  });

  it('3 mois : la durée et la date de fin suivent', () => {
    expect(mailAccuseConge({ ...D, choix: { mode: 'mois', duree: 3 } })!.texte).toContain('Votre préavis étant de 3 mois, votre bail prendra fin le 10/02/2027.');
  });

  it('la signature Gmail suit le texte (texte ET HTML)', () => {
    const m = mailAccuseConge({ ...D, signature: { html: '<b>Service Gestion</b>', texte: 'Service Gestion' } })!;
    expect(m.texte.endsWith('Nous restons à votre disposition pour toute question.\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n-- \nService Gestion')).toBe(true);
    expect(m.html).toContain('<div class="gmail_signature" style="margin-top:16px"><b>Service Gestion</b></div>');
  });

  it('un colocataire DÉCOCHÉ (rupture de couple) : seul celui qui part est nommé et destinataire', () => {
    const m = mailAccuseConge({ ...D, locataires: [D.locataires[0]] })!;
    expect(m.a).toEqual(['alice@exemple.test']);
    expect(m.texte.startsWith('Bonjour Alice BERNARD,')).toBe(true);
    expect(m.texte).not.toContain('MARTIN');
  });

  it('le HTML échappe ce qui vient de la base', () => {
    expect(mailAccuseConge({ ...D, adresse: '1 rue <b>X</b>' })!.html).toContain('1 rue &lt;b&gt;X&lt;/b&gt;');
  });
});

describe('le locataire sans e-mail : signalé, jamais bloquant', () => {
  it('un sans e-mail : il est listé ; le mail part aux autres (chacun le sien, à son nom seul)', () => {
    const r = mailsDuPreavis({ ...D, locataires: [D.locataires[0], { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: [] }] });
    expect(r.sansEmail).toEqual(['Paul MARTIN']);
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_locataires', 'preavis_adhoc']);
    expect(r.mails[0].a).toEqual(['alice@exemple.test']);
    expect(r.mails[0].texte.startsWith('Bonjour Alice BERNARD,')).toBe(true);
    expect(r.mails[1].objet.startsWith('[Copie interne]')).toBe(true);
  });

  it('AUCUN n’a d’e-mail : pas d’accusé ; ADHOC est informé, et le mail le dit à la place de la copie', () => {
    const r = mailsDuPreavis({ ...D, locataires: D.locataires.map((l) => ({ ...l, emails: [] })) });
    expect(r.sansEmail).toEqual(['Alice BERNARD', 'Paul MARTIN']);
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_adhoc']);
    expect(r.mails[0].texte).toContain('Aucun des locataires n’a d’adresse e-mail connue : l’accusé de réception ne leur a pas été envoyé par mail.');
    expect(r.mails[0].texte).not.toContain('Copie du mail');
    expect(r.mails[0].texte).not.toContain('Vous trouverez ci-dessous');
    expect(r.mails[0].texte).not.toContain('purement informatif');
  });
});

describe('B) l’information à ADHOC, pour le préavis', () => {
  it('À = ADHOC ; Cc = gestion@ + la personne qui valide ; objet ; texte ; puis la copie complète du PREMIER mail A (« envoyé à chacun des N locataires »)', () => {
    const a = mailAccuseConge(D)!;
    const b = mailAdhocPreavis(D, a, 2)!;
    expect(b.a).toEqual(['gestion.criterimmo@gmail.com']);
    expect(b.cc).toEqual(['gestion@criterimmo.fr', 'lucie.fictive@exemple.test']);
    expect(b.objet).toBe('[Information] Préavis reçu — 4 rue Fictive, 92800 Puteaux — Alice BERNARD et Paul MARTIN');
    // 🔴 Arno (05/11/2026) — l'introduction EXACTE ; 🔴 (10/11/2026) deux locataires : un accusé chacun, la copie du premier.
    expect(b.texte.startsWith('Bonjour,\n\nNous vous informons que nous avons reçu, le 10/11/2026, le congé de Alice BERNARD et Paul MARTIN pour le logement situé '
      + '4 rue Fictive, 92800 Puteaux (propriétaire : DUPONT Jean). Le bail prendra théoriquement fin le 10/12/2026.\n\n'
      + 'Vous trouverez ci-dessous, pour votre suivi, la copie de l’accusé de réception que nous avons adressé — envoyé à chacun des 2 locataires, séparément et à son nom (ci-dessous, celui du premier).\n\n'
      + 'Bonne journée,\nL’équipe Sans Vis-à-Vis\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n---------- Copie du mail envoyé aux locataires ----------')).toBe(true);
    expect(b.texte).toContain('prendra théoriquement fin');
    expect(b.texte).not.toContain('purement informatif');
    expect(b.texte).not.toContain('aucune action n’est attendue');
    expect(b.html).not.toContain('purement informatif');
    expect(b.html).toContain('Le bail prendra théoriquement fin le 10/12/2026.');
    expect(b.texte).toContain(`À : alice@exemple.test\nObjet : ${a.objet}\n\n${a.texte}`);
    expect(b.texte).not.toContain('paul@exemple.test');
    expect(b.html).toContain(a.html);
  });

  it('notre signature AVANT la copie (comme un transfert), une seule fois pour nous', () => {
    const d = { ...D, signature: { html: '<b>Service Gestion</b>', texte: 'Service Gestion' } };
    const b = mailAdhocPreavis(d, mailAccuseConge(d), 2)!;
    // 🔴 Arno (05/11/2026) — signature Gmail présente : « Bonne journée, » seul (plus « L’équipe Sans Vis-à-Vis »), la mention, puis la signature.
    expect(b.texte).toContain('(ci-dessous, celui du premier).\n\nBonne journée,\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n-- \nService Gestion\n\n---------- Copie du mail envoyé aux locataires ----------');
    expect(b.texte).not.toContain('L’équipe Sans Vis-à-Vis');
    expect(b.html).not.toContain('L’équipe Sans Vis-à-Vis');
    expect(b.html.indexOf('Mail envoyé par Lucie FICTIVE')).toBeLessThan(b.html.indexOf('gmail_signature'));
    expect(b.texte.endsWith('Nous restons à votre disposition pour toute question.\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n-- \nService Gestion')).toBe(true);
    expect(b.texte.split('-- \nService Gestion')).toHaveLength(3);
  });

  it('un seul locataire : la copie de son accusé ; plusieurs : « envoyé à chacun des N locataires » (mailsDuPreavis)', () => {
    const d = { ...D, locataires: [D.locataires[0]] };
    const t = mailAdhocPreavis(d, mailAccuseConge(d))!.texte;
    expect(t).toContain('le congé de Alice BERNARD pour le logement situé');
    expect(t).toContain('la copie de l’accusé de réception que nous avons adressé.');
    expect(t).not.toContain('chacun des');
    expect(t).toContain('Bonjour Alice BERNARD,');   // la copie de l'accusé suit toujours
    const r = mailsDuPreavis(D).mails;
    expect(r.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_locataires', 'preavis_locataires', 'preavis_adhoc']);
    expect(r[3].texte).toContain('envoyé à chacun des 2 locataires, séparément et à son nom');
    expect(r[3].texte).toContain('À : alice@exemple.test\nObjet');
  });

  it('🔴 bien HORS gestion : AUCUN mail ADHOC ; l’accusé aux locataires part quand même', () => {
    const r = mailsDuPreavis({ ...D, enGestion: false });
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_locataires', 'preavis_locataires']);
    expect(mailAdhocPreavis({ ...D, enGestion: false }, null)).toBeNull();
  });
});

describe('🔴 Arno (05/11/2026) — « Mail envoyé par … » et la formule de fin', () => {
  it('signature Gmail ABSENTE : « Bonne journée, / L’équipe Sans Vis-à-Vis », puis la mention', () => {
    const b = mailAdhocPreavis(D, mailAccuseConge(D))!;
    expect(b.texte).toContain('Bonne journée,\nL’équipe Sans Vis-à-Vis\n\nMail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)');
    expect(b.html).toContain('Mail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)');
  });
  it('signature Gmail en HTML seul : elle compte aussi (« Bonne journée, » seul)', () => {
    const d = { ...D, signature: { html: '<b>Gestion</b>', texte: '' } };
    expect(mailAdhocPreavis(d, mailAccuseConge(d))!.texte).not.toContain('L’équipe Sans Vis-à-Vis');
  });
  it('compte SANS nom ni prénom : « Mail envoyé par adresse » (accusé, partenaires, sortie)', () => {
    const d = { ...D, valideur: { nom: 'lucie.fictive@exemple.test', email: 'lucie.fictive@exemple.test', prenom: null, nomFamille: null } };
    const a = mailAccuseConge(d)!;
    expect(a.texte.endsWith('\n\nMail envoyé par lucie.fictive@exemple.test')).toBe(true);
    expect(mailAdhocPreavis(d, a)!.texte).toContain('L’équipe Sans Vis-à-Vis\n\nMail envoyé par lucie.fictive@exemple.test\n\n---------- Copie');
  });
  it('seul le prénom, ou seul le nom : ce qui existe', () => {
    const d1 = { ...D, valideur: { ...D.valideur, nomFamille: '' } };
    expect(mailAccuseConge(d1)!.texte).toContain('Mail envoyé par Lucie (lucie.fictive@exemple.test)');
    const d2 = { ...D, valideur: { ...D.valideur, prenom: null } };
    expect(mailAccuseConge(d2)!.texte).toContain('Mail envoyé par FICTIVE (lucie.fictive@exemple.test)');
  });
  it('les destinataires, objets et textes juridiques ne changent pas', () => {
    const a = mailAccuseConge(D)!;
    expect(a.a).toEqual(['alice@exemple.test']);
    expect(mailAccuseConge(D, 1)!.a).toEqual(['paul@exemple.test']);
    expect(a.objet).toBe('Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux');
    expect(a.texte).toContain('(article 22 de la loi n° 89-462 du 6 juillet 1989)');
  });
});

describe('l’information à ADHOC, pour la sortie', () => {
  const S = {
    adresse: '4 rue Fictive, 92800 Puteaux', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: ['Cave n° 7'], proprietaire: 'DUPONT Jean',
    sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: false, restants: ['MARTIN Paul'],
    auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z',
    enGestion: true, expediteur: 'gestion@criterimmo.fr', signature: { html: '', texte: '' }, partenaires: ['gestion.criterimmo@gmail.com'] as string[],
  };

  it('À = ADHOC ; Cc = gestion@ + la personne qui valide ; logement, adresse, propriétaire, sortants avec leurs dates, reste loué à', () => {
    const m = mailAdhocSortie(S)!;
    expect(m.sorte).toBe('sortie_adhoc');
    expect(m.a).toEqual(['gestion.criterimmo@gmail.com']);
    expect(m.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
    expect(m.objet).toBe(objetAdhocSortie('4 rue Fictive, 92800 Puteaux'));
    expect(m.objet).toBe('[Information] Sortie de locataire(s) — 4 rue Fictive, 92800 Puteaux');
    expect(m.texte).toContain('Logement : Appartement · 3e étage · porte G — avec Cave n° 7\nAdresse : 4 rue Fictive, 92800 Puteaux\nPropriétaire : DUPONT Jean');
    expect(m.texte).toContain('Locataire sorti :\n- Alice BERNARD — entré(e) le 01/09/2022, sorti(e) le 04/11/2026');
    expect(m.texte).toContain('Le logement reste loué à Paul MARTIN.');
  });

  it('🔴 Arno (05/11/2026) — « Mail envoyé par … » après la formule, avant la signature Gmail ; compte sans nom : l’adresse seule', () => {
    expect(mailAdhocSortie(S)!.texte.endsWith('aucune action n’est attendue de votre part.\n\nMail envoyé par a.jorel@sansvisavis.com')).toBe(true);
    const m = mailAdhocSortie({ ...S, auteur: { ...S.auteur, prenom: 'Arno', nomFamille: 'Jorel' }, signature: { html: '<b>G</b>', texte: 'G' } })!;
    expect(m.texte.endsWith('Mail envoyé par Arno JOREL (a.jorel@sansvisavis.com)\n\n-- \nG')).toBe(true);
    expect(m.html.indexOf('Mail envoyé par Arno JOREL')).toBeLessThan(m.html.indexOf('gmail_signature'));
  });

  it('tous sortis : « logement vacant » ; plusieurs sortants : pluriel', () => {
    const m = mailAdhocSortie({ ...S, vacant: true, restants: [],
      sortants: [...S.sortants, { nom: 'MARTIN Paul', entree: null, sortie: '2026-11-04' }] })!;
    expect(m.texte).toContain('Le logement est désormais vacant.');
    expect(m.texte).toContain('Locataires sortis :\n- Alice BERNARD');
    expect(m.texte).toContain('- Paul MARTIN — date d’entrée non renseignée, sorti(e) le 04/11/2026');
  });

  it('🔴 bien HORS gestion : aucun mail', () => {
    expect(mailAdhocSortie({ ...S, enGestion: false })).toBeNull();
  });
});

describe('🔴 Arno (05/11/2026, 460) — les partenaires viennent de la LISTE configurée (plus aucune adresse dans le code)', () => {
  it('préavis : À = toute la liste, DANS L’ORDRE (doublon ignoré) ; Cc = gestion@ + la personne qui valide', () => {
    const b = mailAdhocPreavis({ ...D, partenaires: ['monga@x.fr', 'gestion.criterimmo@gmail.com', 'MONGA@x.fr'] }, mailAccuseConge(D))!;
    expect(b.a).toEqual(['monga@x.fr', 'gestion.criterimmo@gmail.com']);
    expect(b.cc).toEqual(['gestion@criterimmo.fr', 'lucie.fictive@exemple.test']);
  });
  it('liste VIDE (ou case décochée) : aucun mail partenaire ; l’accusé aux locataires part toujours', () => {
    const r = mailsDuPreavis({ ...D, partenaires: [] });
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_locataires', 'preavis_locataires']);
  });
  it('sortie : À = la liste « Sorties » dans l’ordre ; vide : aucun mail', () => {
    const S = { adresse: '4 rue Fictive', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: [], proprietaire: 'DUPONT Jean',
      sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: true, restants: [],
      auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z', enGestion: true, expediteur: 'gestion@criterimmo.fr',
      signature: { html: '', texte: '' } };
    expect(mailAdhocSortie({ ...S, partenaires: ['b@x.fr', 'a@x.fr'] })!.a).toEqual(['b@x.fr', 'a@x.fr']);
    expect(mailAdhocSortie({ ...S, partenaires: [] })).toBeNull();
  });
});

describe('🔴 Arno (06/11/2026, 461) — le paragraphe de 20 % selon la copropriété SAISIE (accusé de préavis et mail de départ)', () => {
  const OUI_PREAVIS = 'Enfin, le logement étant situé dans un immeuble en copropriété, nous pourrons conserver, même si l’état des lieux de sortie est conforme, une provision de 20 % au plus du dépôt de garantie jusqu’à l’approbation des comptes annuels de l’immeuble par l’assemblée générale des copropriétaires (article 22 de la loi n° 89-462 du 6 juillet 1989). Cette provision sert à régulariser les charges réelles de l’année : le solde vous sera restitué, déduction faite des sommes éventuellement dues, dans le mois qui suit l’approbation des comptes.';
  const NR = 'Si le logement est situé dans un immeuble en copropriété, une provision de 20 % au plus du dépôt de garantie pourra être conservée, même si l’état des lieux de sortie est conforme, jusqu’à l’approbation des comptes annuels de l’immeuble par l’assemblée générale des copropriétaires (article 22 de la loi n° 89-462 du 6 juillet 1989). Le solde vous sera alors restitué, déduction faite des sommes éventuellement dues, dans le mois qui suit cette approbation.';
  it('les trois textes exacts', () => {
    expect(paragrapheCopropriete(true, 'preavis')).toEqual([OUI_PREAVIS]);
    expect(paragrapheCopropriete(true, 'sortie')).toEqual([OUI_PREAVIS.replace('Enfin, le logement', 'Le logement')]);
    expect(paragrapheCopropriete(false, 'preavis')).toEqual([]);
    expect(paragrapheCopropriete(false, 'sortie')).toEqual([]);
    expect(paragrapheCopropriete(null, 'preavis')).toEqual([NR]);
    expect(paragrapheCopropriete(null, 'sortie')).toEqual([NR]);
    expect(PROVISION_NON_RENSEIGNE).toBe(NR);
  });
  it('l’accusé de préavis : Oui → le paragraphe « Enfin, … » ; Non → aucun ; non renseigné → le conditionnel ; plus jamais « immeuble collectif »', () => {
    expect(mailAccuseConge({ ...D, copropriete: true })!.texte).toContain(OUI_PREAVIS);
    expect(mailAccuseConge({ ...D, copropriete: false })!.texte).not.toContain('20 %');
    expect(mailAccuseConge({ ...D, copropriete: null })!.texte).toContain(NR);
    for (const c of [true, false, null]) expect(mailAccuseConge({ ...D, copropriete: c })!.texte).not.toContain('immeuble collectif');
  });
});

describe('🔴 Arno (06/11/2026) — le mail de DÉPART aux locataires (texte exact)', () => {
  const base = { adresse: '4 rue Fictive, 92800 Puteaux', locataires: D.locataires, dateSortie: '2026-11-04', expediteur: 'gestion@criterimmo.fr', valideur: D.valideur, signature: { html: '', texte: '' } };
  it('🔴 un mail PAR sortant (seul destinataire, aucune copie, aucune adresse d’un autre client), puis la copie interne ; le texte d’Arno, la mention puis la signature', () => {
    const l = mailsSortieLocataires({ ...base, copropriete: false });
    expect(l.map((x) => [x.a, x.cc])).toEqual([[['alice@exemple.test'], []], [['paul@exemple.test'], []], [['gestion@criterimmo.fr', 'lucie.fictive@exemple.test'], []]]);
    expect(`${l[0].texte} ${l[0].html}`).not.toMatch(/paul|MARTIN/i);
    expect(`${l[1].texte} ${l[1].html}`).not.toMatch(/alice|BERNARD/i);
    expect(l[2].objet).toBe('[Copie interne] Votre départ du logement — 4 rue Fictive, 92800 Puteaux');
    const m = mailSortieLocataires({ ...base, copropriete: false })!;
    expect(m.sorte).toBe('sortie_locataires');
    expect(m.objet).toBe('Votre départ du logement — 4 rue Fictive, 92800 Puteaux');
    expect(m.texte).toBe([
      'Bonjour Alice BERNARD,',
      'Nous vous confirmons votre départ du logement situé 4 rue Fictive, 92800 Puteaux, effectif le 04/11/2026, date de la remise des clés.',
      'Le dépôt de garantie vous sera restitué dans un délai maximal d’un mois à compter de la remise des clés si l’état des lieux de sortie est conforme à l’état des lieux d’entrée, et de deux mois dans le cas contraire, déduction faite des sommes restant dues et justifiées (article 22 de la loi n° 89-462 du 6 juillet 1989).',
      'Afin de procéder à la restitution, merci de nous communiquer par retour de mail votre nouvelle adresse postale ainsi qu’un RIB, si ce n’est pas déjà fait.',
      'Nous vous remercions pour la confiance que vous nous avez accordée et vous souhaitons une bonne installation.',
      'Mail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)',
    ].join('\n\n'));
  });
  it('Oui : « Le logement étant situé… » (sans « Enfin, ») entre la restitution et le RIB ; non renseigné : le conditionnel', () => {
    const oui = mailSortieLocataires({ ...base, copropriete: true })!.texte.split('\n\n');
    expect(oui[3].startsWith('Le logement étant situé dans un immeuble en copropriété')).toBe(true);
    expect(oui[4].startsWith('Afin de procéder à la restitution')).toBe(true);
    expect(mailSortieLocataires({ ...base, copropriete: null })!.texte.split('\n\n')[3].startsWith('Si le logement est situé')).toBe(true);
  });
  it('signature Gmail après la mention ; aucun locataire avec une adresse : aucun mail', () => {
    const m = mailSortieLocataires({ ...base, copropriete: null, signature: { html: '<b>G</b>', texte: 'G' } })!;
    expect(m.texte.endsWith('Mail envoyé par Lucie FICTIVE (lucie.fictive@exemple.test)\n\n-- \nG')).toBe(true);
    expect(mailsSortieLocataires({ ...base, copropriete: null, locataires: D.locataires.map((l) => ({ ...l, emails: [] })) })).toEqual([]);
  });
});

describe('🔴 Arno (06/11/2026) — le mail aux partenaires de la SORTIE porte la copie du mail de départ', () => {
  const S2 = {
    adresse: '4 rue Fictive, 92800 Puteaux', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: [], proprietaire: 'DUPONT Jean',
    sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: true, restants: [],
    auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z',
    enGestion: true, expediteur: 'gestion@criterimmo.fr', signature: { html: '<b>G</b>', texte: 'G' }, partenaires: ['gestion.criterimmo@gmail.com'] as string[],
  };
  const depart = mailSortieLocataires({ adresse: S2.adresse, locataires: [D.locataires[0]], dateSortie: '2026-11-04', copropriete: null, expediteur: S2.expediteur,
    valideur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, signature: S2.signature })!;
  it('avec le départ : signature, PUIS « Copie du mail envoyé aux locataires » (De / À / Cc / Objet) et le texte complet — texte et HTML', () => {
    const m = mailAdhocSortie({ ...S2, depart })!;
    expect(m.texte).toContain(`-- \nG\n\n---------- Copie du mail envoyé aux locataires ----------\nDe : gestion@criterimmo.fr\nÀ : alice@exemple.test\nObjet : ${depart.objet}\n\n${depart.texte}`);
    expect(m.texte).not.toContain('chacun des');
    // Deux départs : la copie du premier, et le nombre.
    expect(mailAdhocSortie({ ...S2, depart, nDeparts: 2 })!.texte).toContain('Le mail de départ a été envoyé à chacun des 2 locataires, séparément et à son nom : ci-dessous, la copie de celui du premier.');
    expect(m.texte.endsWith(depart.texte)).toBe(true);
    expect(m.html).toContain(depart.html);
    expect(m.texte).not.toContain('le mail de départ ne leur a pas été envoyé');
  });
  it('sans départ (null) : la ligne le dit, aucune copie ; non fourni : le mail d’avant, inchangé', () => {
    const sans = mailAdhocSortie({ ...S2, depart: null })!;
    expect(sans.texte).toContain('Aucun des locataires n’a d’adresse e-mail connue : le mail de départ ne leur a pas été envoyé par mail.');
    expect(sans.texte).not.toContain('Copie du mail');
    const avant = mailAdhocSortie(S2)!;
    expect(avant.texte).not.toContain('Copie du mail');
    expect(avant.texte).not.toContain('le mail de départ');
  });
});
