export class ManualFlagCounter {
  private count = 0;
  record(kind: string, source: "manual" | "perk"): void {
    if (kind === "flagged" && source === "manual") this.count += 1;
  }
  get placements(): number { return this.count; }
  reset(): void { this.count = 0; }
}
