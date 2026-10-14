import { describe, expect, it, vi } from 'vitest';
import {
  cleUnite, controler, ETAT_VIDE, executer, lireEtat, lireReglages, planifier, planifierEchecUnite, REGLAGES_DEFAUT,
  rendreEssai, type Controles, type Etat, type EtatUnite, type Mail, type Sondes,
} from './surveillance';

// Horloge simulée : 14/10/2026 10:00 heure de Paris (UTC+2) — la même quel que soit le fuseau du processus.
const T0 = new Date('2026-10-14T08:00:00Z');
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
const H = 60;
const SANS_RECAP = { ...REGLAGES_DEFAUT, recapQuotidien: false };

const ACTIF: EtatUnite = { charge: 'loaded', actif: 'active', sousEtat: 'running', fichier: 'enabled' };
const ABSENT: EtatUnite = { charge: 'not-found', actif: 'inactive', sousEtat: 'dead', fichier: '' };

/** Un serveur en parfaite santé, automatismes NON installés (la situation d'avant bascule). */
function sondesSaines(maintenant: Date, surcharges: Partial<Sondes> = {}, unites: Record<string, EtatUnite> = {}): Sondes {
  return {
    etatUnite: async (u) => unites[u] ?? (u.startsWith('svav-') && u !== 'svav-next.service' && u !== 'svav-minio.service' ? ABSENT : ACTIF),
    unitesSvavEnEchec: async () => [],
    site: async () => ({ statut: 200, dureeMs: 420 }),
    certificat: async () => ({ expireLe: plus(maintenant, 60 * 24 * H) }),
    derniereSauvegardeLocale: async () => plus(maintenant, -6 * H),
    estMonte: async () => true,
    derniereSauvegardeOvh: async () => plus(maintenant, -5 * H),
    occupation: async () => 0.42,
    base: async () => ({ derniereReleveOk: plus(maintenant, -1) }),
    ...surcharges,
  };
}

const cles = (c: Controles) => c.problemes.map((p) => p.cle).sort();

