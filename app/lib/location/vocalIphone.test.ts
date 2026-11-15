import { describe, expect, it, vi } from 'vitest';
import { dispositionPiece, lirePlage } from './plageOctets';
import { appliquerGain, CIBLE_CRETE_DBFS, crete, encoderWav, FREQUENCE_NORMALISEE, gainPourCrete, GAIN_MAX, normaliserPrise } from './normalisationVocal';
import { CONTRAINTES_MICRO, libererMicro, ouvrirEnregistreur } from './enregistreurVocal';
import { libelleJournalVocaux, refusContenuAudio } from './vocauxCompteRendu';

/** 🔴🔴 Arno (15/11/2026, 9e retour du test iPhone) — lire un son sur l'iPhone ; le même niveau d'une prise à l'autre. */
describe('lire un son servi par le serveur (iPhone : plages, inline)', () => {
  it('les plages demandées : début, fin, « -N » ; hors taille : 416 ; sans plage : tout', () => {
    expect(lirePlage(null, 100)).toBeNull();
    expect(lirePlage('bytes=0-1', 100)).toEqual({ debut: 0, fin: 1 });
    expect(lirePlage('bytes=10-', 100)).toEqual({ debut: 10, fin: 99 });
    expect(lirePlage('bytes=90-500', 100)).toEqual({ debut: 90, fin: 99 });
    expect(lirePlage('bytes=-20', 100)).toEqual({ debut: 80, fin: 99 });
    expect(lirePlage('bytes=100-', 100)).toBe('invalide');
    expect(lirePlage('bytes=5-2', 100)).toBe('invalide');
    expect(lirePlage('bytes=0-1,5-6', 100)).toBeNull();
  });
  it('un son ou une image : « inline » ; un PDF : pièce jointe', () => {
    expect(dispositionPiece('audio/mp4', 'Vocal-1.m4a')).toBe('inline; filename="Vocal-1.m4a"');
    expect(dispositionPiece('image/jpeg', 'p.jpg')).toBe('inline; filename="p.jpg"');
    expect(dispositionPiece('application/pdf', 'a"b.pdf')).toBe('attachment; filename="a_b.pdf"');
  });
});

describe('les mêmes réglages du micro à CHAQUE ouverture', () => {
  it('contrôle automatique du gain, annulation d’écho et réduction de bruit COUPÉS ; une voie ; 48 kHz ; identiques à la réouverture', async () => {
    expect(CONTRAINTES_MICRO).toEqual({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48_000 } } });
    const demandes: unknown[] = [];
    class MR { static isTypeSupported = (t: string) => t === 'audio/mp4'; mimeType = 'audio/mp4'; state = 'inactive'; }
    const env = { securise: true, MediaRecorder: MR as never,
      mediaDevices: { getUserMedia: vi.fn(async (c: MediaStreamConstraints) => { demandes.push(c); return { getTracks: () => [{ stop: () => {}, readyState: 'live' }] } as never; }) } };
    libererMicro();
    expect((await ouvrirEnregistreur(env)).ok).toBe(true);
    libererMicro(); // arrière-plan, ou une écoute
    expect((await ouvrirEnregistreur(env)).ok).toBe(true);
    expect(demandes).toEqual([CONTRAINTES_MICRO, CONTRAINTES_MICRO]);
    libererMicro();
  });
});

describe('la normalisation de chaque prise (crête à −1 dBFS)', () => {
  it('le gain porte la crête à −1 dBFS ; plafonné ; une prise silencieuse n’est pas touchée', () => {
    const cible = 10 ** (CIBLE_CRETE_DBFS / 20);
    expect(gainPourCrete(0.1)).toBeCloseTo(cible / 0.1, 10);
    expect(gainPourCrete(0.9)).toBeCloseTo(cible / 0.9, 10);
    expect(gainPourCrete(0.001)).toBe(GAIN_MAX);
    expect(gainPourCrete(0)).toBe(1);
    const x = appliquerGain(new Float32Array([0.1, -0.05, 0.02]), gainPourCrete(0.1));
    expect(crete(x)).toBeCloseTo(cible, 6);
  });
  it('un WAV 16 bits mono lisible (en-tête RIFF/WAVE, fréquence, données) — reconnu comme un vrai son par le serveur', () => {
    const w = encoderWav(new Float32Array(400).map((_, i) => Math.sin(i / 5) * 0.5), FREQUENCE_NORMALISEE);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4), ...w.subarray(8, 12))).toBe('RIFFWAVE');
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 16_000, 16, 800]);
    expect(w.byteLength).toBe(844);
    expect(refusContenuAudio(w)).toBeNull();
  });
  it('dans le navigateur : décodée, une voie à 16 kHz, crête à −1 dBFS, rangée en WAV ; sans décodeur : null (la prise reste telle quelle)', async () => {
    const signal = new Float32Array(16_000).map((_, i) => Math.sin(i / 7) * 0.2);
    class Faux {
      constructor(public voies: number, public longueur: number, public frequence: number) {}
      decodeAudioData(_b: ArrayBuffer) { return Promise.resolve({ duration: 1, getChannelData: () => signal } as unknown as AudioBuffer); }
      createBufferSource() { return { buffer: null, connect: () => {}, start: () => {} }; }
      get destination() { return {}; }
      startRendering() { return Promise.resolve({ getChannelData: () => signal.slice(0, this.longueur) } as unknown as AudioBuffer); }
    }
    const n = await normaliserPrise(new Blob([new Uint8Array(10)]), Faux as never);
    expect(n).not.toBeNull();
    expect(n!.type).toBe('audio/wav');
    expect(n!.gain).toBeCloseTo(10 ** (-1 / 20) / crete(signal), 6);
    const o = new Uint8Array(await n!.blob.arrayBuffer());
    const v = new DataView(o.buffer);
    let max = 0; for (let i = 44; i < o.byteLength; i += 2) max = Math.max(max, Math.abs(v.getInt16(i, true)));
    expect(max / 0x7fff).toBeCloseTo(10 ** (-1 / 20), 3);
    expect(await normaliserPrise(new Blob([new Uint8Array(10)]))).toBeNull(); // jsdom : pas de décodeur
  });
});

