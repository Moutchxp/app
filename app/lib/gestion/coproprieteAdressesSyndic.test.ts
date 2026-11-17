import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, chantier « Adresses multiples d'une copropriété », lot 1 — les tests de PREUVE) : « détacher puis remplacer un syndic garde
 * toutes les adresses ; le nouveau syndic les voit toutes ; la fiche syndic les affiche. » Décision du modèle : « 4. Une copropriété = un seul syndic ;
 * un syndic = plusieurs copropriétés. Les adresses sont rangées en UN SEUL endroit, sur la copropriété […] 5. Détacher un syndic ne retire AUCUNE adresse
 * de la copropriété ; le nouveau syndic rattaché voit immédiatement toutes les adresses cumulées. »
 * 🔒 Une petite base EN MÉMOIRE (la copropriété « 80 rue de Normandie » et ses 3 adresses secondaires, comme en recette) : toute écriture sur les
 * adresses y serait vue. Rien n'est lu ni écrit en base réelle.
 */
interface Lien { id: string; copro: string; syndic: string; fin: string | null; motif: string | null }
const b = vi.hoisted(() => ({
  ecrituresAdresses: [] as string[],
  adresses: [] as { id: string; cle: string; libelle: string; code_postal: string; commune: string; retire_le: string | null }[],
  liens: [] as { id: string; copro: string; syndic: string; fin: string | null; motif: string | null }[],
  syndics: new Map<string, { nom: string; ville: string | null }>(),
  prochainSyndic: 12, prochainLien: 40,
}));
const COPRO = { id: '157', cle: '80 rue de normandie', libelle: '80 rue de Normandie', code_postal: '92400', commune: 'Courbevoie' };
const LOTS = [
  { id: '501', numero: 'W501', immeuble: '80 rue de Normandie', adresse: '80 rue de Normandie', commune: 'Courbevoie', code_postal: '92400', proprietaires: null, type: null },
  { id: '502', numero: 'W502', immeuble: '43 avenue Marceau', adresse: '43 avenue Marceau', commune: 'Courbevoie', code_postal: '92400', proprietaires: null, type: null },
  { id: '503', numero: 'W503', immeuble: '76 rue de Normandie', adresse: '76 rue de Normandie', commune: 'Courbevoie', code_postal: '92400', proprietaires: null, type: null },
];
const repondre = (sql: string, p: unknown[]): { rows: unknown[] } => {
  const s = sql.replace(/\s+/g, ' ');
  // toute écriture sur les adresses de la copropriété est notée (elle ne doit JAMAIS arriver ici)
  if (/(INSERT INTO|UPDATE|DELETE FROM)\s+gestion_copropriete_adresse\b/.test(s) || /(UPDATE|DELETE FROM)\s+gestion_copropriete\b(?!_)/.test(s)) { b.ecrituresAdresses.push(s); return { rows: [] }; }
  if (s.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE')) {
    const x = b.syndics.get(String(p[0])); return { rows: x ? [{ id: String(p[0]), ...x }] : [] };
  }
  if (s.includes('INSERT INTO gestion_syndic ')) { const id = String(b.prochainSyndic++); b.syndics.set(id, { nom: String(p[0]), ville: (p[3] as string) ?? null }); return { rows: [{ id }] }; }
  // le retrait d'UNE résidence : les liens en cours de CE syndic à CETTE copropriété
  if (s.includes('FOR UPDATE OF cs') && s.includes('WHERE cs.syndic_id = $1 AND c.cle_immeuble = $2')) {
    return { rows: b.liens.filter((l) => l.syndic === String(p[0]) && l.fin === null && p[1] === COPRO.cle)
      .map((l) => ({ lien_id: l.id, copro_id: l.copro, libelle: COPRO.libelle, code_postal: COPRO.code_postal, commune: COPRO.commune })) };
  }
  // l'enregistrement d'un syndic : les liens en cours des immeubles voulus, et ceux de ce syndic
  if (s.includes('FOR UPDATE OF cs') && s.includes('c.cle_immeuble = ANY($1::text[])')) {
    return { rows: b.liens.filter((l) => l.fin === null && (((p[0] as string[]).includes(COPRO.cle)) || l.syndic === String(p[1])))
      .map((l) => ({ lien_id: l.id, copro_id: l.copro, cle: COPRO.cle, syndic_id: l.syndic })) };
  }
  if (s.includes('UPDATE gestion_copropriete_syndic SET fin = now()')) {
    const l = b.liens.find((x) => x.id === String(p[0])); if (l) { l.fin = '2026-11-17'; l.motif = String(p[3] ?? s.match(/fin_motif = '([^']+)'/)?.[1] ?? ''); }
    return { rows: [] };
  }
  if (s.includes('INSERT INTO gestion_copropriete_syndic')) {
    if (p[0] === COPRO.cle) b.liens.push({ id: String(b.prochainLien++), copro: COPRO.id, syndic: String(p[1]), fin: null, motif: null });
    return { rows: [] };
  }
  // la lecture des adresses secondaires (toutes les copropriétés)
  if (s.includes('FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id WHERE a.retire_le IS NULL')) {
    return { rows: b.adresses.filter((a) => a.retire_le === null).map((a) => ({ ...a, copro_id: COPRO.id, copro_cle: COPRO.cle })) };
  }
  // la fiche syndic : le syndic, puis ses liens de copropriété
  if (s.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL')) {
    const x = b.syndics.get(String(p[0]));
    return { rows: x ? [{ id: String(p[0]), nom: x.nom, adresse: '1 rue du Cabinet', code_postal: '75001', ville: x.ville, telephone: null, telephone_2: null, email: null, note: null,
      cree_le: '2026-11-17', cree_par_libelle: 'arno', maj_le: null, maj_par_libelle: null }] : [] };
  }
  if (s.includes('FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id WHERE cs.syndic_id = $1 ORDER BY')) {
    return { rows: b.liens.filter((l) => l.syndic === String(p[0])).map((l) => ({ id: COPRO.id, cle: COPRO.cle, libelle: COPRO.libelle, code_postal: COPRO.code_postal,
      commune: COPRO.commune, debut: '2026-11-01', fin: l.fin, fin_motif: l.motif })) };
  }
  if (s.startsWith('SELECT lo.id::text, lo.wippimmo_id AS numero')) return { rows: LOTS };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1')) return { rows: p[0] === COPRO.cle ? [{ id: COPRO.id }] : [] };
  if (s.includes('FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL FOR UPDATE')) return { rows: b.adresses.filter((a) => a.retire_le === null).map((a) => ({ id: a.id, cle: a.cle })) };
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, p: unknown[] = []) => repondre(sql, p)),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) => fn(async (sql: string, p: unknown[] = []) => repondre(sql, p))),
}));
const { enregistrerSyndic, ficheSyndic, retirerDeLaCopropriete } = await import('./syndicRepo');
const { lotsDuPortefeuille, validerSyndic } = await import('./syndics');
const auteur = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ADRESSES = ['43 avenue marceau', '74 rue de normandie', '76 rue de normandie'];

