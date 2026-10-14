/**
 * ══ SURVEILLANCE DU SERVEUR — ÊTRE PRÉVENU PAR MAIL (lot SURVEILLANCE DU SERVEUR, 14/10/2026) ═══════════════════════════
 *
 * Toutes les 5 minutes (svav-surveillance.timer), on OBSERVE le serveur et l'on prévient Arno par mail :
 *   1. services essentiels actifs (svav-next, svav-minio, caddy, postgresql) ; les automatismes de deploy/systemd/
 *      (relève Gestion, veille, empreintes Drive, statistiques) SEULEMENT s'ils sont installés ET activés — un
 *      automatisme absent ou non activé n'est pas une alerte (ils sont volontairement éteints avant la bascule) ;
 *      toute unité svav-* en échec ;
 *   2. le site répond 200 en moins de 10 s ; son certificat https vaut encore plus de 14 jours ;
 *   3. la dernière sauvegarde locale (…/sauvegardes/<x>/TERMINEE) et la dernière svav-*.tar.zst.age de l'espace OVH
 *      (Roubaix) ont moins de 26 h ; l'espace OVH est monté ;
 *   4. disque / et espace OVH remplis à 85 % au plus ;
 *   5. PostgreSQL répond ; si la relève Gestion est activée, elle a une passe réussie de moins de 10 min.
 * Et, appelée par OnFailure= des unités svav-* (svav-alerte@.service), un mail IMMÉDIAT à l'échec d'une unité, avec les
 * 30 dernières lignes de son journal.
 *
 * ANTI-AVALANCHE : un mail à l'apparition d'un problème, un rappel toutes les 6 h tant qu'il dure, un mail « résolu »
 * quand il disparaît ; les événements d'une même passe partent dans UN seul mail. Récapitulatif quotidien à 8 h (réglage,
 * activé par défaut). L'état tient dans un petit fichier JSON (un problème n'y entre qu'une fois son mail PARTI).
 * Si l'envoi échoue : écrit dans le journal système, puis plus aucun essai pendant 30 min — jamais de boucle d'échec, et
 * jamais de mail sur l'échec d'un mail.
 *
 * 🔒 LA SURVEILLANCE NE CORRIGE RIEN : elle ne redémarre aucun service, n'écrit jamais en base (connexion en lecture
 * seule, `default_transaction_read_only`). Ce module est PUR : horloge, système et transport sont INJECTÉS (tests sans
 * réseau ni envoi) ; les sondes réelles sont dans `surveillanceSysteme.ts`.
 */

// ── Réglages et seuils ─────────────────────────────────────────────────────────────────────────────────────────────

export const SEUILS = {
  siteDelaiMs: 10_000,
  certificatJoursMin: 14,
  sauvegardeHeuresMax: 26,
  disqueMax: 0.85,
  releveMinutesMax: 10,
  rappelHeures: 6,
  echecEnvoiAttenteMinutes: 30,
} as const;

/** Toujours actifs sur le serveur. Un service arrêté est une alerte. */
export const SERVICES_ESSENTIELS = ['svav-next.service', 'svav-minio.service', 'caddy.service', 'postgresql.service'] as const;

/** Automatismes de deploy/systemd/ : surveillés SEULEMENT s'ils sont installés et activés. */
export const AUTOMATISMES: readonly { nom: string; unite: string }[] = [
  { nom: 'Relève Gestion', unite: 'svav-gestion-continu.service' },
  { nom: 'Veille', unite: 'svav-veille.timer' },
  { nom: 'Empreintes Drive', unite: 'svav-drive-empreintes.timer' },
  { nom: 'Statistiques', unite: 'svav-analytics-maintenance.timer' },
];
export const UNITE_RELEVE = 'svav-gestion-continu.service';

export const PREFIXE_OBJET = '[SVAV serveur]';
export const FUSEAU = 'Europe/Paris';

export interface Reglages {
  destinataire: string;
  urlSite: string;
  dossierSauvegardesLocales: string;
  pointOvh: string;
  recapQuotidien: boolean;
  recapHeure: number;
}

