import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { champsResultatNet } from './tableauBord';

/**
 * 🔴 Arno (26/10/2026, 428) — CE QUE L'API ENVOIE DU « RÉSULTAT NET DE L'AGENCE », selon le compte (les trois cas) ; et le repo n'envoie
 * pas autre chose (taux à zéro et rétrocessions vides pour tous les autres blocs, comme avant).
 */
const REGLES = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const RETRO = [{ id: 1, negociateurId: 5, mois: '2026-08', montant: 200, libelle: 'Alex Coms' }] as unknown as Parameters<typeof champsResultatNet>[3];

describe('🔴 les trois cas', () => {
  it('administrateur : l’indicateur seul (il a déjà le taux réel et les rétrocessions de tous)', () => {
    expect(champsResultatNet(true, false, REGLES, RETRO)).toEqual({ voirResultatNet: true });
  });
  it('collaborateur Location + Oui : l’indicateur ET, à part, le taux réel et les rétrocessions (pour ce seul bloc)', () => {
    expect(champsResultatNet(false, true, REGLES, RETRO)).toEqual({ voirResultatNet: true, ctxResultatNet: { regles: REGLES, retrocessions: RETRO } });
  });
  it('🔴 tout autre compte : l’indicateur à faux, et RIEN d’autre — ni taux, ni rétrocession, ni variable, ni net', () => {
    const r = champsResultatNet(false, false, REGLES, RETRO);
    expect(r).toEqual({ voirResultatNet: false });
    expect(JSON.stringify(r)).not.toMatch(/0\.15|Alex Coms|200/);
  });
});

describe('le repo s’appuie sur cette seule règle', () => {
  it('les autres blocs gardent taux à zéro et rétrocessions vides pour qui ne voit pas les commissions', () => {
    const src = readFileSync('app/lib/location/suivi/tableauBordRepo.ts', 'utf8');
    expect(src).toContain('...champsResultatNet(voirCommissions, o.resultatNet === true, reglesLues, retrocessions),');
    expect(src).toContain('const regles = voirCommissions ? reglesLues : reglesLues.map((r) => ({ ...r, tauxNegociateur: 0 }));');
    expect(src).toContain('regles, apporteurs, retrocessions: retroVisibles,');
  });
});
