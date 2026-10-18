import { describe, expect, it } from 'vitest';
import {
  ArretGlobal, deciderAdoption, estNatif, faireTravaillerOuvriers, jugerCopie, tailleStabilisee, type CopieTrouvee, type FicheFichier,
} from './copieScannesMoteur';
import { verifierCorbeilleCopie } from './driveGardeFou';

/**
 * 🔴 LE MOTEUR DE COPIE DE « Documents clients scannés », CORRIGÉ APRÈS L'ARRÊT DU 18/10/2026
 * (`docs/COPIE_ARCHIVE_ARRET_2026-10-18.md`). Sans réseau : chaque défaut constaté a son épreuve.
 */
const DOC = 'application/vnd.google-apps.document';
const PDF: FicheFichier = { nom: 'bail.pdf', mime: 'application/pdf', md5: 'aaa', taille: '100' };
const GDOC: FicheFichier = { nom: 'Mandat de location signé', mime: DOC, md5: null, taille: '19675' };
const sansAttente = async (): Promise<void> => {};

describe('b. le contrôle : md5 pour un fichier, type + nom + taille stabilisée pour un document Google', () => {
  it('un fichier ordinaire : md5 identique exigé — inchangé', () => {
    expect(jugerCopie(PDF, { ...PDF })).toEqual({ ok: true });
    expect(jugerCopie(PDF, { ...PDF, md5: 'bbb' })).toMatchObject({ ok: false, ecart: 'md5' });
    expect(jugerCopie({ ...PDF, md5: null }, { ...PDF, md5: null })).toMatchObject({ ok: false, ecart: 'md5' });
    // La taille ne remplace jamais le md5 d'un fichier ordinaire.
    expect(jugerCopie(PDF, { ...PDF, md5: null, taille: '100' })).toMatchObject({ ok: false, ecart: 'md5' });
  });

  it('a. le NOM EXACT est exigé, pour tous : « Copie de … » est un écart', () => {
    expect(jugerCopie(GDOC, { ...GDOC, nom: 'Copie de Mandat de location signé' })).toMatchObject({ ok: false, ecart: 'nom' });
    expect(jugerCopie(PDF, { ...PDF, nom: 'bail.pdf ' })).toMatchObject({ ok: false, ecart: 'nom' });
  });

  it('un document Google : même type, même nom, même taille ; aucune conversion admise', () => {
    expect(estNatif(DOC)).toBe(true);
    expect(estNatif('application/pdf')).toBe(false);
    expect(jugerCopie(GDOC, { ...GDOC })).toEqual({ ok: true });
    expect(jugerCopie(GDOC, { ...GDOC, mime: 'application/pdf' })).toMatchObject({ ok: false, ecart: 'type' });
    expect(jugerCopie(GDOC, { ...GDOC, taille: '1' })).toMatchObject({ ok: false, ecart: 'taille' });
    expect(jugerCopie({ ...GDOC, taille: null }, { ...GDOC, taille: null })).toMatchObject({ ok: false, ecart: 'taille' });
  });

  it('la taille d’un document Google est relue jusqu’à deux lectures identiques ÉGALES à la source (la provisoire « 1 » ne suffit pas)', async () => {
    const suite = ['1', '1', '19675', '19675', '19675'];
    let n = 0;
    const attentes: number[] = [];
    const r = await tailleStabilisee(async () => suite[n++] ?? null, '19675', async (ms) => { attentes.push(ms); });
    expect(r).toEqual({ stable: true, taille: '19675', lues: ['1', '1', '19675', '19675'] });
    expect(attentes).toHaveLength(4);
  });

  it('au plafond, sans deux lectures égales à la source : instable (donc écart), avec tout ce qui a été lu', async () => {
    const r = await tailleStabilisee(async () => '1', '19675', sansAttente, [1, 1, 1]);
    expect(r).toEqual({ stable: false, lues: ['1', '1', '1'] });
    const alterne = ['19675', '20000', '19675'];
    let k = 0;
    expect((await tailleStabilisee(async () => alterne[k++], '19675', sansAttente, [1, 1, 1])).stable).toBe(false);
  });
});