export const REGLAGES_DEFAUT: Reglages = {
  destinataire: 'a.jorel@sansvisavis.com',
  urlSite: 'https://authentification.sansvisavis.com/',
  dossierSauvegardesLocales: '/home/ubuntu/sauvegardes',
  pointOvh: '/mnt/svav-ovh',
  recapQuotidien: true,
  recapHeure: 8,
};

/** Réglages lus dans l'environnement (`.env`), avec repli sûr sur les défauts. PUR. */
export function lireReglages(env: Record<string, string | undefined>): Reglages {
  const txt = (cle: string, defaut: string) => (env[cle] ?? '').trim() || defaut;
  const heure = Number((env.SURVEILLANCE_RECAP_HEURE ?? '').trim());
  const recap = (env.SURVEILLANCE_RECAP ?? '').trim().toLowerCase();
  return {
    destinataire: txt('SURVEILLANCE_DESTINATAIRE', REGLAGES_DEFAUT.destinataire),
    urlSite: txt('SURVEILLANCE_URL', REGLAGES_DEFAUT.urlSite),
    dossierSauvegardesLocales: txt('SURVEILLANCE_SAUVEGARDES_LOCALES', REGLAGES_DEFAUT.dossierSauvegardesLocales),
    pointOvh: txt('SURVEILLANCE_OVH', REGLAGES_DEFAUT.pointOvh),
    recapQuotidien: !['non', 'off', '0', 'false'].includes(recap),
    recapHeure: Number.isInteger(heure) && heure >= 0 && heure <= 23 && (env.SURVEILLANCE_RECAP_HEURE ?? '').trim() !== ''
      ? heure : REGLAGES_DEFAUT.recapHeure,
  };
}

// ── Sondes (injectées) ─────────────────────────────────────────────────────────────────────────────────────────────

/** `systemctl show -p LoadState,ActiveState,SubState,UnitFileState`. */
export interface EtatUnite {
  charge: string; // LoadState : loaded | not-found | …
  actif: string; // ActiveState : active | inactive | failed | activating | …
  sousEtat: string; // SubState
  fichier: string; // UnitFileState : enabled | disabled | static | …
}

export interface Sondes {
  etatUnite(unite: string): Promise<EtatUnite>;
  unitesSvavEnEchec(): Promise<string[]>;
  site(url: string, delaiMs: number): Promise<{ statut: number | null; dureeMs: number; erreur?: string }>;
  certificat(url: string): Promise<{ expireLe: Date | null; erreur?: string }>;
  derniereSauvegardeLocale(dossier: string): Promise<Date | null>;
  estMonte(point: string): Promise<boolean>;
  derniereSauvegardeOvh(point: string): Promise<Date | null>;
  /** Fraction occupée (0..1), comme `df`. */
  occupation(chemin: string): Promise<number>;
  /** Ping de la base (lecture seule) ; avec `releve`, la fin de la dernière passe de relève réussie. */
  base(releve: boolean): Promise<{ derniereReleveOk: Date | null }>;
}

// ── Contrôles ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Probleme {
  cle: string;
  titre: string; // court, sert d'objet de mail
  detail: string;
}
export interface LigneControle {
  quoi: string;
  /** true = OK ; false = problème ; null = non concerné (automatisme non installé…). */
  ok: boolean | null;
  detail: string;
}
export interface Controles {
  lignes: LigneControle[];
  problemes: Probleme[];
}

/** Clé d'état d'une unité : la même pour le contrôle périodique et pour l'alerte OnFailure (jamais deux mails). */
export function cleUnite(unite: string): string {
  return `unite:${/\.[a-z]+$/.test(unite) ? unite : `${unite}.service`}`;
}