beforeEach(() => {
  b.ecrituresAdresses = [];
  b.adresses = [
    { id: '3', cle: '43 avenue marceau', libelle: '43 avenue Marceau', code_postal: '92400', commune: 'Courbevoie', retire_le: null },
    { id: '4', cle: '74 rue de normandie', libelle: '74 rue de Normandie', code_postal: '92400', commune: 'Courbevoie', retire_le: null },
    { id: '5', cle: '76 rue de normandie', libelle: '76 rue de Normandie', code_postal: '92400', commune: 'Courbevoie', retire_le: null }];
  b.liens = [{ id: '31', copro: COPRO.id, syndic: '11', fin: null, motif: null }];
  b.syndics = new Map([['11', { nom: '_TEST ANCIEN SYNDIC', ville: 'Paris' }]]);
  b.prochainSyndic = 12; b.prochainLien = 40;
});

describe('🔴🔴 détacher puis remplacer un syndic : la copropriété garde TOUTES ses adresses', () => {
  it('détacher (« Détacher / remplacer le syndic de cette résidence ») : le lien est fermé, AUCUNE adresse retirée ni écrite', async () => {
    expect(await retirerDeLaCopropriete(11, '80 rue de Normandie', auteur)).toEqual({ ok: true, lots: 3 });
    expect(b.liens[0]).toMatchObject({ fin: '2026-11-17', motif: 'retrait de la résidence' });
    expect(b.ecrituresAdresses).toEqual([]);
    expect(b.adresses.map((a) => [a.cle, a.retire_le])).toEqual(ADRESSES.map((c) => [c, null]));
  });
  it('puis un NOUVEAU syndic pour cette copropriété (sa fiche n’envoie pas les adresses, comme l’écran) : rattaché, AUCUNE adresse écrite', async () => {
    await retirerDeLaCopropriete(11, '80 rue de Normandie', auteur);
    const v = validerSyndic({ nom: '_TEST NOUVEAU SYNDIC', adresse: '1 rue du Cabinet', codePostal: '75001', ville: 'Paris', immeubles: [{ libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' }] });
    if (!v.ok) throw new Error(v.motif);
    expect(v.syndic.immeubles[0]).not.toHaveProperty('adresses'); // l'écran ne les envoie pas (sansAdressesCopro) : le serveur n'y touche pas
    expect(await enregistrerSyndic(null, v.syndic, auteur)).toEqual({ ok: true, id: 12 });
    expect(b.liens.filter((l) => l.fin === null).map((l) => [l.copro, l.syndic])).toEqual([[COPRO.id, '12']]);
    expect(b.ecrituresAdresses).toEqual([]);
    expect(b.adresses.every((a) => a.retire_le === null)).toBe(true);
  });
  it('le nouveau syndic les VOIT toutes : sa fiche porte la copropriété, ses 3 autres adresses et les biens de toutes ses adresses', async () => {
    await retirerDeLaCopropriete(11, '80 rue de Normandie', auteur);
    const v = validerSyndic({ nom: '_TEST NOUVEAU SYNDIC', adresse: '1 rue du Cabinet', codePostal: '75001', ville: 'Paris', immeubles: [{ libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' }] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(null, v.syndic, auteur);
    const f = await ficheSyndic(12);
    expect(f?.coproprietes.map((c) => [c.cle, (c.adresses ?? []).map((a) => a.cle)])).toEqual([[COPRO.cle, ADRESSES]]);
    expect(f?.coproprietes[0].lots.map((l) => l.id)).toEqual([501, 502, 503]);
    // l'ancien syndic n'a plus la copropriété qu'en historique ; les adresses, elles, n'ont jamais bougé
    expect((await ficheSyndic(11))?.historique.map((h) => [h.libelle, h.motif])).toEqual([['80 rue de Normandie', 'retrait de la résidence']]);
    expect(b.ecrituresAdresses).toEqual([]);
  });
  it('la fiche syndic les affiche : « + 3 adresses » et les biens rangés sous CHACUNE de leurs adresses (la même fonction que l’écran)', async () => {
    const f = await ficheSyndic(11);
    const c = f!.coproprietes[0];
    expect((c.adresses ?? []).length).toBe(3);
    const groupes = lotsDuPortefeuille([{ libelle: c.libelle, codePostal: c.codePostal ?? '', commune: c.commune ?? '', adresses: (c.adresses ?? []).map((a) => ({ libelle: a.libelle, codePostal: a.codePostal ?? '', commune: a.commune ?? '' })) }],
      [{ cle: c.cle, libelle: c.libelle, codePostal: c.codePostal, commune: c.commune, lots: c.lots.filter((l) => l.adresse === '80 rue de Normandie'), syndic: null } as never,
        { cle: '43 avenue marceau', libelle: '43 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: c.lots.filter((l) => l.adresse === '43 avenue Marceau'), syndic: null } as never,
        { cle: '76 rue de normandie', libelle: '76 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', lots: c.lots.filter((l) => l.adresse === '76 rue de Normandie'), syndic: null } as never],
      null, new Set([c.cle, ...ADRESSES]));
    expect(groupes.flatMap((g) => g.lots.map((l) => l.id))).toEqual([501, 502, 503]);
  });
  it('TÉMOIN : si un écran renvoyait un jour une liste d’adresses VIDE, les 3 seraient retirées — la base en mémoire voit bien ces écritures (le garde-fou à garder : la fiche syndic n’envoie pas les adresses)', async () => {
    const v = validerSyndic({ nom: '_TEST ANCIEN SYNDIC', adresse: '1 rue du Cabinet', codePostal: '75001', ville: 'Paris',
      immeubles: [{ libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', adresses: [] }] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(11, v.syndic, auteur);
    expect(b.ecrituresAdresses.some((x) => x.startsWith('UPDATE gestion_copropriete_adresse SET retire_le = now()'))).toBe(true);
  });
});

