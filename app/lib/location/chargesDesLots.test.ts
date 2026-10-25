import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { chargesDesLots, choixSelonFiche, MOTIF_CHARGES_DIVERGENTES, ORDRE_BOUTONS_CHARGES, signalCharges } from './chargesDesLots';

vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { ecrireChargesCoproDans } = await import('./chargesCoproRepo');

/**
 * 🔴 Arno (25/10/2026) — « PAIEMENT DES CHARGES » : une seule donnée (`gestion_annuaire_lot.charges_copro`), présélectionnée depuis la
 * fiche du bien dans « Nouveau locataire » et le Dossier de location ; un choix fait là met à jour la fiche du bien. Données fictives.
 */
describe('🔴 la présélection depuis les lots du bien (PUR)', () => {
  it('une valeur commune → présélectionnée ; un lot sans valeur ne contredit rien ; aucune valeur → aucun choix', () => {
    expect(chargesDesLots(['agence'])).toEqual({ sorte: 'valeur', valeur: 'agence' });
    expect(chargesDesLots(['proprietaire', null, undefined, 'proprietaire'])).toEqual({ sorte: 'valeur', valeur: 'proprietaire' });
    expect(chargesDesLots([null, undefined])).toEqual({ sorte: 'aucune' });
    expect(chargesDesLots([])).toEqual({ sorte: 'aucune' });
    expect(chargesDesLots(['syndic'])).toEqual({ sorte: 'aucune' });
  });

  it('LOTS DIVERGENTS : aucune présélection, « valeurs différentes selon les lots »', () => {
    const f = chargesDesLots(['agence', 'proprietaire']);
    expect(f).toEqual({ sorte: 'divergentes' });
    expect(choixSelonFiche(null, false, f)).toBeNull();
    expect(signalCharges(null, f)).toBe(MOTIF_CHARGES_DIVERGENTES);
    expect(MOTIF_CHARGES_DIVERGENTES).toMatch(/^Valeurs différentes selon les lots/);
  });

  it('SUIVI AU CHANGEMENT DE BIEN : la présélection suit la fiche ; un choix À LA MAIN est gardé, et signalé s’il diffère', () => {
    expect(choixSelonFiche('agence', false, { sorte: 'valeur', valeur: 'proprietaire' })).toBe('proprietaire');
    expect(choixSelonFiche('agence', false, { sorte: 'aucune' })).toBeNull();
    expect(choixSelonFiche('agence', true, { sorte: 'valeur', valeur: 'proprietaire' })).toBe('agence');
    expect(signalCharges('agence', { sorte: 'valeur', valeur: 'proprietaire' })).toBe('Différent de la fiche du bien (Propriétaire) : la fiche sera mise à jour à l’enregistrement.');
    expect(signalCharges('proprietaire', { sorte: 'valeur', valeur: 'proprietaire' })).toBeNull();
    expect(signalCharges('agence', { sorte: 'aucune' })).toBeNull();
  });

  it('le même ordre de boutons partout : Agence, puis Propriétaire (Nouveau locataire, Dossier de location, page bien)', () => {
    expect(ORDRE_BOUTONS_CHARGES).toEqual(['agence', 'proprietaire']);
    for (const f of ['ConditionsEntree.tsx', 'CreationBien.tsx']) {
      expect(readFileSync(`app/(admin)/admin/(protected)/location/${f}`, 'utf8'), f).toContain('ORDRE_BOUTONS_CHARGES');
    }
  });
});

describe('🔴 ÉCRITURE DANS LES DEUX SENS — un choix fait dans « Nouveau locataire » met à jour la fiche du bien', () => {
  const base = (avant: string | null) => {
    const sql: { s: string; p: unknown[] }[] = [];
    const q = vi.fn(async (s: string, p: unknown[] = []) => {
      sql.push({ s: s.replace(/\s+/g, ' '), p });
      return s.includes('SELECT charges_copro') ? { rows: [{ v: avant }], rowCount: 1 } : { rows: [], rowCount: 1 };
    });
    return { sql, q };
  };
  const auteur = { id: 3, libelle: 'arno@exemple.fr' };

  it('la colonne DU BIEN est écrite, et la modification entre à son Historique (ancienne → nouvelle, écran nommé)', async () => {
    const { sql, q } = base('proprietaire');
    expect(await ecrireChargesCoproDans(q as never, 51, 'agence', auteur, 'Nouveau locataire')).toBe(true);
    expect(sql.find((x) => x.s.startsWith('UPDATE gestion_annuaire_lot SET charges_copro'))?.p).toEqual([51, 'agence']);
    const j = sql.find((x) => x.s.includes('INSERT INTO gestion_journal'))!;
    expect(j.p.slice(0, 4)).toEqual([51, 'Paiement des charges : payées par le propriétaire', 'Paiement des charges : payées par l’agence',
      'Copropriété — Paiement des charges : payées par le propriétaire → payées par l’agence (Nouveau locataire)']);
  });

  it('une valeur inchangée (la présélection gardée) n’écrit RIEN', async () => {
    const { sql, q } = base('agence');
    expect(await ecrireChargesCoproDans(q as never, 51, 'agence', auteur, 'Nouveau locataire')).toBe(true);
    expect(sql.filter((x) => /^(UPDATE|INSERT)/.test(x.s))).toEqual([]);
  });

  it('« Nouveau locataire » et le Dossier de location écrivent par ce geste, sur le bien loué', () => {
    expect(readFileSync('app/lib/location/portefeuilleRepo.ts', 'utf8')).toContain("ecrireChargesCoproDans(q, lotId, conditions.chargesCopro, auteur, 'Nouveau locataire')");
    expect(readFileSync('app/lib/location/dossierLocationRepo.ts', 'utf8')).toContain("ecrireChargesCoproDans(q, lu.lotId, nouvelles, auteur, 'Dossier de location')");
  });
});