const nomCourt = (u: string) => u.replace(/\.service$/, '');
const heures = (ms: number) => Math.floor(ms / 3_600_000);
const pourcent = (f: number) => `${Math.floor(f * 100)} %`;
const motif = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Exécute tous les contrôles. Chaque sonde est isolée : une sonde qui casse donne un problème, jamais un plantage. */
export async function controler(sondes: Sondes, reglages: Reglages, maintenant: Date): Promise<Controles> {
  const lignes: LigneControle[] = [];
  const problemes: Probleme[] = [];
  const ok = (quoi: string, detail: string): void => { lignes.push({ quoi, ok: true, detail }); };
  const sansObjet = (quoi: string, detail: string): void => { lignes.push({ quoi, ok: null, detail }); };
  const ko = (quoi: string, p: Probleme) => { lignes.push({ quoi, ok: false, detail: p.detail }); problemes.push(p); };
  const essayer = async (quoi: string, cle: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { ko(quoi, { cle, titre: `Contrôle impossible : ${quoi}`, detail: motif(e) }); }
  };

  // 1. Services essentiels.
  for (const unite of SERVICES_ESSENTIELS) {
    await essayer(`Service ${nomCourt(unite)}`, cleUnite(unite), async () => {
      const e = await sondes.etatUnite(unite);
      if (e.actif === 'active') ok(`Service ${nomCourt(unite)}`, `actif (${e.sousEtat})`);
      else if (e.charge === 'not-found') ko(`Service ${nomCourt(unite)}`, { cle: cleUnite(unite), titre: `Service ${nomCourt(unite)} introuvable`, detail: 'unité non installée' });
      else ko(`Service ${nomCourt(unite)}`, { cle: cleUnite(unite), titre: `Service ${nomCourt(unite)} arrêté (${e.actif})`, detail: `état ${e.actif}/${e.sousEtat}` });
    });
  }

  // 1 bis. Automatismes, seulement installés ET activés.
  let releveActive = false;
  for (const a of AUTOMATISMES) {
    await essayer(a.nom, cleUnite(a.unite), async () => {
      const e = await sondes.etatUnite(a.unite);
      if (e.charge !== 'loaded') return sansObjet(a.nom, `${a.unite} non installé — pas surveillé`);
      if (e.fichier !== 'enabled' && e.fichier !== 'enabled-runtime') return sansObjet(a.nom, `${a.unite} installé, non activé (${e.fichier || 'inconnu'}) — pas surveillé`);
      if (a.unite === UNITE_RELEVE) releveActive = true;
      if (e.actif === 'active') ok(a.nom, `${a.unite} actif (${e.sousEtat})`);
      else ko(a.nom, { cle: cleUnite(a.unite), titre: `${a.nom} arrêtée (${a.unite} : ${e.actif})`, detail: `${a.unite} activé mais ${e.actif}/${e.sousEtat}` });
    });
  }

  // 1 ter. Toute unité svav-* en échec (sauf celles déjà signalées ci-dessus sous la même clé).
  await essayer('Unités svav-* en échec', 'unites-echec', async () => {
    const echecs = await sondes.unitesSvavEnEchec();
    const dejaVues = new Set(problemes.map((p) => p.cle));
    const nouvelles = echecs.filter((u) => !dejaVues.has(cleUnite(u)));
    if (echecs.length === 0) ok('Unités svav-* en échec', 'aucune');
    else if (nouvelles.length === 0) lignes.push({ quoi: 'Unités svav-* en échec', ok: false, detail: echecs.join(', ') });
    for (const u of nouvelles) ko('Unités svav-* en échec', { cle: cleUnite(u), titre: `Unité ${u} en échec`, detail: `systemctl status ${u} ; journalctl -u ${u}` });
  });

  // 2. Site et certificat.
  await essayer('Site', 'site', async () => {
    const r = await sondes.site(reglages.urlSite, SEUILS.siteDelaiMs);
    const duree = `${(r.dureeMs / 1000).toFixed(1).replace('.', ',')} s`;
    if (r.statut === 200 && r.dureeMs < SEUILS.siteDelaiMs) ok('Site', `${reglages.urlSite} → 200 en ${duree}`);
    else if (r.statut === null) ko('Site', { cle: 'site', titre: 'Site injoignable', detail: `${reglages.urlSite} : ${r.erreur ?? 'pas de réponse'} (${duree})` });
    else if (r.statut !== 200) ko('Site', { cle: 'site', titre: `Site en erreur (HTTP ${r.statut})`, detail: `${reglages.urlSite} → HTTP ${r.statut} en ${duree}` });
    else ko('Site', { cle: 'site', titre: `Site lent (${duree})`, detail: `${reglages.urlSite} → 200 en ${duree} (seuil ${SEUILS.siteDelaiMs / 1000} s)` });
  });
  await essayer('Certificat https', 'certificat', async () => {
    const c = await sondes.certificat(reglages.urlSite);
    if (!c.expireLe) return ko('Certificat https', { cle: 'certificat', titre: 'Certificat https invalide', detail: c.erreur ?? 'certificat illisible' });
    const jours = Math.floor((c.expireLe.getTime() - maintenant.getTime()) / 86_400_000);
    const fin = `expire le ${dateLisible(c.expireLe)}`;
    if (c.erreur) ko('Certificat https', { cle: 'certificat', titre: 'Certificat https invalide', detail: `${c.erreur} (${fin})` });
    else if (jours > SEUILS.certificatJoursMin) ok('Certificat https', `${fin} (dans ${jours} jours)`);
    else ko('Certificat https', { cle: 'certificat', titre: jours < 0 ? 'Certificat https expiré' : `Certificat https expire dans ${jours} jours`, detail: fin });
  });

  // 3. Sauvegardes.
  const fraicheur = (quoi: string, cle: string, nom: string, d: Date | null) => {
    if (!d) return ko(quoi, { cle, titre: `${nom} introuvable`, detail: 'aucune sauvegarde trouvée' });
    const age = maintenant.getTime() - d.getTime();
    if (age < SEUILS.sauvegardeHeuresMax * 3_600_000) ok(quoi, `dernière le ${dateLisible(d)} (il y a ${heures(age)} h)`);
    else ko(quoi, { cle, titre: `${nom} absente depuis ${heures(age)} h`, detail: `dernière le ${dateLisible(d)} (seuil ${SEUILS.sauvegardeHeuresMax} h)` });
  };
  await essayer('Sauvegarde locale', 'sauvegarde-locale', async () => {
    fraicheur('Sauvegarde locale', 'sauvegarde-locale', 'Sauvegarde locale', await sondes.derniereSauvegardeLocale(reglages.dossierSauvegardesLocales));
  });
  let ovhMonte = false;
  await essayer('Espace OVH monté', 'ovh-monte', async () => {
    ovhMonte = await sondes.estMonte(reglages.pointOvh);
    if (ovhMonte) ok('Espace OVH monté', reglages.pointOvh);
    else ko('Espace OVH monté', { cle: 'ovh-monte', titre: 'Espace OVH non monté', detail: `${reglages.pointOvh} n'est pas monté` });
  });
  if (ovhMonte) {
    await essayer('Sauvegarde Roubaix', 'sauvegarde-roubaix', async () => {
      fraicheur('Sauvegarde Roubaix', 'sauvegarde-roubaix', 'Sauvegarde Roubaix', await sondes.derniereSauvegardeOvh(reglages.pointOvh));
    });
  } else sansObjet('Sauvegarde Roubaix', 'non vérifiable : espace OVH non monté');

  // 4. Disques.
  const disque = async (quoi: string, cle: string, chemin: string) => essayer(quoi, cle, async () => {
    const f = await sondes.occupation(chemin);
    if (f <= SEUILS.disqueMax) ok(quoi, `${pourcent(f)} occupé`);
    else ko(quoi, { cle, titre: `${quoi} plein à ${pourcent(f)}`, detail: `${chemin} : ${pourcent(f)} occupé (seuil ${pourcent(SEUILS.disqueMax)})` });
  });
  await disque('Disque /', 'disque-racine', '/');
  if (ovhMonte) await disque('Espace OVH', 'disque-ovh', reglages.pointOvh);
  else sansObjet('Espace OVH', 'non vérifiable : non monté');

  // 5. Base et relève.
  let releve: Date | null = null;
  let baseOk = false;
  try {
    releve = (await sondes.base(releveActive)).derniereReleveOk;
    baseOk = true;
    ok('PostgreSQL', 'répond');
  } catch (e) {
    ko('PostgreSQL', { cle: 'base', titre: 'PostgreSQL ne répond pas', detail: motif(e) });
  }
  if (!releveActive) sansObjet('Relève Gestion (fraîcheur)', 'relève non activée — pas surveillée');
  else if (!baseOk) sansObjet('Relève Gestion (fraîcheur)', 'non vérifiable : base injoignable');
  else if (!releve) ko('Relève Gestion (fraîcheur)', { cle: 'releve', titre: 'Relève Gestion : aucune passe réussie', detail: 'aucune passe « ok » dans gestion_releve_run' });
  else {
    const minutes = Math.floor((maintenant.getTime() - releve.getTime()) / 60_000);
    if (minutes < SEUILS.releveMinutesMax) ok('Relève Gestion (fraîcheur)', `dernière passe réussie il y a ${minutes} min`);
    else ko('Relève Gestion (fraîcheur)', { cle: 'releve', titre: `Relève Gestion : aucune passe réussie depuis ${minutes} min`, detail: `dernière passe réussie le ${dateLisible(releve)}` });
  }

  return { lignes, problemes };
}