describe('controler', () => {
  it('serveur sain, automatismes non installés : aucun problème, automatismes « non concernés »', async () => {
    const c = await controler(sondesSaines(T0), REGLAGES_DEFAUT, T0);
    expect(c.problemes).toEqual([]);
    expect(c.lignes.filter((l) => l.ok === null).map((l) => l.quoi)).toEqual(
      ['Relève Gestion', 'Veille', 'Empreintes Drive', 'Statistiques', 'Relève Gestion (fraîcheur)']);
  });

  it('un automatisme installé mais non activé n\'est pas une alerte', async () => {
    const c = await controler(sondesSaines(T0, {}, { 'svav-veille.timer': { charge: 'loaded', actif: 'inactive', sousEtat: 'dead', fichier: 'disabled' } }), REGLAGES_DEFAUT, T0);
    expect(c.problemes).toEqual([]);
  });

  it('un automatisme activé mais arrêté est une alerte ; la relève activée est contrôlée en fraîcheur', async () => {
    const base = vi.fn(async () => ({ derniereReleveOk: plus(T0, -23) }));
    const c = await controler(sondesSaines(T0, { base }, {
      'svav-veille.timer': { charge: 'loaded', actif: 'inactive', sousEtat: 'dead', fichier: 'enabled' },
      'svav-gestion-continu.service': ACTIF,
    }), REGLAGES_DEFAUT, T0);
    expect(base).toHaveBeenCalledWith(true);
    expect(cles(c)).toEqual(['releve', 'unite:svav-veille.timer']);
    expect(c.problemes.find((p) => p.cle === 'releve')?.titre).toBe('Relève Gestion : aucune passe réussie depuis 23 min');
  });

  it('relève non activée : la base est sondée sans lire le journal de relève', async () => {
    const base = vi.fn(async () => ({ derniereReleveOk: null }));
    await controler(sondesSaines(T0, { base }), REGLAGES_DEFAUT, T0);
    expect(base).toHaveBeenCalledWith(false);
  });

  it('services essentiels arrêtés ou absents', async () => {
    const c = await controler(sondesSaines(T0, {}, {
      'svav-next.service': { charge: 'loaded', actif: 'failed', sousEtat: 'failed', fichier: 'enabled' },
      'caddy.service': ABSENT,
    }), REGLAGES_DEFAUT, T0);
    expect(c.problemes.map((p) => p.titre)).toEqual(['Service svav-next arrêté (failed)', 'Service caddy introuvable']);
  });

  it('une unité svav-* en échec déjà signalée par son service ne fait pas un second problème', async () => {
    const c = await controler(sondesSaines(T0, { unitesSvavEnEchec: async () => ['svav-next.service', 'svav-veille.service'] }, {
      'svav-next.service': { charge: 'loaded', actif: 'failed', sousEtat: 'failed', fichier: 'enabled' },
    }), REGLAGES_DEFAUT, T0);
    expect(cles(c)).toEqual(['unite:svav-next.service', 'unite:svav-veille.service']);
  });

  it('site : injoignable, en erreur, lent (10 s est déjà trop)', async () => {
    const titre = async (site: Sondes['site']) => (await controler(sondesSaines(T0, { site }), REGLAGES_DEFAUT, T0)).problemes[0]?.titre;
    expect(await titre(async () => ({ statut: null, dureeMs: 10_000, erreur: 'timeout' }))).toBe('Site injoignable');
    expect(await titre(async () => ({ statut: 502, dureeMs: 80 }))).toBe('Site en erreur (HTTP 502)');
    expect(await titre(async () => ({ statut: 200, dureeMs: 10_000 }))).toBe('Site lent (10,0 s)');
    expect(await titre(async () => ({ statut: 200, dureeMs: 9_999 }))).toBeUndefined();
  });

  it('certificat : alerte à 14 jours ou moins, et s\'il est invalide', async () => {
    const titre = async (certificat: Sondes['certificat']) => (await controler(sondesSaines(T0, { certificat }), REGLAGES_DEFAUT, T0)).problemes[0]?.titre;
    expect(await titre(async () => ({ expireLe: plus(T0, 15 * 24 * H) }))).toBeUndefined();
    expect(await titre(async () => ({ expireLe: plus(T0, 14 * 24 * H) }))).toBe('Certificat https expire dans 14 jours');
    expect(await titre(async () => ({ expireLe: plus(T0, -H) }))).toBe('Certificat https expiré');
    expect(await titre(async () => ({ expireLe: null, erreur: 'ECONNREFUSED' }))).toBe('Certificat https invalide');
  });

  it('sauvegardes : plus de 26 h, absentes, espace OVH non monté (sans double alerte)', async () => {
    const c = await controler(sondesSaines(T0, {
      derniereSauvegardeLocale: async () => plus(T0, -27 * H),
      derniereSauvegardeOvh: async () => null,
    }), REGLAGES_DEFAUT, T0);
    expect(c.problemes.map((p) => p.titre)).toEqual(['Sauvegarde locale absente depuis 27 h', 'Sauvegarde Roubaix introuvable']);

    const nonMonte = await controler(sondesSaines(T0, { estMonte: async () => false, derniereSauvegardeOvh: async () => { throw new Error('ne doit pas être lu'); } }), REGLAGES_DEFAUT, T0);
    expect(cles(nonMonte)).toEqual(['ovh-monte']);

    const limite = await controler(sondesSaines(T0, { derniereSauvegardeLocale: async () => plus(T0, -26 * H + 1) }), REGLAGES_DEFAUT, T0);
    expect(limite.problemes).toEqual([]);
  });

  it('disques : au-delà de 85 %', async () => {
    const c = await controler(sondesSaines(T0, { occupation: async (ch) => (ch === '/' ? 0.91 : 0.86) }), REGLAGES_DEFAUT, T0);
    expect(c.problemes.map((p) => p.titre)).toEqual(['Disque / plein à 91 %', 'Espace OVH plein à 86 %']);
    expect((await controler(sondesSaines(T0, { occupation: async () => 0.85 }), REGLAGES_DEFAUT, T0)).problemes).toEqual([]);
  });

  it('base injoignable, et une sonde qui plante ne fait pas planter la passe', async () => {
    const c = await controler(sondesSaines(T0, {
      base: async () => { throw new Error('connect ECONNREFUSED'); },
      site: async () => { throw new Error('boum'); },
    }), REGLAGES_DEFAUT, T0);
    expect(c.problemes.map((p) => p.titre)).toEqual(['Contrôle impossible : Site', 'PostgreSQL ne répond pas']);
  });
});

