import { describe, it, expect } from 'vitest';
import { executerAlerteGedAuto, type DepsAlerteGed, type CandidatAlerteGed } from './alerteGedAuto';
import { DUREE_LIEN_SIGNE_MIN_S } from './alerteGed';

// Expiration 17/08 13:24 → seuil J-3 = 14/08 13:24, seuil 24 h = 16/08 13:24.
const EXP = new Date('2026-08-17T13:24:00Z');
const APRES_J3 = new Date('2026-08-14T13:30:00Z');   // juste après le seuil J-3 (à l'heure)
const APRES_H24 = new Date('2026-08-16T13:30:00Z');  // juste après le seuil 24 h
const RETARD_J3 = new Date('2026-08-14T15:24:00Z');  // 2 h après le seuil J-3 → en retard

const cand = (over: Partial<CandidatAlerteGed> = {}): CandidatAlerteGed => ({
  reponseId: 1, dossierId: 10, numDau: '0930012500081', communeNom: 'Paris',
  recuLe: new Date('2026-08-10T13:24:00Z'), expireLeCapte: EXP,
  aLienPerissable: true, liensPerissables: [{ url: 'https://ged.paris.fr/share/s/Tok/folder', mention: 'expire le 17/08' }],
  autresPermis: [], pieces: [], classe: false,
  deAdresse: 'no-reply@paris.fr', deNom: null, objet: 'Réponse', corpsTexte: 'lien', ...over,
});

function harness(candidats: CandidatAlerteGed[], opts: { maintenant?: Date; envoyerThrows?: boolean } = {}) {
  const journal: { reponseId: number; dossierId: number | null; type: string; enRetard: boolean }[] = [];
  const envois: { sujet: string; corps: string; attachments: { filename: string }[] }[] = [];
  const liensSignes: { cle: string; dureeS: number }[] = [];
  const contenusLus: string[] = [];
  const deps: DepsAlerteGed = {
    maintenant: () => opts.maintenant ?? APRES_J3,
    lireConfig: async () => ({ active: true, email: 'ops@sansvisavis.fr' }),
    chargerCandidats: async () => candidats,
    dejaEnvoyes: async (rid, did) => journal.filter((j) => j.reponseId === rid && (j.dossierId ?? 0) === (did ?? 0)).map((j) => j.type as 'j3' | 'h24'),
    lienSigne: async (cle, dureeS) => { liensSignes.push({ cle, dureeS }); return `https://s3/signed?cle=${cle}`; },
    lireContenuPiece: async (cle) => { contenusLus.push(cle); return Buffer.from('XX'); },
    envoyer: async (m) => { if (opts.envoyerThrows) throw new Error('SMTP down'); envois.push({ sujet: m.sujet, corps: m.corps, attachments: m.attachments }); },
    journaliser: async (e) => { journal.push({ reponseId: e.reponseId, dossierId: e.dossierId, type: e.type, enRetard: e.enRetard }); },
  };
  return { deps, journal, envois, liensSignes, contenusLus };
}