// ── État et anti-avalanche ─────────────────────────────────────────────────────────────────────────────────────────

export interface ProblemeSuivi {
  titre: string;
  detail: string;
  depuis: string; // ISO
  dernierEnvoi: string; // ISO
}
export interface Etat {
  version: 1;
  problemes: Record<string, ProblemeSuivi>;
  dernierRecap?: string; // AAAA-MM-JJ (heure de Paris)
  envoiEnEchec?: { depuis: string; prochainEssai: string; motif: string };
}

export const ETAT_VIDE: Etat = { version: 1, problemes: {} };

/** Relit un état JSON ; tout contenu illisible repart d'un état vide (au pire : un mail d'apparition en double). PUR. */
export function lireEtat(texte: string | null): Etat {
  if (!texte) return { ...ETAT_VIDE, problemes: {} };
  try {
    const e = JSON.parse(texte) as Partial<Etat>;
    if (e && e.version === 1 && e.problemes && typeof e.problemes === 'object') return e as Etat;
  } catch { /* illisible */ }
  return { ...ETAT_VIDE, problemes: {} };
}

export interface Mail {
  sujet: string;
  corps: string;
}
/** Un mail à envoyer, et ce qu'il change à l'état S'IL PART. */
export interface Envoi {
  mail: Mail;
  appliquer(e: Etat): Etat;
}