describe('anti-avalanche', () => {
  const machine = 'svav-ovh';
  const c = (...p: [string, string][]): Controles => ({ lignes: [], problemes: p.map(([cle, titre]) => ({ cle, titre, detail: `détail ${cle}` })) });
  const appliquerTout = (e: Etat, envois: ReturnType<typeof planifier>) => envois.reduce((acc, x) => x.appliquer(acc), e);

  it('apparition → un mail ; 5 min après → rien ; 6 h après → rappel ; disparition → résolu', () => {
    const probleme = c(['sauvegarde-roubaix', 'Sauvegarde Roubaix absente depuis 27 h']);
    const e0 = lireEtat(null);
    const p1 = planifier(e0, probleme, T0, SANS_RECAP, machine);
    expect(p1.map((x) => x.mail.sujet)).toEqual(['[SVAV serveur] ⚠ Sauvegarde Roubaix absente depuis 27 h']);
    const e1 = appliquerTout(e0, p1);

    expect(planifier(e1, probleme, plus(T0, 5), SANS_RECAP, machine)).toEqual([]);
    expect(planifier(e1, probleme, plus(T0, 6 * H - 1), SANS_RECAP, machine)).toEqual([]);
    const p2 = planifier(e1, probleme, plus(T0, 6 * H), SANS_RECAP, machine);
    expect(p2[0].mail.sujet).toBe('[SVAV serveur] ⚠ Toujours en cours : Sauvegarde Roubaix absente depuis 27 h');
    const e2 = appliquerTout(e1, p2);
    expect(e2.problemes['sauvegarde-roubaix'].depuis).toBe(T0.toISOString());
    expect(planifier(e2, probleme, plus(T0, 6 * H + 5), SANS_RECAP, machine)).toEqual([]);

    const p3 = planifier(e2, c(), plus(T0, 7 * H), SANS_RECAP, machine);
    expect(p3[0].mail.sujet).toBe('[SVAV serveur] ✅ Résolu : Sauvegarde Roubaix absente depuis 27 h');
    expect(appliquerTout(e2, p3).problemes).toEqual({});
  });

  it('plusieurs événements d\'une même passe → un seul mail', () => {
    const e1 = appliquerTout(lireEtat(null), planifier(lireEtat(null), c(['site', 'Site injoignable']), T0, SANS_RECAP, machine));
    const p = planifier(e1, c(['disque-racine', 'Disque / plein à 91 %'], ['base', 'PostgreSQL ne répond pas']), plus(T0, 5), SANS_RECAP, machine);
    expect(p).toHaveLength(1);
    expect(p[0].mail.sujet).toBe('[SVAV serveur] ⚠ 2 problèmes : Disque / plein à 91 % ; PostgreSQL ne répond pas (+ 1 résolu)');
    expect(p[0].mail.corps).toContain('RÉSOLU :');
    expect(Object.keys(appliquerTout(e1, p).problemes).sort()).toEqual(['base', 'disque-racine']);
  });

  it('récapitulatif quotidien : une fois par jour, à partir de 8 h heure de Paris, désactivable', () => {
    const avant8h = new Date('2026-10-14T05:55:00Z'); // 07:55 à Paris
    const a8h = new Date('2026-10-14T06:00:00Z'); // 08:00 à Paris
    expect(planifier(lireEtat(null), c(), avant8h, REGLAGES_DEFAUT, machine)).toEqual([]);
    const p = planifier(lireEtat(null), c(), a8h, REGLAGES_DEFAUT, machine);
    expect(p.map((x) => x.mail.sujet)).toEqual(['[SVAV serveur] Récapitulatif du 14/10/2026 : tout va bien']);
    const e = appliquerTout(lireEtat(null), p);
    expect(e.dernierRecap).toBe('2026-10-14');
    expect(planifier(e, c(), plus(a8h, 5 * H), REGLAGES_DEFAUT, machine)).toEqual([]);
    expect(planifier(e, c(), plus(a8h, 24 * H), REGLAGES_DEFAUT, machine)).toHaveLength(1);
    expect(planifier(lireEtat(null), c(), a8h, { ...REGLAGES_DEFAUT, recapQuotidien: false }, machine)).toEqual([]);
    const enCours = planifier(e, c(['base', 'PostgreSQL ne répond pas']), plus(a8h, 24 * H), REGLAGES_DEFAUT, machine);
    expect(enCours.map((x) => x.mail.sujet)).toEqual([
      '[SVAV serveur] ⚠ PostgreSQL ne répond pas',
      '[SVAV serveur] Récapitulatif du 15/10/2026 : 1 problème en cours',
    ]);
  });

  it('échec d\'unité (OnFailure) : mail immédiat avec le journal, puis le contrôle périodique ne le redouble pas', () => {
    const e = planifierEchecUnite(lireEtat(null), 'svav-veille.service', 'ligne 1\nligne 30', T0, machine);
    expect(e?.mail.sujet).toBe('[SVAV serveur] ⚠ Échec de svav-veille.service');
    expect(e?.mail.corps).toContain('ligne 30');
    const e1 = e!.appliquer(lireEtat(null));
    expect(Object.keys(e1.problemes)).toEqual([cleUnite('svav-veille.service')]);

    // Passe suivante : l'unité est toujours en échec → pas de nouveau mail ; un nouvel échec dans les 6 h → rien.
    const toujours = c([cleUnite('svav-veille.service'), 'Unité svav-veille.service en échec']);
    expect(planifier(e1, toujours, plus(T0, 5), SANS_RECAP, machine)).toEqual([]);
    expect(planifierEchecUnite(e1, 'svav-veille.service', '', plus(T0, 15), machine)).toBeNull();
    expect(planifierEchecUnite(e1, 'svav-veille.service', '', plus(T0, 6 * H), machine)).not.toBeNull();
    // Unité revenue → résolu.
    expect(planifier(e1, c(), plus(T0, 20), SANS_RECAP, machine)[0].mail.sujet).toBe('[SVAV serveur] ✅ Résolu : Échec de svav-veille.service');
  });

  it('cleUnite : même clé pour « svav-next » et « svav-next.service »', () => {
    expect(cleUnite('svav-next')).toBe(cleUnite('svav-next.service'));
    expect(cleUnite('svav-veille.timer')).toBe('unite:svav-veille.timer');
  });
});