describe('G1 — executerAlerteGedAuto : preuves fondateur', () => {
  it('une alerte n’est JAMAIS envoyée deux fois (idempotence par réponse × permis × type)', async () => {
    const h = harness([cand()], { maintenant: APRES_J3 });
    const b1 = await executerAlerteGedAuto(h.deps);
    const b2 = await executerAlerteGedAuto(h.deps); // seconde passe, même instant
    expect(b1.envoyees).toBe(1);
    expect(b2.envoyees).toBe(0);           // déjà journalisée → pas de renvoi
    expect(h.envois).toHaveLength(1);
  });

  it('un permis CLASSÉ éteint SON rappel sans éteindre celui des autres permis du même message', async () => {
    const trois = [cand({ dossierId: 10, numDau: 'A', classe: true }), cand({ dossierId: 11, numDau: 'B' }), cand({ dossierId: 12, numDau: 'C' })];
    const h = harness(trois, { maintenant: APRES_J3 });
    const b = await executerAlerteGedAuto(h.deps);
    expect(b.envoyees).toBe(2); // B et C, pas A (classé)
    expect(h.envois.every((e) => !e.sujet.includes('N°A'))).toBe(true);
    expect(h.envois.some((e) => e.sujet.includes('N°B'))).toBe(true);
    expect(h.envois.some((e) => e.sujet.includes('N°C'))).toBe(true);
  });

  it('le seuil J-3 et le seuil 24 h partent CHACUN une fois (deux passes)', async () => {
    const h = harness([cand()]);
    (h.deps as { maintenant: () => Date }).maintenant = () => APRES_J3;
    const b1 = await executerAlerteGedAuto(h.deps);
    (h.deps as { maintenant: () => Date }).maintenant = () => APRES_H24;
    const b2 = await executerAlerteGedAuto(h.deps);
    expect(b1.envoyees).toBe(1);
    expect(b2.envoyees).toBe(1);
    expect(h.envois[0].sujet).toContain('DOSSIER A TELECHARGER'); // J-3
    expect(h.envois[1].sujet).toContain('24H POUR TELECHARGER');  // 24 h
    expect(h.journal.map((j) => j.type).sort()).toEqual(['h24', 'j3']);
  });

  it('une pièce au-dessus du seuil produit un LIEN SIGNÉ de durée suffisante (≥ 72 h), pas un échec SMTP', async () => {
    const lourde = cand({ aLienPerissable: false, liensPerissables: [], pieces: [{ nomFichier: 'gros.zip', tailleOctets: 30 * 1024 * 1024, cleStockage: 'entrantes/1/gros.zip', typeMime: 'application/zip' }] });
    const h = harness([lourde], { maintenant: APRES_J3 });
    const b = await executerAlerteGedAuto(h.deps);
    expect(b.envoyees).toBe(1);
    expect(b.erreurs).toBe(0);                       // AUCUN échec SMTP (la grosse pièce n'est pas jointe)
    expect(h.liensSignes).toHaveLength(1);
    expect(h.liensSignes[0].dureeS).toBeGreaterThanOrEqual(DUREE_LIEN_SIGNE_MIN_S); // ≥ 72 h
    expect(h.contenusLus).toHaveLength(0);           // pas de lecture pour joindre : on a lié
    expect(h.envois[0].attachments).toHaveLength(0); // rien joint (trop lourd)
    expect(h.envois[0].corps).toContain('https://s3/signed?cle=entrantes/1/gros.zip');
  });

  it('une alerte dont le seuil est passé pendant une interruption part à la passe suivante et est marquée EN RETARD', async () => {
    const h = harness([cand()], { maintenant: RETARD_J3 }); // 2 h après le seuil J-3
    const b = await executerAlerteGedAuto(h.deps);
    expect(b.envoyees).toBe(1);
    expect(b.enRetard).toBe(1);
    expect(h.journal[0].enRetard).toBe(true);
    expect(h.envois[0].corps).toContain('EN RETARD');
  });

  it('petite pièce → jointe (relue du stockage) ; désactivé / sans e-mail → rien', async () => {
    const petite = cand({ aLienPerissable: false, liensPerissables: [], pieces: [{ nomFichier: 'a.pdf', tailleOctets: 1024, cleStockage: 'entrantes/1/a.pdf', typeMime: 'application/pdf' }] });
    const h = harness([petite], { maintenant: APRES_J3 });
    await executerAlerteGedAuto(h.deps);
    expect(h.contenusLus).toEqual(['entrantes/1/a.pdf']);
    expect(h.envois[0].attachments).toHaveLength(1);

    const off = harness([cand()], { maintenant: APRES_J3 });
    off.deps.lireConfig = async () => ({ active: false, email: 'ops@x.fr' });
    expect((await executerAlerteGedAuto(off.deps)).envoyees).toBe(0);
  });
});
