import { describe, it, expect, vi } from 'vitest';
import {
  executerAlerteSuperstructures, sujetSuperstructures, corpsSuperstructures, SEUIL_GARDE,
  type DepsAlerteSuperstructures, type CandidatSuperstructure,
} from './alerteSuperstructures';

/**
 * N10-B — passe d'alerte superstructures : orchestration PURE par injection (aucun SMTP/S3/DB). On éprouve : ④ un sommet portant la
 * réserve déclenche UNE alerte (contenu complet + motif LiDAR + décision attendue) ; ⑤ rien à alerter → aucun e-mail ; ③ la 2ᵉ passe
 * n'envoie pas de doublon (idempotence par le registre) ; la GARDE anti-avalanche ; une cote non résolue (clé null) reste sans lien.
 */
const CAND = (over: Partial<CandidatSuperstructure> = {}): CandidatSuperstructure => ({
  dossierId: 11430, numDau: '07512024V0037', communeNom: 'Paris', adresse: '30 RUE LOUIS LUMIERE PARIS 20',
  sommetValeur: 97.13, sommetNiveau: 'TOITURE',
  cotes: [{ cote: 108.93, piece: 'PC5.5_Facade_Sud.pdf', page: 1, cle: 'k/pc55' }, { cote: 100.0, piece: 'PC3.1_Coupe_AA.pdf', page: 1, cle: 'k/pc31' }],
  ...over,
});

function deps(over: Partial<DepsAlerteSuperstructures> = {}, candidats: CandidatSuperstructure[] = [CAND()]): { d: DepsAlerteSuperstructures; envois: { to: string; sujet: string; corps: string }[]; journal: number[] } {
  const envois: { to: string; sujet: string; corps: string }[] = [];
  const journal: number[] = [];
  const d: DepsAlerteSuperstructures = {
    lireConfig: async () => ({ active: true, email: 'alerte@sansvisavis.com' }),
    chargerCandidats: async () => candidats.filter((c) => !journal.includes(c.dossierId)), // le registre exclut les déjà alertés
    lienSigne: async (cle) => `https://signed.example/${cle}`,
    envoyer: async (m) => { envois.push(m); },
    journaliser: async (e) => { journal.push(e.dossierId); },
    ...over,
  };
  return { d, envois, journal };
}

describe('N10-B — executerAlerteSuperstructures', () => {
  it('④ un sommet portant la réserve → UNE alerte, contenu complet (permis, commune, adresse, sommet, cotes + liens à la page, motif LiDAR)', async () => {
    const { d, envois } = deps();
    const bilan = await executerAlerteSuperstructures(d);
    expect(bilan).toMatchObject({ examinees: 1, envoyees: 1, erreurs: 0, bloque: false });
    expect(envois).toHaveLength(1);
    const m = envois[0];
    expect(m.to).toBe('alerte@sansvisavis.com');
    expect(m.sujet).toContain('07512024V0037');
    expect(m.sujet).toMatch(/décision attendue/i);                 // objet dit qu'une décision humaine est attendue
    expect(m.corps).toContain('Paris');
    expect(m.corps).toContain('30 RUE LOUIS LUMIERE PARIS 20');
    expect(m.corps).toContain('97.13');                            // sommet retenu
    expect(m.corps).toContain('TOITURE');                          // son niveau
    expect(m.corps).toContain('108.93');                           // cote au-dessus
    expect(m.corps).toContain('https://signed.example/k/pc55#page=1'); // lien signé À LA PAGE
    expect(m.corps).toMatch(/MNS LiDAR/);                          // le motif, en clair
    expect(m.corps).toMatch(/SOUS-ESTIMER/i);
  });

  it('⑤ aucun candidat → aucun e-mail', async () => {
    const { d, envois } = deps({}, []);
    const bilan = await executerAlerteSuperstructures(d);
    expect(bilan).toMatchObject({ examinees: 0, envoyees: 0 });
    expect(envois).toHaveLength(0);
  });

  it('⑤bis alertes désactivées → aucun e-mail', async () => {
    const { d, envois } = deps({ lireConfig: async () => ({ active: false, email: 'x@y.fr' }) });
    await executerAlerteSuperstructures(d);
    expect(envois).toHaveLength(0);
  });

  it('③ deux passes consécutives → un SEUL e-mail (idempotence par le registre)', async () => {
    const { d, envois } = deps();
    await executerAlerteSuperstructures(d);
    await executerAlerteSuperstructures(d); // 2ᵉ passe : le registre exclut le permis déjà alerté
    expect(envois).toHaveLength(1);
  });

  it('GARDE anti-avalanche : plus de SEUIL_GARDE permis dus → AUCUN envoi, bloque=true', async () => {
    const trop = Array.from({ length: SEUIL_GARDE + 1 }, (_, i) => CAND({ dossierId: 1000 + i, numDau: `PC${i}` }));
    const { d, envois } = deps({}, trop);
    const bilan = await executerAlerteSuperstructures(d);
    expect(bilan.bloque).toBe(true);
    expect(bilan.nombreDus).toBe(SEUIL_GARDE + 1);
    expect(envois).toHaveLength(0); // rien ne part tant qu'Arno n'a pas tranché
  });

  it('② une cote non résolue (clé null) reste sans lien, avec mention explicite', async () => {
    const cand = CAND({ cotes: [{ cote: 108.93, piece: 'renommee.pdf', page: 1, cle: null }] });
    const { d, envois } = deps({}, [cand]);
    await executerAlerteSuperstructures(d);
    expect(envois[0].corps).toContain('108.93');
    expect(envois[0].corps).toMatch(/introuvable/i);
    expect(envois[0].corps).not.toContain('https://signed'); // aucun lien pour une pièce non résolue
  });

  it('un échec d’envoi est ISOLÉ (compté), n’empêche pas de journaliser les autres', async () => {
    const c2 = CAND({ dossierId: 22, numDau: 'PC-22' });
    const envoyer = vi.fn().mockRejectedValueOnce(new Error('SMTP')).mockResolvedValueOnce(undefined);
    const { d } = deps({ envoyer }, [CAND(), c2]);
    const bilan = await executerAlerteSuperstructures(d);
    expect(bilan.envoyees + bilan.erreurs).toBe(2);
    expect(bilan.erreurs).toBe(1);
  });

  it('sujet/corps PURS : objet nomme le permis ; corps porte le motif et le lien à la page', () => {
    expect(sujetSuperstructures('PC1')).toContain('PC1');
    const corps = corpsSuperstructures(CAND(), new Map([[108.93, 'https://s/x#page=1']]));
    expect(corps).toContain('https://s/x#page=1');
    expect(corps).toMatch(/ombrière|superstructure/i);
  });
});
