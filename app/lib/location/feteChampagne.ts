/**
 * ══ 🔴🔴 LA FÊTE DU « OUI » — MAQUETTE « A+ » VALIDÉE PAR ARNO (18/10/2026). MOTEUR DE DESSIN (canvas 2D, sans bibliothèque).
 *
 * Bouton « Oui » de « Propriétaire(s) en gestion ? » (/admin/location/nouveau-proprietaire) : une bouteille de champagne
 * monte en bas à gauche, le bouchon saute (POP, éclair, giclée de mousse), la bouteille redescend ; deux flûtes montent à
 * droite, se penchent, trinquent et lâchent une gerbe d'étincelles dorées ; des bulles montent en fond ; fondu de 2,6 à 4 s.
 *
 * 🔴 LES COULEURS SONT CELLES DE LA MAQUETTE, À L'IDENTIQUE (or #d9a441 / #f6d77f / #e8c46a, blanc, rose #f2b8b0, goulot
 * #1d4a2a, bulles crème) : c'est un DESSIN posé sur le rouge du bouton, le même en Clair et en Sombre — il ne suit donc pas
 * les jetons du thème, et vit pour cette raison hors des composants de la tuile (dont le garde interdit les couleurs en dur).
 *
 * Positions relatives au bouton (largeur w, hauteur h) : zone gauche x = w/2 − 115, zone droite x = w/2 + 140 (bornées pour
 * rester DANS un bouton étroit, au téléphone), flûtes posées à y = 0,70 h (leur hauteur est bornée pour que le haut des
 * verres reste dans le bouton : environ 90 px sur un grand bouton). Tout est déterministe (générateur à graine) : le même
 * rendu à chaque fois, et des épreuves possibles.
 */

export const DUREE_FETE_S = 4;
const T_POP = 0.38;
const T_TRINQUE = 1.65;
const DEBUT_FONDU = 2.6;

export const PALETTE = {
  or: '#d9a441', orClair: '#f6d77f', orMoyen: '#e8c46a', blanc: '#ffffff', rose: '#f2b8b0',
  goulot: '#1d4a2a', goulotReflet: 'rgba(255,255,255,0.14)', liege: '#c9a06a', liegeSombre: '#9e7a4a',
  creme: '#fff4dc', bulle: '255,240,200',
} as const;