describe('executer', () => {
  const planUn = (etat: Etat, at: Date) => planifier(etat, { lignes: [], problemes: [{ cle: 'site', titre: 'Site injoignable', detail: '' }] }, at, SANS_RECAP, 'm');

  it('mail parti → état mis à jour', async () => {
    const envoyes: Mail[] = [];
    const e = await executer(lireEtat(null), planUn(lireEtat(null), T0), async (m) => { envoyes.push(m); }, T0, () => undefined);
    expect(envoyes).toHaveLength(1);
    expect(e.problemes.site).toBeDefined();
  });

  it('échec d\'envoi → journal, problème non enregistré, plus aucun essai pendant 30 min, puis nouvel essai', async () => {
    const journal: string[] = [];
    const expedier = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const e1 = await executer(lireEtat(null), planUn(lireEtat(null), T0), expedier, T0, (m) => journal.push(m));
    expect(expedier).toHaveBeenCalledTimes(1);
    expect(journal[0]).toContain('ÉCHEC D\'ENVOI');
    expect(e1.problemes).toEqual({});
    expect(e1.envoiEnEchec?.prochainEssai).toBe(plus(T0, 30).toISOString());

    const e2 = await executer(e1, planUn(e1, plus(T0, 5)), expedier, plus(T0, 5), (m) => journal.push(m));
    expect(expedier).toHaveBeenCalledTimes(1); // aucune boucle
    expect(e2).toBe(e1);
    expect(journal[1]).toContain('envoi suspendu');

    const ok = vi.fn(async () => undefined);
    const e3 = await executer(e2, planUn(e2, plus(T0, 30)), ok, plus(T0, 30), () => undefined);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(e3.envoiEnEchec).toBeUndefined();
    expect(e3.problemes.site).toBeDefined();
  });

  it('aucun mail à envoyer → état inchangé (même objet)', async () => {
    const e = lireEtat(null);
    expect(await executer(e, [], async () => { throw new Error('jamais'); }, T0, () => undefined)).toBe(e);
  });
});

describe('réglages, état, essai', () => {
  it('lireReglages : défauts et surcharges', () => {
    expect(lireReglages({})).toEqual(REGLAGES_DEFAUT);
    expect(REGLAGES_DEFAUT.destinataire).toBe('a.jorel@sansvisavis.com');
    expect(REGLAGES_DEFAUT.recapQuotidien).toBe(true);
    const r = lireReglages({ SURVEILLANCE_RECAP: 'non', SURVEILLANCE_RECAP_HEURE: '7', SURVEILLANCE_OVH: '/mnt/x' });
    expect([r.recapQuotidien, r.recapHeure, r.pointOvh]).toEqual([false, 7, '/mnt/x']);
    expect(lireReglages({ SURVEILLANCE_RECAP_HEURE: '25' }).recapHeure).toBe(8);
  });

  it('lireEtat : un fichier illisible repart d\'un état vide', () => {
    expect(lireEtat('{pas du json')).toEqual(ETAT_VIDE);
    expect(lireEtat('{"version":2}')).toEqual(ETAT_VIDE);
    const e: Etat = { version: 1, problemes: { site: { titre: 't', detail: 'd', depuis: 'x', dernierEnvoi: 'x' } } };
    expect(lireEtat(JSON.stringify(e))).toEqual(e);
  });

  it('rendreEssai affiche le mail qui partirait, en disant qu\'il ne part pas', async () => {
    const c = await controler(sondesSaines(T0, { occupation: async () => 0.9 }), SANS_RECAP, T0);
    const texte = rendreEssai(c, planifier(lireEtat(null), c, T0, SANS_RECAP, 'm'), 'a.jorel@sansvisavis.com');
    expect(texte).toContain('Objet : [SVAV serveur] ⚠ 2 problèmes : Disque / plein à 90 % ; Espace OVH plein à 90 %');
    expect(texte).toContain('aucun mail envoyé');
  });
});