describe('c. arrêt global : le moindre écart arrête TOUS les ouvriers, et chaque motif est journalisé', () => {
  it('après l’écart, AUCUN nouvel élément n’est pris ; les deux écarts simultanés sont tous deux au journal', async () => {
    const pris: number[] = [];
    const journal: string[] = [];
    const elements = Array.from({ length: 100 }, (_, i) => i);
    const travail = async (e: number): Promise<'copie'> => {
      pris.push(e);
      await new Promise((r) => { setTimeout(r, 1); });
      if (e === 10 || e === 11) throw new Error(`ÉCART sur ${e}`);
      return 'copie';
    };
    const r = faireTravaillerOuvriers(elements, { parallele: 3, travail, journal: (l) => journal.push(l) });
    await expect(r).rejects.toBeInstanceOf(ArretGlobal);
    // Seuls les éléments déjà en vol au moment de l'arrêt ont pu finir : rien au-delà.
    expect(Math.max(...pris)).toBeLessThanOrEqual(12);
    expect(pris.length).toBeLessThan(15);
    expect(journal.filter((l) => l.startsWith('ARRÊT GLOBAL'))).toHaveLength(2);
    expect(journal.join('\n')).toContain('ÉCART sur 10');
    expect(journal.join('\n')).toContain('ÉCART sur 11');
  });

  it('le travail en cours voit l’arrêt (`arrete()`) avant d’écrire', async () => {
    const vus: boolean[] = [];
    const travail = async (e: number, arrete: () => boolean): Promise<'copie'> => {
      if (e === 0) throw new Error('refus du garde-fou');
      await new Promise((r) => { setTimeout(r, 2); });
      vus.push(arrete());
      return 'copie';
    };
    await expect(faireTravaillerOuvriers([0, 1, 2], { parallele: 3, travail, journal: () => {} })).rejects.toThrow('refus du garde-fou');
    expect(vus.every((v) => v)).toBe(true);
  });

  it('sans écart : tout est traité, rien n’est levé', async () => {
    const r = await faireTravaillerOuvriers([1, 2, 3, 4], { parallele: 3, travail: async () => 'copie', journal: () => {} });
    expect(r).toMatchObject({ traites: 4, copies: 4, borneAtteinte: false });
  });

  it('borne d’essai : on s’arrête proprement après N copies', async () => {
    const r = await faireTravaillerOuvriers(Array.from({ length: 50 }, (_, i) => i), { parallele: 1, maxCopies: 7, travail: async () => 'copie', journal: () => {} });
    expect(r).toMatchObject({ copies: 7, borneAtteinte: true });
  });
});

describe('d. le contrôle d’empreinte est RÉELLEMENT exécuté toutes les N copies, et un changement arrête tout', () => {
  it('appelé à 5, 10, 15 copies (les « sautés » ne comptent pas), ouvriers à l’arrêt pendant le contrôle', async () => {
    const appels: number[] = [];
    let copies = 0;
    let enVol = 0;
    const travail = async (e: number): Promise<'copie' | 'saute'> => {
      enVol += 1;
      await new Promise((r) => { setTimeout(r, 1); });
      enVol -= 1;
      if (e % 4 === 3) return 'saute';
      copies += 1;
      return 'copie';
    };
    const r = await faireTravaillerOuvriers(Array.from({ length: 21 }, (_, i) => i), {
      parallele: 1, controleToutes: 5, travail, journal: () => {},
      controle: async () => { expect(enVol).toBe(0); appels.push(copies); },
    });
    expect(appels).toEqual([5, 10, 15]);
    expect(r.controles).toBe(3);
  });

  it('une empreinte changée au contrôle : ARRÊT GLOBAL, plus aucune copie ensuite', async () => {
    const pris: number[] = [];
    const journal: string[] = [];
    const r = faireTravaillerOuvriers(Array.from({ length: 20 }, (_, i) => i), {
      parallele: 2, controleToutes: 4, journal: (l) => journal.push(l),
      travail: async (e) => { pris.push(e); return 'copie'; },
      controle: async () => { throw new Error('EMPREINTE CHANGÉE'); },
    });
    await expect(r).rejects.toBeInstanceOf(ArretGlobal);
    expect(pris).toHaveLength(4);
    expect(journal[0]).toContain('contrôle d’empreinte : EMPREINTE CHANGÉE');
  });
});

