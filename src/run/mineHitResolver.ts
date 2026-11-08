/** A charge, not HP armor. Survival perks are resolved separately on final loss. */
export class MineHitResolver {
  private charged: boolean;
  constructor(enabled: boolean) { this.charged = enabled; }
  get charges(): number { return this.charged ? 1 : 0; }
  resolve(): { protected: boolean; damage: number } {
    if (!this.charged) return { protected: false, damage: 3 };
    this.charged = false;
    return { protected: true, damage: 0 };
  }
}
