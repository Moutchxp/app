import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (20/11/2026, journal des syndics) — CHAQUE CHEMIN DE LA FICHE SYNDIC écrit son geste au journal : la création avec ses copropriétés
 * (chemin ①, le cas CABINET PASCAL TOUBON du 29/10), la modification qui reprend une copropriété à un autre syndic (remplacé, avec l'ancien) ou qui en
 * retire une (chemin ②, le retrait du 20/11), « Retirer de la résidence », la suppression du syndic. Les autres chemins sont éprouvés dans le fichier
 * de leur dépôt (fiche copropriété, regroupement 504, parcelle, proposition par adresse, tuile Location).
 */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], enCours: [] as Record<string, unknown>[], liens: [] as Record<string, unknown>[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('INSERT INTO gestion_syndic (')) return { rows: [{ id: '51' }] };
  if (s.startsWith('SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) return { rows: [{ id: String(p[0]) }] };
  if (s.startsWith('SELECT nom, ville FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) return { rows: [{ nom: 'CABINET PASCAL TOUBON', ville: 'Paris' }] };
  if (s.startsWith('SELECT cs.id::text AS lien_id, c.id::text AS copro_id, c.cle_immeuble AS cle, cs.syndic_id::text')) return { rows: h.enCours };
  if (s.startsWith('INSERT INTO gestion_copropriete_syndic')) return { rows: [{ copro: '157' }] };
  if (s.startsWith('SELECT cs.id::text AS lien_id, c.id::text AS copro_id, c.libelle')) return { rows: h.liens };
  if (s.startsWith('SELECT cs.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, c.id::text AS copro')) return { rows: h.liens };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./parcelleRepo', () => ({ adressesDeLaParcelle: async () => ({ parcelles: [], adresses: [] }) }));
const js = vi.hoisted(() => ({ gestes: [] as Record<string, unknown>[] }));
vi.mock('./journalSyndicCopro', () => ({ journaliserLienSyndic: async (_q: unknown, g: Record<string, unknown>) => { js.gestes.push(g); } }));
import { enregistrerSyndic, retirerDeLaCopropriete, supprimerSyndic } from './syndicRepo';
import { validerSyndic } from './syndics';

const AUTEUR = { id: 12, libelle: 'c.jullien' };
const saisie = (immeubles: { libelle: string }[]) => {
  const v = validerSyndic({ nom: 'CABINET PASCAL TOUBON', adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris', immeubles: immeubles.map((i) => ({ ...i, codePostal: '92400', commune: 'Courbevoie' })), confirmeDoublons: true, doublonsSyndicIgnores: [] });
  if (!v.ok) throw new Error(v.motif);
  return v.syndic;
};
beforeEach(() => { h.sql = []; h.enCours = []; h.liens = []; js.gestes = []; });

describe('le journal des liens, chemin par chemin (fiche syndic)', () => {
  it('① la CRÉATION d’un syndic avec sa copropriété : « rattaché », depuis la fiche syndic (création du syndic)', async () => {
    const r = await enregistrerSyndic(null, saisie([{ libelle: '80 rue de Normandie' }]), AUTEUR);
    expect(r).toMatchObject({ ok: true, id: 51 });
    expect(js.gestes).toEqual([{ coproId: '157', nature: 'rattache', syndicId: 51, ancienSyndicId: null, ecran: 'la fiche syndic (création du syndic)' }]);
  });
  it('② la MODIFICATION qui reprend une copropriété à un autre syndic : « remplacé », avec l’ancien syndic', async () => {
    h.enCours = [{ lien_id: '60', copro_id: '157', cle: '80 rue de normandie', syndic_id: '9' }];
    await enregistrerSyndic(51, saisie([{ libelle: '80 rue de Normandie' }]), AUTEUR);
    expect(js.gestes).toEqual([{ coproId: '157', nature: 'remplace', syndicId: 51, ancienSyndicId: 9, ecran: 'la fiche syndic' }]);
  });
  it('② la MODIFICATION qui retire une copropriété de ce syndic (le geste du 20/11) : « retiré », motif « retrait »', async () => {
    h.enCours = [{ lien_id: '67', copro_id: '157', cle: '80 rue de normandie', syndic_id: '51' }];
    await enregistrerSyndic(51, saisie([]), { id: 2, libelle: 'a.jorel@sansvisavis.com' });
    expect(js.gestes).toEqual([{ coproId: '157', nature: 'retire', syndicId: 51, ecran: 'la fiche syndic', motif: 'retrait' }]);
  });
  it('l’écran d’origine transmis par l’appelant (proposition par adresse, tuile Location) est celui du journal', async () => {
    await enregistrerSyndic(51, saisie([{ libelle: '80 rue de Normandie' }]), AUTEUR, 'la création du bien (Location)');
    expect(js.gestes[0]).toMatchObject({ nature: 'rattache', ecran: 'la création du bien (Location)' });
  });
  it('« Retirer de la résidence » : « retiré »', async () => {
    h.liens = [{ lien_id: '67', copro_id: '157', libelle: '80 rue de Normandie', code_postal: '92400', commune: 'Courbevoie' }];
    expect(await retirerDeLaCopropriete(51, '80 rue de Normandie', AUTEUR)).toMatchObject({ ok: true });
    expect(js.gestes).toEqual([{ coproId: '157', nature: 'retire', syndicId: 51, ecran: 'la fiche syndic (« Retirer de la résidence »)', motif: 'retrait de la résidence' }]);
  });
  it('la suppression du syndic : « retiré » pour chacune de ses copropriétés, motif « fermeture définitive »', async () => {
    h.liens = [{ id: '67', cle: '80 rue de normandie', libelle: '80 rue de Normandie', code_postal: '92400', commune: 'Courbevoie', copro: '157' },
      { id: '68', cle: '1 place raphael', libelle: '1 place Raphaël', code_postal: '92400', commune: 'Courbevoie', copro: '158' }];
    expect(await supprimerSyndic(51, AUTEUR)).toMatchObject({ ok: true, coproprietes: 2 });
    expect(js.gestes.map((g) => [g.coproId, g.nature, g.motif])).toEqual([['157', 'retire', 'fermeture définitive'], ['158', 'retire', 'fermeture définitive']]);
  });
  it('une modification qui ne touche à aucun lien n’écrit rien au journal des syndics', async () => {
    h.enCours = [{ lien_id: '67', copro_id: '157', cle: '80 rue de normandie', syndic_id: '51' }];
    await enregistrerSyndic(51, saisie([{ libelle: '80 rue de Normandie' }]), AUTEUR);
    expect(js.gestes).toEqual([]);
  });
});

describe('les chemins de la tuile Location transmettent leur écran (création du bien ⑤, fiche du bien ⑥)', () => {
  const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\s+/g, ' ');
  it('« Nouveau bien » : « la création du bien (Location) » ; fiche du bien : « la fiche du bien (Location) » ; la tuile le passe à la porte unique', () => {
    expect(lire('app/lib/location/creationBienRepo.ts')).toMatch(/rattacherSyndicAuBien\(cree\.logementId, syndic, \{[^}]*\}, auteur, 'la création du bien \(Location\)'\)/);
    expect(lire('app/lib/location/encartBienRepo.ts')).toContain("auteur, 'la fiche du bien (Location)')");
    expect(lire('app/lib/location/syndicLocationRepo.ts')).toContain('rattacherBienAuSyndic(s.id, adresse, null, auteur, lotId, [], ecran)');
  });
});
