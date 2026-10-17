import { describe, expect, it } from 'vitest';
import { mailTache, type ContenuMailTache } from './mailTache';
import { objetDemande } from './acceptationTache';
import { construireEvenement, titreEvenement } from './agendaTache';
import { lireContactsManuels, lireSaisie } from './taches';
import { bulleTacheFrise } from './tacheFrise';

/**
 * ══ 🔴 LOT GESTION-TACHES-SANS-BIEN (Arno, 17/10/2026) — UNE TÂCHE SANS BIEN, PARTOUT PROPRE ═══════════════════════
 * Sections « Adresse du bien » omises, aucun « undefined », agenda sans lieu ni lien de fiche ; une tâche AVEC bien
 * garde exactement le comportement d'avant.
 */
const base: ContenuMailTache = {
  sorte: 'invitation', destinataire: 'Claire', expediteur: 'Arnaud Jorel', demandeLe: '2026-10-17T07:00:00Z',
  jour: '2026-10-21', heure: null, dureeMinutes: null, titre: 'Réunion syndic', notes: null, adresse: null,
  contacts: [{ famille: 'independant', nom: 'M. Dupont', qualite: 'Président du conseil syndical', organisation: null,
    coordonnees: [{ sorte: 'telephone', libelle: null, valeur: '0600000009', affichage: '06 00 00 00 09' }] }],
  invites: [{ libelle: 'Claire', statut: 'en_attente', moi: true }], pieces: [],
  liens: { accepter: 'https://app.test/a', refuser: 'https://app.test/r', expireLe: '2026-10-24T07:00:00Z' },
};

describe('les mails d’une tâche sans bien', () => {
  for (const sorte of ['invitation', 'recapitulatif', 'confirmation'] as const) {
    it(`${sorte} : pas de section « Adresse du bien », aucun « undefined » ni « null », les contacts saisis à la main y sont`, () => {
      const m = mailTache({ ...base, sorte, ...(sorte === 'confirmation' ? { acceptation: { par: 'Claire', le: '2026-10-17T08:00:00Z' } } : {}),
        ...(sorte !== 'invitation' ? { liens: undefined, agenda: 'sans_agenda' as const } : {}) });
      for (const x of [m.texte, m.html]) {
        expect(x).not.toMatch(/Adresse du bien|ADRESSE DU BIEN|undefined|\bnull\b|Adresse non renseignée/);
      }
      expect(m.texte).toContain('M. Dupont');
      expect(m.texte).toContain('Réunion syndic');
    });
  }
  it('avec bien : la section est toujours là (inchangé)', () => {
    expect(mailTache({ ...base, adresse: '7 avenue de l’Union, Asnières' }).texte).toContain('— ADRESSE DU BIEN —\n7 avenue de l’Union, Asnières');
  });
  it('l’objet de l’invitation : sans adresse ; avec bien, inchangé', () => {
    expect(objetDemande({ adresseCourte: null, objet: 'Réunion', echeance: 'mer. 21 oct. · journée' })).toBe('Tâche à accepter — Réunion — mer. 21 oct. · journée');
    expect(objetDemande({ adresseCourte: '7 av.', objet: 'Réunion', echeance: 'mer.' })).toBe('Tâche à accepter — 7 av. — Réunion — mer.');
  });
});

describe('l’agenda d’une tâche sans bien', () => {
  const c = { id: 9, objet: 'Réunion syndic', texte: '', jour: '2026-10-21', heure: '10:00', dureeMinutes: null, rappels: [], faite: false,
    lotId: 0, adresse: null, codePostal: null, commune: null, pieces: [] };
  it('ni lieu, ni adresse dans le titre, ni lien de fiche', () => {
    const e = construireEvenement({ ...c, sansBien: true }, { siteUrl: 'https://app.test', motRappel: () => '' });
    expect(e.summary).toBe('Tâche gestion — Réunion syndic');
    expect('location' in e).toBe(false);
    expect(e.description).not.toContain('Fiche du bien');
  });
  it('avec bien : titre et lieu comme avant', () => {
    expect(titreEvenement({ objet: 'Visite', adresse: '7 avenue de l’Union', commune: 'Asnières', faite: false }))
      .toBe('Tâche gestion — Visite — 7 avenue de l’Union');
    const e = construireEvenement({ ...c, lotId: 27, adresse: '7 avenue de l’Union', codePostal: '92600', commune: 'Asnières' },
      { siteUrl: 'https://app.test', motRappel: () => '' });
    expect(e.location).toBe('7 avenue de l’Union, 92600 Asnières');
    expect(e.description).toContain('Fiche du bien : https://app.test/admin/gestion?ecran=annuaire&fiche=lot-27');
  });
});

describe('les contacts saisis à la main', () => {
  it('nom obligatoire, e-mail vérifié, champs bornés', () => {
    expect(lireContactsManuels([{ nom: ' M. Dupont ', qualite: 'Président', telephone: '06 00', email: 'd@x.fr' }, { nom: '' },
      { nom: 'Mme Martin', email: 'pas-un-mail' }])).toEqual([
      { nom: 'M. Dupont', qualite: 'Président', telephone: '06 00', email: 'd@x.fr' },
      { nom: 'Mme Martin', qualite: null, telephone: null, email: null },
    ]);
    expect('contactsManuels' in lireSaisie({ objet: 'a', jour: '2026-10-21', confieeA: 2 })).toBe(false);
  });
});

describe('la bulle de la frise', () => {
  it('sans bien : pas de ligne « Adresse du bien »', () => {
    const b = bulleTacheFrise({ id: 1, objet: 'x', jour: '2026-10-21', heure: null, dureeMinutes: null, etat: 'a_faire', expediteur: 'A',
      adresse: '', invites: [], contacts: [], pieces: [] });
    expect(b.parties.map((p) => p.titre)).not.toContain('Adresse du bien');
  });
});