/** Date et heure lisibles, heure de Paris, quel que soit le fuseau du processus. PUR. */
export function dateLisible(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', ' à');
}
function jourEtHeure(d: Date): { jour: string; heure: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { jour: `${v('year')}-${v('month')}-${v('day')}`, heure: Number(v('hour')) };
}

const tronquer = (s: string, n = 180) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const PIED = [
  '',
  '—',
  'La surveillance observe et prévient : elle ne corrige rien, ne redémarre rien et n\'écrit jamais en base.',
  'Réglages et mode d\'emploi : docs/BASCULE_CHECKLIST.md, section « Surveillance du serveur ».',
];

function blocControles(lignes: LigneControle[]): string[] {
  return lignes.map((l) => `${l.ok === true ? '  OK   ' : l.ok === false ? '  ⚠    ' : '  —    '}${l.quoi} : ${l.detail}`);
}

/**
 * Décide des mails d'une passe. PUR. Nouveaux problèmes, rappels (≥ 6 h depuis le dernier mail) et résolus partent dans
 * UN seul mail ; le récapitulatif quotidien, s'il est dû, dans un second.
 */
export function planifier(etat: Etat, controles: Controles, maintenant: Date, reglages: Reglages, machine: string): Envoi[] {
  const envois: Envoi[] = [];
  const iso = maintenant.toISOString();
  const actuels = new Map(controles.problemes.map((p) => [p.cle, p]));
  const nouveaux = controles.problemes.filter((p) => !etat.problemes[p.cle]);
  const rappels = controles.problemes.filter((p) => {
    const s = etat.problemes[p.cle];
    return s && maintenant.getTime() - Date.parse(s.dernierEnvoi) >= SEUILS.rappelHeures * 3_600_000;
  });
  const resolus = Object.entries(etat.problemes).filter(([cle]) => !actuels.has(cle));

  if (nouveaux.length + rappels.length + resolus.length > 0) {
    const titres = (l: { titre: string }[]) => l.map((p) => p.titre).join(' ; ');
    let sujet: string;
    if (nouveaux.length === 1) sujet = `⚠ ${nouveaux[0].titre}`;
    else if (nouveaux.length > 1) sujet = `⚠ ${nouveaux.length} problèmes : ${titres(nouveaux)}`;
    else if (rappels.length > 0) sujet = `⚠ Toujours en cours : ${titres(rappels)}`;
    else sujet = `✅ Résolu : ${resolus.map(([, s]) => s.titre).join(' ; ')}`;
    if (nouveaux.length > 0 && resolus.length > 0) sujet += ` (+ ${resolus.length} résolu${resolus.length > 1 ? 's' : ''})`;

    const corps: string[] = [`Serveur ${machine}, contrôle du ${dateLisible(maintenant)}.`, ''];
    if (nouveaux.length) corps.push('NOUVEAU PROBLÈME :', ...nouveaux.map((p) => `  ⚠ ${p.titre}\n    ${p.detail}`), '');
    if (rappels.length) corps.push(`TOUJOURS EN COURS (rappel toutes les ${SEUILS.rappelHeures} h) :`,
      ...rappels.map((p) => `  ⚠ ${p.titre} — depuis le ${dateLisible(new Date(etat.problemes[p.cle].depuis))}\n    ${p.detail}`), '');
    if (resolus.length) corps.push('RÉSOLU :', ...resolus.map(([, s]) => `  ✅ ${s.titre} — apparu le ${dateLisible(new Date(s.depuis))}`), '');
    corps.push('ÉTAT DE TOUS LES CONTRÔLES :', ...blocControles(controles.lignes), ...PIED);

    envois.push({
      mail: { sujet: tronquer(`${PREFIXE_OBJET} ${sujet}`), corps: corps.join('\n') },
      appliquer: (e) => {
        const problemes = { ...e.problemes };
        for (const p of nouveaux) problemes[p.cle] = { titre: p.titre, detail: p.detail, depuis: iso, dernierEnvoi: iso };
        for (const p of rappels) if (problemes[p.cle]) problemes[p.cle] = { ...problemes[p.cle], detail: p.detail, dernierEnvoi: iso };
        for (const [cle] of resolus) delete problemes[cle];
        return { ...e, problemes };
      },
    });
  }

  if (reglages.recapQuotidien) {
    const { jour, heure } = jourEtHeure(maintenant);
    if (heure >= reglages.recapHeure && etat.dernierRecap !== jour) {
      const n = controles.problemes.length;
      const [a, m, j] = jour.split('-');
      envois.push({
        mail: {
          sujet: `${PREFIXE_OBJET} Récapitulatif du ${j}/${m}/${a} : ${n === 0 ? 'tout va bien' : `${n} problème${n > 1 ? 's' : ''} en cours`}`,
          corps: [
            `Serveur ${machine}, récapitulatif du ${dateLisible(maintenant)}.`, '',
            n === 0 ? 'Tout va bien : aucun problème en cours.' : 'PROBLÈMES EN COURS :',
            ...controles.problemes.map((p) => `  ⚠ ${p.titre}${etat.problemes[p.cle] ? ` — depuis le ${dateLisible(new Date(etat.problemes[p.cle].depuis))}` : ''}\n    ${p.detail}`),
            '', 'ÉTAT DE TOUS LES CONTRÔLES :', ...blocControles(controles.lignes), ...PIED,
          ].join('\n'),
        },
        appliquer: (e) => ({ ...e, dernierRecap: jour }),
      });
    }
  }
  return envois;
}

