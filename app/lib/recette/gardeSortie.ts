/**
 * 🔴🔴 LA GARDE DES EFFETS RÉELS, CÔTÉ SERVEUR (Arno, 15/11/2026) — tout est dans `garde.ts` (sans module Node, importable partout) ; ce
 * module BRANCHE ce qui touche au disque et à la machine : le dépôt dans la boîte de test (`.recette/boite`) et le nom d'hôte. Chargé au
 * démarrage (`demarrageNode.ts` → `installer.ts`) ; le branchement vit sur `globalThis` et survit aux rechargements à chaud.
 */
import { hostname } from 'node:os';
import { deposerDansBoite } from './boite';
import { brancherGarde } from './garde';
import { deposerRecette } from './depotRecette';

export * from './garde';

brancherGarde({
  nomMachine: () => { try { return hostname(); } catch { return ''; } },
  deposer: deposerRecette,
  trace: (e) => deposerDansBoite(e as Parameters<typeof deposerDansBoite>[0]),
});