describe('le libellé du journal des vocaux (plus jamais « jamais envoyé(s) » à tort)', () => {
  it('dit combien de prises sont parties aux locataires et combien restent internes', () => {
    expect(libelleJournalVocaux(1, 0)).toBe('1 prise vocale du compte rendu de pré-visite — 1 interne');
    expect(libelleJournalVocaux(3, 2)).toBe('3 prises vocales du compte rendu de pré-visite — 2 envoyées aux locataires, 1 interne');
    expect(libelleJournalVocaux(2, 2)).toBe('2 prises vocales du compte rendu de pré-visite — 2 envoyées aux locataires');
    expect(libelleJournalVocaux(1, 1)).toBe('1 prise vocale du compte rendu de pré-visite — 1 envoyée aux locataires');
  });
});

/** un M4A comme ceux de l'iPhone : « ftyp », « moov », puis une boîte « mdat » de `donnees` octets (taille réelle d'une prise) */
function m4a(donnees: number, o: { fragmente?: boolean; tailleEtendue?: boolean; mdatVide?: boolean } = {}): Uint8Array {
  const boites: Uint8Array[] = [];
  const boite = (type: string, n: number, etendue = false): Uint8Array => {
    const entete = etendue ? 16 : 8; const b = new Uint8Array(entete + n); const v = new DataView(b.buffer);
    if (etendue) { v.setUint32(0, 1); v.setBigUint64(8, BigInt(entete + n)); } else v.setUint32(0, entete + n);
    for (let k = 0; k < 4; k++) b[4 + k] = type.charCodeAt(k);
    for (let k = entete; k < b.length; k++) b[k] = (k * 31) & 0xff;
    return b;
  };
  boites.push(boite('ftyp', 20), boite('moov', 400));
  if (o.fragmente) boites.push(boite('moof', 64));
  boites.push(boite('mdat', o.mdatVide ? 0 : donnees, o.tailleEtendue));
  const t = new Uint8Array(boites.reduce((n, b) => n + b.length, 0)); let i = 0; for (const b of boites) { t.set(b, i); i += b.length; }
  return t;
}
describe('🔴🔴 (15/11/2026, bug de l’envoi final) — la vérification d’un son ne déborde JAMAIS, quelle que soit sa taille', () => {
  it('les tailles réelles des prises de l’iPhone (126 Ko — celle qui faisait tomber l’envoi —, 2 Mo, 14 Mo) : acceptées, sans débordement', () => {
    for (const n of [126_642, 2 * 1024 * 1024, 14 * 1024 * 1024]) expect(refusContenuAudio(m4a(n))).toBeNull();
  });
  it('MP4 fragmenté (« moof »), taille sur 64 bits : acceptés ; aucune donnée (« mdat » vide) : refusé', () => {
    expect(refusContenuAudio(m4a(5000, { fragmente: true, mdatVide: true }))).toBeNull();
    expect(refusContenuAudio(m4a(5000, { tailleEtendue: true }))).toBeNull();
    expect(refusContenuAudio(m4a(5000, { mdatVide: true }))).toBe('L’enregistrement ne contient aucun son : réenregistrez la prise.');
  });
});

describe('🔴 le message d’une écriture qui échoue dit la vraie panne', async () => {
  const { erreurDeLaBase, messageEcritureImpossible, MOTIF_BASE_INJOIGNABLE, MOTIF_ERREUR_SERVEUR } = await import('./erreurEcriture');
  it('la base (code SQLSTATE, connexion, délai) : « la base n’a pas répondu » ; tout le reste : « erreur inattendue du serveur »', () => {
    expect(erreurDeLaBase(Object.assign(new Error('relation absente'), { code: '42P01' }))).toBe(true);
    expect(erreurDeLaBase(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(erreurDeLaBase(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(messageEcritureImpossible(new RangeError('Maximum call stack size exceeded'))).toBe(MOTIF_ERREUR_SERVEUR);
    expect(messageEcritureImpossible(Object.assign(new Error('x'), { code: '57014' }))).toBe(MOTIF_BASE_INJOIGNABLE);
    expect(MOTIF_ERREUR_SERVEUR).toContain('la base n’est pas en cause');
  });
});
