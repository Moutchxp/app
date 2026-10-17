import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELAI_MAX_ATTENTE_PHOTO_MS, emettreApresPhoto } from './photoAvantEmission';

/**
 * 🔴 LOT CERTIFICAT-PHOTO — l'émission attend la fin du dépôt de la photo (le certificat, immuable, recopie `photo_cle`
 * au moment de l'émission). Défaut de production : l'internaute connecté émettait AVANT la fin du dépôt (a285cedc).
 */
const differe = () => {
  let finir!: () => void;
  let rater!: () => void;
  const p = new Promise<void>((ok, ko) => { finir = ok; rater = () => ko(new Error('réseau')); });
  return { p, finir, rater };
};
const tic = () => new Promise((r) => setTimeout(r, 0));

describe('emettreApresPhoto', () => {
  it('🔴 n’émet PAS tant que le dépôt de la photo n’est pas terminé, puis émet', async () => {
    const depot = differe();
    const ordre: string[] = [];
    const fini = emettreApresPhoto(depot.p.then(() => { ordre.push('photo'); }), async () => { ordre.push('émission'); return true; });
    await tic(); await tic();
    expect(ordre).toEqual([]);
    depot.finir();
    expect(await fini).toBe(true);
    expect(ordre).toEqual(['photo', 'émission']);
  });
  it('dépôt en échec : le certificat part quand même (la photo est annexe)', async () => {
    const depot = differe();
    const fini = emettreApresPhoto(depot.p, async () => true);
    depot.rater();
    expect(await fini).toBe(true);
  });
  it('dépôt bloqué : le certificat part au bout du délai maximal, jamais bloqué', async () => {
    let delaiDemande = 0;
    const r = await emettreApresPhoto(new Promise(() => {}), async () => true, DELAI_MAX_ATTENTE_PHOTO_MS,
      async (ms) => { delaiDemande = ms; });
    expect(r).toBe(true);
    expect(delaiDemande).toBe(30_000);
  });
  it('aucun dépôt en cours (pas de photo) : émission immédiate, comme avant', async () => {
    let attendu = false;
    expect(await emettreApresPhoto(null, async () => true, 10, async () => { attendu = true; })).toBe(true);
    expect(attendu).toBe(false);
  });
});

describe('câblage de la page du tunnel', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('le dépôt de la photo est MÉMORISÉ (plus de `void deposerPhoto`) et toute émission passe par l’attente', () => {
    expect(page).not.toContain('void deposerPhoto(');
    expect(page).toContain('depotPhotoRef.current = deposerPhoto(jetonEmi, projetId, photo)');
    expect(page).toContain('emettreApresPhoto(depotPhotoRef.current, () => emettreCertificatMaintenant(jeton, projetId))');
    // Les trois émissions (écran B, projet créé en B, connecté sans écrans A/B) appellent `emettreCertificat`, jamais
    // la version sans attente.
    expect(page.match(/emettreCertificatMaintenant\(/g)).toHaveLength(1);
    expect(page.match(/void emettreCertificat\(/g)?.length).toBe(3);
  });
  it('projet créé en B : sa photo est déposée avant l’émission', () => {
    expect(page).toContain('if (photo) depotPhotoRef.current = deposerPhoto(jetonEmissionB, projetIdB, photo); void emettreCertificat(jetonEmissionB, projetIdB);');
  });
});
