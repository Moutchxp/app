import { describe, expect, it } from 'vitest';
import { ETIQUETTE_FAMILLE_MAIL, familleDuMail, rappelFamilles, trierParFamille } from './famillesMails';

/** 🔴 Arno (15/11/2026) — les familles de mails d'un récapitulatif : étiquette, ordre, rappel des comptes. */
describe('familles de mails', () => {
  it('les étiquettes, mot pour mot', () => {
    expect(ETIQUETTE_FAMILLE_MAIL).toEqual({ interne: 'MAIL INTERNE À L’AGENCE', locataire: 'MAIL AUX LOCATAIRES', proprietaire: 'MAIL AUX PROPRIÉTAIRES', partenaires: 'MAIL À NOS PARTENAIRES' });
  });
  it('ordre : interne, locataires, propriétaires, partenaires ; dans une famille, l’ordre reçu', () => {
    const m = [{ famille: 'locataire' as const, n: 1 }, { famille: 'proprietaire' as const, n: 2 }, { famille: 'locataire' as const, n: 3 }, { famille: 'interne' as const, n: 4 }];
    expect(trierParFamille(m).map((x) => x.n)).toEqual([4, 1, 3, 2]);
  });
  it('le rappel : les comptes réels, au singulier et au pluriel ; aucun mail : rien', () => {
    expect(rappelFamilles([{ famille: 'locataire' }, { famille: 'interne' }])).toBe('1 mail interne · 1 mail locataire');
    expect(rappelFamilles([{ famille: 'locataire' }, { famille: 'locataire' }, { famille: 'interne' }, { famille: 'proprietaire' }])).toBe('1 mail interne · 2 mails locataires · 1 mail propriétaire');
    expect(rappelFamilles([])).toBe('');
  });
  it('la famille d’après la sorte ; une copie interne est INTERNE ; la famille du serveur l’emporte', () => {
    expect(familleDuMail({ sorte: 'preavis_locataires', objet: 'Accusé' })).toBe('locataire');
    expect(familleDuMail({ sorte: 'preavis_locataires', objet: '[Copie interne] Accusé' })).toBe('interne');
    expect(familleDuMail({ sorte: 'preavis_adhoc' })).toBe('partenaires');
    expect(familleDuMail({ sorte: 'sortie_interne' })).toBe('interne');
    expect(familleDuMail({ sorte: 'sortie_edls_proprietaire' })).toBe('proprietaire');
    expect(familleDuMail({ sorte: 'previsite_compte_rendu', famille: 'locataire' })).toBe('locataire');
    expect(familleDuMail({ sorte: 'inconnue' })).toBe('interne');
  });
});