/**
 * Échec d'une unité (OnFailure=) : mail IMMÉDIAT avec la fin de son journal — sauf si un mail pour cette unité est
 * parti il y a moins de 6 h (une unité qui échoue à chaque passe ne fait pas un mail par passe). PUR.
 */
export function planifierEchecUnite(etat: Etat, unite: string, journal: string, maintenant: Date, machine: string): Envoi | null {
  const cle = cleUnite(unite);
  const iso = maintenant.toISOString();
  const s = etat.problemes[cle];
  if (s && maintenant.getTime() - Date.parse(s.dernierEnvoi) < SEUILS.rappelHeures * 3_600_000) return null;
  const titre = `Échec de ${unite}`;
  return {
    mail: {
      sujet: tronquer(`${PREFIXE_OBJET} ⚠ ${titre}`),
      corps: [
        `Serveur ${machine} : l'unité ${unite} vient d'échouer (${dateLisible(maintenant)}).`, '',
        `30 DERNIÈRES LIGNES DU JOURNAL (journalctl -u ${unite}) :`, '',
        journal.trim() || '(journal vide ou illisible)', '',
        `Un mail « résolu » partira quand l'unité ne sera plus en échec.`,
        ...PIED,
      ].join('\n'),
    },
    appliquer: (e) => ({
      ...e,
      problemes: {
        ...e.problemes,
        [cle]: s ? { ...s, dernierEnvoi: iso } : { titre, detail: `journalctl -u ${unite}`, depuis: iso, dernierEnvoi: iso },
      },
    }),
  };
}