describe('e. reprise : une copie retrouvée par son étiquette est REVÉRIFIÉE avant d’être adoptée', () => {
  const src = { ...PDF, id: 's1', modifie: '2025-01-01T00:00:00Z' };
  const trouvee = (o: Partial<CopieTrouvee> = {}): CopieTrouvee => ({ ...PDF, id: 'c1', sourceId: 's1', sourceModifie: src.modifie, ...o });

  it('aucune copie → copier ; une conforme → adopter', () => {
    expect(deciderAdoption(src, [])).toEqual({ action: 'copier' });
    expect(deciderAdoption(src, [trouvee({ sourceId: 'autre' })])).toEqual({ action: 'copier' });
    expect(deciderAdoption(src, [trouvee({ sourceModifie: 'autre version' })])).toEqual({ action: 'copier' });
    expect(deciderAdoption(src, [trouvee()])).toEqual({ action: 'adopter', id: 'c1' });
  });

  it('une NON conforme (nom « Copie de … », md5, taille) n’est JAMAIS adoptée, et rien n’est recopié à côté : arrêt', () => {
    expect(deciderAdoption(src, [trouvee({ nom: 'Copie de bail.pdf' })]).action).toBe('arreter');
    expect(deciderAdoption(src, [trouvee({ md5: 'zzz' })]).action).toBe('arreter');
    const gsrc = { ...GDOC, id: 'g', modifie: 'm' };
    expect(deciderAdoption(gsrc, [{ ...GDOC, id: 'c', sourceId: 'g', sourceModifie: 'm', nom: 'Copie de Mandat de location signé' }]).action).toBe('arreter');
    expect(deciderAdoption(gsrc, [{ ...GDOC, id: 'c', sourceId: 'g', sourceModifie: 'm' }])).toEqual({ action: 'adopter', id: 'c' });
  });

  it('deux copies pour la même source et la même version : doublon → arrêt', () => {
    expect(deciderAdoption(src, [trouvee(), trouvee({ id: 'c2' })])).toMatchObject({ action: 'arreter' });
  });
});

describe('🔴 la corbeille d’une copie fautive : étroite, sur liste, sous le dossier de copie seulement', () => {
  const CTX = { autorises: new Set(['fautive-1']), racineCopieId: 'cp', scannesId: 'scannes', interdits: new Set(['arrivee']) };
  const sous = [{ id: 'proprio', nom: 'Propriétaire' }, { id: 'actifs', nom: '1 actifs' }, { id: 'cp', nom: 'Import Documents clients scannés – copie du 18-10-2026' }, { id: 'racine', nom: 'Base de données locative' }];
  const ok = { cibleId: 'fautive-1', cibleMime: DOC, chaine: sous };

  it('autorisée : listée, fichier, sous le dossier de copie', () => {
    expect(verifierCorbeilleCopie(ok, CTX)).toEqual({ ok: true });
  });

  it.each([
    ['hors liste', { cibleId: 'autre' }],
    ['un dossier', { cibleMime: 'application/vnd.google-apps.folder' }],
    ['un raccourci', { cibleMime: 'application/vnd.google-apps.shortcut' }],
    ['chaîne inconnue', { chaine: [] }],
    ['hors du dossier de copie', { chaine: [{ id: 'x', nom: 'Biens' }, { id: 'racine', nom: 'Base de données locative' }] }],
    ['dans « Documents clients scannés »', { chaine: [{ id: 'p', nom: 'Propriétaire' }, { id: 'scannes', nom: 'Documents clients scannés' }] }],
    ['sous un dossier du nom protégé', { chaine: [...sous.slice(0, 2), { id: 'y', nom: 'documents clients scannes' }, ...sous.slice(2)] }],
    ['dans « 00 Arrivée des mails »', { chaine: [{ id: 'arrivee', nom: '00 Arrivée des mails' }, ...sous.slice(2)] }],
  ])('refusée : %s', (_cas, ecart) => {
    expect(verifierCorbeilleCopie({ ...ok, ...ecart }, CTX).ok).toBe(false);
  });

  it('« Documents clients scannés » lui-même n’est jamais une cible, même listé', () => {
    expect(verifierCorbeilleCopie({ ...ok, cibleId: 'scannes' }, { ...CTX, autorises: new Set(['scannes']) }).ok).toBe(false);
  });
});