/** Générateur pseudo-aléatoire à graine (mulberry32). */
export function generateur(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const borne = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const sortie = (x: number): number => 1 - (1 - x) ** 3;
const entre = (t: number, a: number, b: number): number => borne((t - a) / (b - a), 0, 1);

export interface Geometrie { w: number; h: number; zoneG: number; zoneD: number; piedFlutes: number; hautFlute: number; sommetGoulot: number }

/** Les repères de la maquette, ramenés à CE bouton. */
export function geometrie(w: number, h: number): Geometrie {
  const piedFlutes = 0.7 * h;
  return {
    w, h,
    zoneG: borne(w / 2 - 115, 26, w / 2 - 40),
    zoneD: borne(w / 2 + 140, w / 2 + 40, w - 34),
    piedFlutes,
    hautFlute: Math.min(90, piedFlutes - 6),
    sommetGoulot: h - 34,
  };
}

/** Le fondu final : 1 jusqu'à 2,6 s, puis vers 0 à 4 s. */
export function fondu(t: number): number {
  return t < DEBUT_FONDU ? 1 : borne(1 - (t - DEBUT_FONDU) / (DUREE_FETE_S - DEBUT_FONDU), 0, 1);
}

/** Le nombre MOYEN de bulles nouvelles par image : 3 jusqu'à 1,8 s, de moins en moins jusqu'à 2,9 s, puis 0. */
export function bullesParImage(t: number): number {
  if (t <= 1.8) return 3;
  if (t >= 2.9) return 0;
  return 3 * (1 - (t - 1.8) / 1.1);
}

/** Le sommet du goulot : monte de 0 à 0,30 s, soubresaut au POP, redescend de 0,95 à 1,35 s. */
export function goulot(t: number, g: Geometrie): { y: number; dx: number; visible: boolean } {
  const bas = g.h + 120;
  let y = bas + (g.sommetGoulot - bas) * sortie(entre(t, 0, 0.3));
  if (t > 0.95) y = g.sommetGoulot + (bas - g.sommetGoulot) * entre(t, 0.95, 1.35) ** 2;
  const sursaut = t > T_POP && t < T_POP + 0.15 ? Math.sin((t - T_POP) * 80) * 3 * (1 - (t - T_POP) / 0.15) : 0;
  return { y: y + Math.abs(sursaut), dx: sursaut, visible: t < 1.36 };
}

/** Le bouchon : posé sur le goulot jusqu'au POP, puis file vers le HAUT en tournant (hors du bouton en ~0,4 s). */
export function bouchon(t: number, g: Geometrie): { x: number; yBas: number; angle: number; visible: boolean } {
  const n = goulot(t, g);
  if (t < T_POP) return { x: g.zoneG + n.dx, yBas: n.y, angle: 0, visible: true };
  const s = t - T_POP;
  const vitesse = (g.sommetGoulot + 40) / 0.4;
  return { x: g.zoneG + s * 60, yBas: g.sommetGoulot - vitesse * s, angle: s * 14, visible: s < 0.5 };
}

/** Les flûtes : montent de 1,0 à 1,4 s, se penchent de 1,4 à 1,65 s, trinquent (petit rebond). */
export function flutes(t: number, g: Geometrie): { dy: number; inclinaison: number; visible: boolean } {
  const dy = (1 - sortie(entre(t, 1.0, 1.4))) * (g.h + g.hautFlute);
  let inclinaison = 0.2 * sortie(entre(t, 1.4, T_TRINQUE));
  if (t > T_TRINQUE) inclinaison = 0.2 - Math.sin(entre(t, T_TRINQUE, T_TRINQUE + 0.3) * Math.PI) * 0.08;
  return { dy, inclinaison, visible: t >= 1.0 };
}

interface Particule { x: number; y: number; vx: number; vy: number; r: number; vie: number; couleur: string; base: number; phase: number }

/** UNE fête, pour UN bouton : on l'avance image par image, puis on la dessine. */
export class FeteChampagne {
  readonly g: Geometrie;
  private readonly alea: () => number;
  private bulles: Particule[] = [];
  private gouttes: Particule[] = [];
  private etincelles: Particule[] = [];
  private gerbe = false;
  t = 0;

  constructor(w: number, h: number, graine = 20261018) {
    this.g = geometrie(w, h);
    this.alea = generateur(graine);
  }

  get finie(): boolean { return this.t >= DUREE_FETE_S; }

  /** Avance à l'instant `t` (secondes depuis le passage à Oui) : nouvelles particules, mouvements. */
  avancer(t: number): void {
    const dt = borne(t - this.t, 0, 0.05);
    this.t = t;
    const { g, alea } = this;
    // Bulles de fond : 3 par image, puis de plus en plus rares.
    const moyenne = bullesParImage(t);
    let n = Math.floor(moyenne);
    if (alea() < moyenne - n) n += 1;
    for (let i = 0; i < n; i += 1) {
      const r = 1.5 + alea() * 3;
      this.bulles.push({ x: alea() * g.w, y: g.h + r, vx: 0, vy: -(0.4 + alea() * 0.5) * g.h, r, vie: 0, couleur: '', base: 0, phase: alea() * 6.28 });
      this.bulles[this.bulles.length - 1].base = this.bulles[this.bulles.length - 1].x;
    }
    // Giclée de mousse pendant 0,5 s après le POP.
    if (t > T_POP && t < T_POP + 0.5) {
      const n2 = goulot(t, g);
      for (let i = 0; i < 4; i += 1) {
        const a = -Math.PI / 2 + (alea() - 0.5) * 0.9;
        const v = 120 + alea() * 160;
        this.gouttes.push({ x: g.zoneG + n2.dx, y: n2.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.2 + alea() * 2,
          vie: 0, couleur: alea() < 0.3 ? PALETTE.rose : PALETTE.creme, base: 0, phase: 0 });
      }
    }
    // La gerbe d'étincelles, au moment où les flûtes trinquent.
    if (!this.gerbe && t >= T_TRINQUE) {
      this.gerbe = true;
      const haut = g.piedFlutes - g.hautFlute;
      const couleurs = [PALETTE.or, PALETTE.orClair, PALETTE.orMoyen, PALETTE.blanc];
      for (let i = 0; i < 36; i += 1) {
        const a = -Math.PI / 2 + (alea() - 0.5) * 2.1;
        const v = 70 + alea() * 170;
        this.etincelles.push({ x: g.zoneD + (alea() - 0.5) * 8, y: haut + 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.2 + alea() * 1.8,
          vie: 0, couleur: couleurs[i % couleurs.length], base: 0, phase: alea() * 6.28 });
      }
    }
    for (const b of this.bulles) { b.vie += dt; b.y += b.vy * dt; b.x = b.base + Math.sin(b.phase + b.vie * 5) * 4; }
    for (const p of [...this.gouttes, ...this.etincelles]) { p.vie += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; }
    this.bulles = this.bulles.filter((b) => b.y > -b.r * 2);
    this.gouttes = this.gouttes.filter((p) => p.vie < 0.9 && p.y < g.h + 10);
    this.etincelles = this.etincelles.filter((p) => p.vie < 1.6);
  }

  /** Combien de particules vivent encore (épreuves). */
  compter(): { bulles: number; gouttes: number; etincelles: number } {
    return { bulles: this.bulles.length, gouttes: this.gouttes.length, etincelles: this.etincelles.length };
  }

  dessiner(ctx: CanvasRenderingContext2D): void {
    const { g, t } = this;
    const f = fondu(t);
    ctx.clearRect(0, 0, g.w, g.h);
    if (f <= 0) return;
    // Bulles de fond : cercles creux crème, plus pâles en montant.
    ctx.lineWidth = 1;
    for (const b of this.bulles) {
      const a = borne(b.y / g.h, 0, 1) * 0.85 * f;
      ctx.strokeStyle = `rgba(${PALETTE.bulle},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    }
    // La bouteille, puis le bouchon.
    const n = goulot(t, g);
    if (n.visible) dessinerGoulot(ctx, g.zoneG + n.dx, n.y);
    if (t > T_POP && t < T_POP + 0.14) {
      const a = 1 - (t - T_POP) / 0.14;
      const rg = ctx.createRadialGradient(g.zoneG, n.y, 0, g.zoneG, n.y, 26);
      rg.addColorStop(0, `rgba(255,248,225,${(0.95 * a).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,248,225,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(g.zoneG, n.y, 26, 0, Math.PI * 2); ctx.fill();
    }
    const b = bouchon(t, g);
    if (b.visible) dessinerBouchon(ctx, b.x, b.yBas, b.angle);
    ctx.globalAlpha = f;
    for (const p of this.gouttes) {
      ctx.fillStyle = p.couleur; ctx.globalAlpha = f * (1 - p.vie / 0.9);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = f;
    // Les flûtes.
    const fl = flutes(t, g);
    if (fl.visible) {
      dessinerFlute(ctx, g.zoneD - 15, g.piedFlutes + fl.dy, g.hautFlute, fl.inclinaison);
      dessinerFlute(ctx, g.zoneD + 15, g.piedFlutes + fl.dy, g.hautFlute, -fl.inclinaison);
    }
    // Les étincelles : petites croix dorées qui scintillent.
    for (const p of this.etincelles) {
      ctx.globalAlpha = f * borne(1 - p.vie / 1.6, 0, 1) * (0.6 + 0.4 * Math.sin(p.phase + p.vie * 25));
      ctx.strokeStyle = p.couleur; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x - p.r * 1.6, p.y); ctx.lineTo(p.x + p.r * 1.6, p.y); ctx.moveTo(p.x, p.y - p.r * 1.6); ctx.lineTo(p.x, p.y + p.r * 1.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** Le haut d'une bouteille : goulot vert foncé qui s'évase vers l'épaule, capsule dorée au liseré clair. `y` = sommet. */
function dessinerGoulot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = PALETTE.goulot;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 9, y + 38);
  ctx.bezierCurveTo(x - 10, y + 60, x - 26, y + 66, x - 27, y + 90);
  ctx.lineTo(x - 27, y + 220); ctx.lineTo(x + 27, y + 220); ctx.lineTo(x + 27, y + 90);
  ctx.bezierCurveTo(x + 26, y + 66, x + 10, y + 60, x + 9, y + 38);
  ctx.lineTo(x + 8, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.goulotReflet;
  ctx.fillRect(x - 5, y + 24, 2.5, 70);
  // La capsule dorée et son liseré.
  ctx.fillStyle = PALETTE.or;
  ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 10, y + 24); ctx.lineTo(x + 10, y + 24); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.orClair;
  ctx.fillRect(x - 10, y + 18, 20, 3);
  ctx.restore();
}

/** Un VRAI bouchon de champagne (~35 px) : tige, tête en champignon, plaque dorée, muselet blanc. `yBas` = bas de la tige. */
function dessinerBouchon(ctx: CanvasRenderingContext2D, x: number, yBas: number, angle: number): void {
  ctx.save();
  ctx.translate(x, yBas - 17); ctx.rotate(angle); ctx.translate(0, 17);
  // La tige, plus étroite.
  ctx.fillStyle = PALETTE.liegeSombre; ctx.fillRect(-6, -15, 12, 15);
  ctx.fillStyle = PALETTE.liege; ctx.fillRect(-5, -15, 8, 15);
  // La tête en champignon.
  ctx.fillStyle = PALETTE.liege;
  ctx.beginPath(); ctx.moveTo(-12, -15); ctx.bezierCurveTo(-13, -36, 13, -36, 12, -15); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = PALETTE.liegeSombre; ctx.lineWidth = 1; ctx.stroke();
  // La plaque dorée sur le dessus.
  ctx.fillStyle = PALETTE.or; ctx.beginPath(); ctx.ellipse(0, -30, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  // Le muselet : fils blancs.
  ctx.strokeStyle = PALETTE.blanc; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-6, -30); ctx.lineTo(-10, -16); ctx.lineTo(-6, -3);
  ctx.moveTo(6, -30); ctx.lineTo(10, -16); ctx.lineTo(6, -3);
  ctx.moveTo(-7, -4); ctx.lineTo(7, -4);
  ctx.stroke();
  ctx.restore();
}

/** Une flûte ÉLANCÉE : socle ovale, tige fine, coupe haute et étroite au fond en U, champagne doré, mousse, reflet, contour. */
function dessinerFlute(ctx: CanvasRenderingContext2D, x: number, yPied: number, hauteur: number, inclinaison: number): void {
  const k = hauteur / 90;
  const demi = 9 * k; const fond = 7 * k; const bas = hauteur * 0.44;
  ctx.save();
  ctx.translate(x, yPied); ctx.rotate(inclinaison);
  const coupe = (): void => {
    ctx.beginPath();
    ctx.moveTo(-demi, -hauteur);
    ctx.lineTo(-fond, -bas - fond);
    ctx.arc(0, -bas - fond, fond, Math.PI, 0, true);
    ctx.lineTo(demi, -hauteur);
  };
  // Le champagne, jusque près du bord.
  ctx.save();
  coupe(); ctx.closePath(); ctx.clip();
  const niveau = -hauteur + 6 * k;
  const gr = ctx.createLinearGradient(0, niveau, 0, -bas);
  gr.addColorStop(0, 'rgba(246,215,127,0.85)'); gr.addColorStop(1, 'rgba(217,164,65,0.9)');
  ctx.fillStyle = gr; ctx.fillRect(-demi - 2, niveau, demi * 2 + 4, hauteur);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-demi - 2, niveau - 1.5, demi * 2 + 4, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-demi * 0.45, niveau + 4, 1.6 * k + 0.6, hauteur * 0.36);
  ctx.restore();
  // Le contour blanc fin, la tige, le socle.
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.2;
  coupe(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -bas); ctx.lineTo(0, -2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -1.5, 9 * k + 2, 2.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