// ── Envoi ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Expedier = (mail: Mail) => Promise<void>;

/**
 * Envoie les mails dans l'ordre et rend le nouvel état. Un mail parti → son effet est appliqué. Un échec → écrit dans le
 * journal (`journaliser`), plus aucun envoi pendant 30 min ; les mails non partis seront recalculés à la passe suivante.
 */
export async function executer(etat: Etat, envois: Envoi[], expedier: Expedier, maintenant: Date, journaliser: (m: string) => void): Promise<Etat> {
  if (envois.length === 0) return etat;
  if (etat.envoiEnEchec && maintenant.getTime() < Date.parse(etat.envoiEnEchec.prochainEssai)) {
    journaliser(`[surveillance] ${envois.length} mail(s) en attente, envoi suspendu jusqu'au ${dateLisible(new Date(etat.envoiEnEchec.prochainEssai))} (échec précédent : ${etat.envoiEnEchec.motif}) : ${envois.map((e) => e.mail.sujet).join(' | ')}`);
    return etat;
  }
  let courant: Etat = { ...etat };
  delete courant.envoiEnEchec;
  for (const envoi of envois) {
    try {
      await expedier(envoi.mail);
      courant = envoi.appliquer(courant);
      journaliser(`[surveillance] mail envoyé : ${envoi.mail.sujet}`);
    } catch (e) {
      const depuis = etat.envoiEnEchec?.depuis ?? maintenant.toISOString();
      const prochain = new Date(maintenant.getTime() + SEUILS.echecEnvoiAttenteMinutes * 60_000).toISOString();
      journaliser(`[surveillance] ÉCHEC D'ENVOI (prochain essai dans ${SEUILS.echecEnvoiAttenteMinutes} min) : ${envoi.mail.sujet} — ${motif(e)}`);
      return { ...courant, envoiEnEchec: { depuis, prochainEssai: prochain, motif: motif(e) } };
    }
  }
  return courant;
}

/** Ce que `--essai` affiche : les contrôles, puis chaque mail qui PARTIRAIT. PUR. */
export function rendreEssai(controles: Controles | null, envois: Envoi[], destinataire: string): string {
  const l: string[] = [];
  if (controles) l.push('CONTRÔLES :', ...blocControles(controles.lignes), '');
  if (envois.length === 0) l.push('Aucun mail ne partirait.');
  for (const e of envois) l.push('──── MAIL QUI SERAIT ENVOYÉ (mode essai : rien n\'est envoyé) ────', `À : ${destinataire}`, `Objet : ${e.mail.sujet}`, '', e.mail.corps, '');
  l.push('Mode essai : aucun mail envoyé, état non modifié.');
  return l.join('\n');
}
