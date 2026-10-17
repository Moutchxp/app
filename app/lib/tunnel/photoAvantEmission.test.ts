import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DELAI_MAX_ATTENTE_PHOTO_MS, emettreApresPhoto, MESSAGE_ENVOI_PHOTO } from './photoAvantEmission';

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
    const r = await emettreApresPhoto(new Promise(() => {}), async () => true,
      { delaiMs: DELAI_MAX_ATTENTE_PHOTO_MS, attendre: async (ms) => { delaiDemande = ms; } });
    expect(r).toBe(true);
    expect(delaiDemande).toBe(30_000);
  });
  it('aucun dépôt en cours (pas de photo) : émission immédiate, comme avant', async () => {
    let attendu = false;
    const signaux: boolean[] = [];
    expect(await emettreApresPhoto(null, async () => true, { delaiMs: 10, attendre: async () => { attendu = true; }, signaler: (x) => signaux.push(x) })).toBe(true);
    expect(attendu).toBe(false);
    expect(signaux).toEqual([]); // aucun dépôt : aucun message
  });
});

describe('🔴 le message « Envoi de votre photo… » pendant l’attente', () => {
  it('affiché quand l’attente commence, effacé JUSTE AVANT l’émission', async () => {
    const depot = differe();
    const journal: string[] = [];
    const fini = emettreApresPhoto(depot.p, async () => { journal.push('émission'); return true; },
      { signaler: (x) => journal.push(x ? 'message affiché' : 'message effacé') });
    await tic();
    expect(journal).toEqual(['message affiché']);
    depot.finir();
    await fini;
    expect(journal).toEqual(['message affiché', 'message effacé', 'émission']);
  });
  it('effacé aussi quand le dépôt échoue ou dépasse le délai', async () => {
    const signaux: boolean[] = [];
    await emettreApresPhoto(Promise.reject(new Error('réseau')), async () => true, { signaler: (x) => signaux.push(x) });
    await emettreApresPhoto(new Promise(() => {}), async () => true, { attendre: async () => {}, signaler: (x) => signaux.push(x) });
    expect(signaux).toEqual([true, false, true, false]);
  });
  it('le texte demandé par Arno', () => {
    expect(MESSAGE_ENVOI_PHOTO).toBe('Envoi de votre photo… merci de ne pas fermer l’application');
  });
});

describe('câblage de la page du tunnel', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('le dépôt de la photo est MÉMORISÉ (plus de `void deposerPhoto`) et toute émission passe par l’attente', () => {
    expect(page).not.toContain('void deposerPhoto(');
    expect(page).toContain('depotPhotoRef.current = deposerPhoto(jetonEmi, projetId, photo)');
    expect(page).toContain('emettreApresPhoto(depotPhotoRef.current, () => emettreCertificatMaintenant(jeton, projetId), { signaler: setEnvoiPhotoEnCours })');
    // Les trois émissions (écran B, projet créé en B, connecté sans écrans A/B) appellent `emettreCertificat`, jamais
    // la version sans attente.
    expect(page.match(/emettreCertificatMaintenant\(/g)).toHaveLength(1);
    expect(page.match(/void emettreCertificat\(/g)?.length).toBe(3);
  });
  it('l’écran « Demande validée » montre le message avec l’indicateur d’attente existant, tant que l’attente dure', () => {
    expect(page).toContain('{envoiPhotoEnCours && ( <div role="status" aria-live="polite" data-envoi-photo');
    expect(page).toContain('animate-spin rounded-full border-[3px] border-svv-red border-t-transparent" aria-hidden="true" /> <span className="text-base font-bold text-svv-ink">{MESSAGE_ENVOI_PHOTO}</span>');
  });
  it('projet créé en B : sa photo est déposée avant l’émission', () => {
    expect(page).toContain('if (photo) depotPhotoRef.current = deposerPhoto(jetonEmissionB, projetIdB, photo); void emettreCertificat(jetonEmissionB, projetIdB);');
  });
});
