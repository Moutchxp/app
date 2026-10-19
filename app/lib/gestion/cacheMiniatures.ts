/**
 * ══ 🔴 LE CACHE DES VIGNETTES QUI N'ONT PAS PU ÊTRE DÉPOSÉES (Arno, 19/10/2026) ═════════════════════════════════════════
 *
 * Quand le stockage objet ne répond pas (MinIO du Mac arrêté le 15/10 par la bascule, panne du serveur), une vignette peut
 * encore être FABRIQUÉE à partir de la copie Drive de la pièce — mais pas déposée. Sans ce cache, chaque affichage relirait
 * la pièce entière dans le Drive (≈ 1 s) pour refaire la même vignette.
 *
 * EN MÉMOIRE, BORNÉ, ÉPHÉMÈRE : rien n'est écrit sur disque ni dans le stockage (la pièce n'est jamais « re-téléchargée
 * dans l'application de façon permanente »). Au redémarrage, il repart vide ; quand le stockage revient, la route dépose
 * et ne passe plus par ici. Les plus anciennes entrées sortent d'abord (ordre d'insertion de `Map`, réordonné à la lecture).
 */
export const CACHE_MINIATURES_MAX_ENTREES = 500;
export const CACHE_MINIATURES_MAX_OCTETS = 32 * 1024 * 1024;

export class CacheMiniatures {
  private readonly m = new Map<number, Buffer>();
  private octets = 0;
  constructor(private readonly maxEntrees = CACHE_MINIATURES_MAX_ENTREES, private readonly maxOctets = CACHE_MINIATURES_MAX_OCTETS) {}

  lire(pieceId: number): Buffer | null {
    const b = this.m.get(pieceId);
    if (b === undefined) return null;
    this.m.delete(pieceId); this.m.set(pieceId, b);   // la plus récemment lue passe en fin de file
    return b;
  }

  garder(pieceId: number, vignette: Buffer): void {
    if (vignette.length === 0 || vignette.length > this.maxOctets) return;
    const ancienne = this.m.get(pieceId);
    if (ancienne !== undefined) { this.octets -= ancienne.length; this.m.delete(pieceId); }
    this.m.set(pieceId, vignette); this.octets += vignette.length;
    while (this.m.size > this.maxEntrees || this.octets > this.maxOctets) {
      const [cle, b] = this.m.entries().next().value as [number, Buffer];
      this.m.delete(cle); this.octets -= b.length;
    }
  }

  oublier(pieceId: number): void {
    const b = this.m.get(pieceId);
    if (b !== undefined) { this.octets -= b.length; this.m.delete(pieceId); }
  }

  get taille(): { entrees: number; octets: number } { return { entrees: this.m.size, octets: this.octets }; }
}

/** L'instance du processus (une par serveur Next). */
export const cacheMiniatures = new CacheMiniatures();
