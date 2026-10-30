import { describe, expect, it } from 'vitest';
import { basculer, personneEcranDe, personneVide, pertesBascule } from './PersonnesDossier';
import { libellePersonne } from '../../../../lib/transaction/modele';
import { lireDossier } from '../../../../lib/transaction/saisie';

/** 🔴 LOT BJ (Arno, 30/10/2026) — les vendeurs et acquéreurs : particulier ou société, civilité, prénom, représentants (PUR). */
describe('🔴 LOT BJ — le libellé d’une personne sur sa carte', () => {
  it('particulier avec et sans civilité ; société : son nom seul ; une fiche d’avant : son texte', () => {
    expect(libellePersonne({ nom: 'BERCIER', prenom: 'Mira', civilite: 'Mme', type: 'particulier' })).toBe('Mme Mira BERCIER');
    expect(libellePersonne({ nom: 'BERCIER', prenom: 'Mira', civilite: null, type: 'particulier' })).toBe('Mira BERCIER');
    expect(libellePersonne({ nom: 'CRITERIMMO', prenom: 'X', civilite: 'M.', type: 'societe' })).toBe('CRITERIMMO');
    expect(libellePersonne({ nom: 'DUPONT Jean' })).toBe('DUPONT Jean');
  });
  it('une fiche d’avant se lit comme un particulier, son texte dans « Nom », un prénom vide', () => {
    expect(personneEcranDe({ id: 3, role: 'vendeur', nom: 'DUPONT Jean', telephone: null, email: null, adresse: null }))
      .toEqual({ id: 3, role: 'vendeur', type: 'particulier', civilite: '', nom: 'DUPONT Jean', prenom: '', telephone: '', email: '', adresse: '', representants: [] });
  });
});

describe('🔴 LOT BJ — Particulier ↔ Société sans perte silencieuse', () => {
  it('rien de rempli : le passage se fait sans question ; sinon, la liste de ce qui serait perdu', () => {
    const p = { ...personneVide('vendeur'), nom: 'CRITERIMMO' };
    expect(pertesBascule(p, 'societe')).toEqual([]);
    expect(pertesBascule({ ...p, civilite: 'M.', prenom: 'Jean', telephone: '06', adresse: '' }, 'societe')).toEqual(['la civilité', 'le prénom', 'le téléphone']);
    const s = { ...p, type: 'societe' as const, representants: [{ id: null, civilite: '' as const, nom: 'A', prenom: '', telephone: '', email: '', adresse: '' },
      { id: null, civilite: '' as const, nom: '', prenom: '', telephone: '', email: '', adresse: '' }] };
    expect(pertesBascule(s, 'particulier')).toEqual(['son représentant']);
    expect(pertesBascule({ ...s, representants: [s.representants[0], s.representants[0], s.representants[0]] }, 'particulier')).toEqual(['ses 3 représentants']);
    expect(basculer({ ...p, prenom: 'Jean', telephone: '06' }, 'societe')).toMatchObject({ type: 'societe', nom: 'CRITERIMMO', prenom: '', telephone: '' });
    expect(basculer(s, 'particulier')).toMatchObject({ type: 'particulier', representants: [] });
  });
});

describe('🔴 LOT BJ — lireDossier : particulier, société et ses représentants', () => {
  const dossier = (personnes: unknown[]) => ({ societe: 'criterimmo', statut: 'compromis', honorairesTtc: '1000', personnes });
  it('particulier : civilité facultative ; une civilité inconnue est refusée', () => {
    const r = lireDossier(dossier([{ role: 'vendeur', type: 'particulier', civilite: 'Mme', nom: 'BERCIER', prenom: 'Mira' }]));
    expect(r.ok && r.valeur.personnes[0]).toMatchObject({ type: 'particulier', civilite: 'Mme', nom: 'BERCIER', prenom: 'Mira', representants: [] });
    expect(lireDossier(dossier([{ role: 'vendeur', type: 'particulier', civilite: '', nom: 'BERCIER' }])).ok).toBe(true);
    expect(lireDossier(dossier([{ role: 'vendeur', civilite: 'Dr', nom: 'BERCIER' }])).ok).toBe(false);
  });
  it('société avec 0, 1 et 3 représentants ; un représentant vide est ignoré ; sans nom (mais avec un téléphone) : refusé', () => {
    const rep = (nom: string) => ({ civilite: 'M.', nom, prenom: 'P', telephone: '06 00 00 00 00', email: '', adresse: '' });
    for (const n of [0, 1, 3]) {
      const r = lireDossier(dossier([{ role: 'acquereur', type: 'societe', nom: 'SCI DU PARC', representants: Array.from({ length: n }, (_, i) => rep(`R${i}`)) }]));
      expect(r.ok && [r.valeur.personnes[0].type, r.valeur.personnes[0].representants!.length, r.valeur.personnes[0].civilite]).toEqual(['societe', n, null]);
    }
    const vide = lireDossier(dossier([{ role: 'acquereur', type: 'societe', nom: 'SCI', representants: [{ nom: '', prenom: '', telephone: '', email: '', adresse: '' }] }]));
    expect(vide.ok && vide.valeur.personnes[0].representants).toEqual([]);
    expect(lireDossier(dossier([{ role: 'acquereur', type: 'societe', nom: 'SCI', representants: [{ nom: '', telephone: '06' }] }])).ok).toBe(false);
  });
  it('une saisie d’avant (sans type) reste telle quelle : ni type, ni représentants', () => {
    const r = lireDossier(dossier([{ role: 'vendeur', nom: 'DUPONT', telephone: '06' }]));
    expect(r.ok && 'type' in r.valeur.personnes[0]).toBe(false);
  });
});
