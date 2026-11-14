/**
 * ══ DÉMARRAGE DU SERVEUR — PARTIE NODE SEULEMENT (lot INSTRUMENTATION-RUNTIME-NODE, 18/10/2026) ═══════════════════════
 *
 * Tout ce que `instrumentation.ts` faisait au démarrage vit ici : contrôle des URL publiques, puis MODE RECETTE (verrou
 * réseau). Ce fichier n'est chargé QUE par le runtime Node (`instrumentation.ts`, branche
 * `process.env.NEXT_RUNTIME === 'nodejs'`, import dynamique) : le compilateur Edge ne le voit jamais, d'où plus aucun
 * avertissement « Node.js API is used (process.exit) » ni « Node.js module is loaded ('node:os') ».
 *
 * Le verrou n'est PAS affaibli : mêmes conditions (`etatRecette`), même pose (`installerVerrouRecette`), même arrêt du
 * serveur si la recette est demandée mais que le verrou ne peut pas être posé. La production n'est pas touchée : sans
 * `SVAV_RECETTE=1`, ou refusé (production, adresse ou machine de production), aucun verrou n'est posé.
 */
import { hostname } from 'node:os';

export interface DependancesDemarrage {
  env: Record<string, string | undefined>;
  nomMachine: () => string;
  sortir: (code: number) => void;
  /** 🔴 Arno (10/11/2026) — la minuterie de la pré-visite (épreuves : un espion) ; absente : la vraie. */
  minuterie?: (d: { env: Record<string, string | undefined> }) => boolean;
  /** 🔴 Arno (15/11/2026) — l'auto-contrôle de la recette (épreuves : un faux) ; absent : le vrai. */
  autoControle?: (env: Record<string, string | undefined>, nomMachine: string) => Promise<{ ok: true } | { ok: false; motif: string }>;
}

const PROCESSUS: DependancesDemarrage = { env: process.env, nomMachine: hostname, sortir: (code) => process.exit(code) };

export async function demarrerServeurNode(deps: DependancesDemarrage = PROCESSUS): Promise<void> {
  const { env } = deps;
  try {
    const { verifierUrlsPubliques } = await import('../config/verifierUrlsPubliques');
    for (const message of verifierUrlsPubliques(env)) console.warn(message);
  } catch {
    // Un contrôle de configuration ne doit jamais empêcher le serveur de démarrer.
  }
  try {
    const { etatRecette } = await import('./mode');
    const { politiqueSortie } = await import('./gardeSortie');
    const etat = etatRecette(env, deps.nomMachine());
    const politique = politiqueSortie(env, deps.nomMachine(), { demarrage: true });
    if (politique === 'recette') {
      const { autoControleRecette, installerVerrouRecette } = await import('./installer');
      installerVerrouRecette('recette');
      // 🔴 Arno (15/11/2026) — L'AUTO-CONTRÔLE : le verrou tient-il, y compris après la remise à zéro du `fetch` par Next ? Sinon : ARRÊT.
      const controle = await (deps.autoControle ?? autoControleRecette)(env, deps.nomMachine());
      if (!controle.ok) {
        console.error(`\x1b[41m\x1b[37m RECETTE ARRÊTÉE \x1b[0m l’interception des mails, de l’agenda et du Drive n’est pas active (${controle.motif}) : le serveur s’arrête, rien n’est envoyé.`);
        deps.sortir(1); return;
      }
      console.warn('\x1b[43m\x1b[30m RECETTE — aucun envoi réel \x1b[0m mails, agenda et Drive interceptés (auto-contrôle réussi) ; boîte de test : /admin/recette');
    } else if (politique === 'refus') {
      // 🔴 Arno (15/11/2026) — ni la production, ni la recette (un Mac en `npm run dev`, une base de recette sans le mode) : AUCUNE écriture
      // réelle (Gmail, agenda, Drive, SMTP) — refusée et journalisée. Jamais l'inverse.
      const { installerVerrouRecette } = await import('./installer');
      installerVerrouRecette('refus');
      console.error('\x1b[41m\x1b[37m ÉCRITURES RÉELLES REFUSÉES \x1b[0m ce serveur n’est ni la production ni en mode recette : aucun mail, agenda ni Drive réel ne part.');
    }
    if (!etat.actif && etat.demande) {
      console.error(`\x1b[41m\x1b[37m MODE RECETTE REFUSÉ \x1b[0m (${etat.refus}) — le serveur fonctionne en mode normal.`);
    }
  } catch (e) {
    // Recette DEMANDÉE mais verrou impossible à poser : on n'ouvre pas un site local qui écrirait pour de vrai.
    console.error('[RECETTE] contrôle de démarrage indisponible', (e as Error)?.message);
    if (env.SVAV_RECETTE === '1' && env.NODE_ENV !== 'production') { deps.sortir(1); return; }
  }
  /* 🔴 Arno (10/11/2026) — LA MINUTERIE DE LA PRÉ-VISITE (alerte du 11e jour, invitation au compte rendu), toutes les 5 minutes, APRÈS le
     verrou de la recette (en recette, rien ne part). Jamais sous les tests ; jamais bloquante pour le démarrage. */
  try {
    const { demarrerMinuteriePrevisite } = await import('../location/minuteriePrevisite');
    (deps.minuterie ?? demarrerMinuteriePrevisite)({ env });
  } catch (e) {
    console.error('[pré-visite] minuterie non lancée', (e as Error)?.message);
  }
}
