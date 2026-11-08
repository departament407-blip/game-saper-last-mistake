import { ACHIEVEMENTS } from "../data/achievements";
import type { Biome } from "../data/biomes";
import { getCharacter, type Character } from "../data/characters";
import { getPerk, getPerkDescription } from "../data/perks";
import { getPerkTierByXp } from "../data/rankBenefits";
import type { ClassicOperation } from "../data/operations";
import type { EventBus } from "../events/eventBus";
import type { GameEventMap } from "../events/gameEvents";
import { getBiomeLabel, t } from "../localization/i18n";
import type { MissionResult } from "../progression/campaignTypes";
import type { RunManager } from "../run/runManager";
import { mountPortrait } from "./portraitView";
import type { AppRefs } from "./screens";
import { BLAST_TIMING, type PostBlastFlags } from "./postBlastFlags";
import { ExplosionVFX } from "./explosionVfx";
import { renderMedalAward } from "./medalRenderer";

export class HudView {
  private timerId: number | null = null;
  private aftermathTimerId: number | null = null;
  private assetAvailability = new Map<string, Promise<boolean>>();
  private currentBiome: Biome | null = null;
  private sceneRevision = 0;
  private readonly explosion: ExplosionVFX;

  constructor(
    private readonly refs: AppRefs,
    private readonly runManager: RunManager,
    bus: EventBus<GameEventMap>,
    private readonly postBlastFlags: PostBlastFlags
  ) {
    this.explosion = new ExplosionVFX(refs.operationScreen);
    bus.on("MINE_TRIGGERED", ({ explodedCell, biome, state, protected: protectedHit }) => {
      this.setBlastOrigin(explodedCell.row, explodedCell.col, state.rows, state.cols);
      void this.setOperationBackdrop(biome, true);
      this.refs.operationScreen.classList.add("is-blasted", "is-exploding", "is-death-sequence", "is-destroyed");
      this.queueAftermathState();
      this.explosion.start(explodedCell.id, biome.id, protectedHit);
      if (protectedHit) this.setMessage("Щит поглотил подрыв. Операция продолжится после взрыва.");
      this.render(state);
    });
    bus.on("BLAST_RECOVERED", ({ state }) => {
      this.clearSceneState();
      this.setMessage("Щит израсходован. Продолжайте разминирование; обнаруженная мина безопасна для повторного нажатия.");
      this.render(state);
    });
    bus.on("GAME_STARTED", ({ state, operation, biome, character }) => {
      this.currentBiome = biome;
      this.clearSceneState();
      void this.setOperationBackdrop(biome, false);
      void this.primeDestroyedBackground(biome);
      this.setAtmosphere(biome, character);
      this.setOperationInfo(operation, biome, character);
      this.setMessage(t("hud.instruction"));
      this.render(state);
      this.startTimer();
    });

    bus.on("CELL_REVEALED", ({ result }) => this.render(result.state));
    bus.on("FLAG_TOGGLED", ({ result }) => this.render(result.state));

    bus.on("CHORD_SUCCEEDED", ({ result }) => {
      this.setMessage(t("hud.chordOk"));
      this.render(result.state);
    });

    bus.on("CHORD_FAILED", ({ result }) => {
      this.setMessage(t("hud.chordFail"));
      this.render(result.state);
    });

    bus.on("RUN_WON", ({ state, elapsedSeconds, operation, biome, character, result }) => {
      this.setMessage(t("hud.winMessage", { seconds: elapsedSeconds }));
      this.refs.operationScreen.classList.add("is-cleared");
      this.stopTimer();
      this.render(state);
      this.showDebrief("win", operation, biome, character, result);
    });

    bus.on("RUN_LOST", ({ state, operation, biome, character, result }) => {
      const survived = result.profile.status === "active";

      this.setMessage(survived ? t("hud.survivedMessage") : t("hud.lossMessage"));
      mountPortrait(this.refs.portrait, character, survived ? "active" : "fallen");
      this.stopTimer();
      this.render(state);
      this.showDebrief("loss", operation, biome, character, result);
    });
  }

  render(state: import("../core/types").BoardState): void {
    this.refs.mineCount.textContent = String(state.mines);
    this.refs.flagCount.textContent = `${state.flagsPlaced}/${state.mines}`;
    this.refs.status.textContent = statusLabel(state.status);
    this.refs.timer.textContent = padTime(this.runManager.getElapsedSeconds());
  }

  clearSceneState(): void {
    this.explosion.stop();
    this.sceneRevision += 1;
    this.clearAftermathTimer();
    this.refs.debriefFlags.replaceChildren();
    this.refs.debriefFlags.classList.add("is-hidden");
    this.refs.debriefDiscipline.replaceChildren();
    this.refs.debriefDiscipline.classList.add("is-hidden");
    this.refs.operationScreen.classList.remove(
      "is-blasted",
      "is-exploding",
      "is-burning-aftermath",
      "is-debrief-visible",
      "is-cleared",
      "is-death-sequence",
      "is-destroyed",
      "is-destroyed-fallback"
    );
    this.refs.operationScreen.style.removeProperty("--blast-board-x");
    this.refs.operationScreen.style.removeProperty("--blast-board-y");
    this.refs.operationScreen.style.removeProperty("--blast-scene-x");
    this.refs.operationScreen.style.removeProperty("--blast-scene-y");

    if (this.currentBiome) {
      this.applyOperationBackdrop(this.currentBiome.backgroundAsset);
    } else {
      this.refs.operationScreen.style.removeProperty("--operation-background-image");
    }
  }

  markDebriefVisible(): void {
    this.refs.operationScreen.classList.remove("is-exploding");
    this.refs.operationScreen.classList.add("is-burning-aftermath", "is-debrief-visible");
  }

  private async setOperationBackdrop(biome: Biome, destroyed: boolean): Promise<void> {
    const revision = ++this.sceneRevision;
    if (!destroyed) {
      this.applyOperationBackdrop(biome.backgroundAsset);
      this.refs.operationScreen.classList.remove("is-destroyed-fallback");
      return;
    }

    this.applyOperationBackdrop(biome.destroyedBackgroundAsset);
    const destroyedAsset = await this.resolveDestroyedBackground(biome);
    if (revision !== this.sceneRevision) return;
    this.refs.operationScreen.classList.toggle("is-destroyed-fallback", destroyedAsset === null);

    if (!destroyedAsset) {
      this.applyOperationBackdrop(biome.backgroundAsset);
      return;
    }

    if (destroyedAsset !== biome.destroyedBackgroundAsset) {
      this.applyOperationBackdrop(destroyedAsset);
    }
  }

  private applyOperationBackdrop(asset: string): void {
    const value = `url("${asset}")`;
    this.refs.operationScreen.style.setProperty("--operation-background-image", value);
    this.refs.game.style.setProperty("--biome-background-image", value);
    document.body.style.setProperty("--biome-background-image", value);
  }

  private startTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
    }

    this.timerId = window.setInterval(() => {
      this.refs.timer.textContent = padTime(this.runManager.getElapsedSeconds());
    }, 250);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private setMessage(message: string): void {
    this.refs.message.textContent = message;
  }

  private setAtmosphere(biome: Biome, character: Character): void {
    mountPortrait(this.refs.portrait, character, "active");
    this.refs.speaker.textContent = character.name;
    this.refs.quote.textContent = character.lines.start;
    this.refs.operationBiome.textContent = getBiomeLabel(biome.id);
    this.refs.operationCharacter.textContent = character.name;
    this.refs.operationScreen.dataset.biome = biome.id;
  }

  private setOperationInfo(operation: ClassicOperation, biome: Biome, character: Character): void {
    this.refs.operationName.textContent = operation.label;
    this.refs.operationMeta.textContent = `${t("common.cycle")} ${operation.cycle} • ${operation.rows}x${operation.cols} • ${operation.mines} ${t("common.mines").toLowerCase()} • +${operation.xpWin} XP`;
    this.refs.operationBiome.textContent = getBiomeLabel(biome.id);
    this.refs.operationCharacter.textContent = character.name;
  }

  private setBlastOrigin(row: number, col: number, rows: number, cols: number): void {
    const boardRect = this.refs.boardWrap.getBoundingClientRect();
    const screenRect = this.refs.operationScreen.getBoundingClientRect();
    const cell = this.refs.board.querySelector<HTMLElement>(`.cell[data-row="${row}"][data-col="${col}"]`);
    const cellRect = cell?.getBoundingClientRect();
    const boardX = cellRect
      ? cellRect.left - boardRect.left + cellRect.width / 2
      : ((col + 0.5) / cols) * boardRect.width;
    const boardY = cellRect
      ? cellRect.top - boardRect.top + cellRect.height / 2
      : ((row + 0.5) / rows) * boardRect.height;
    const sceneX = boardRect.left - screenRect.left + boardX;
    const sceneY = boardRect.top - screenRect.top + boardY;

    this.refs.operationScreen.style.setProperty("--blast-board-x", `${boardX}px`);
    this.refs.operationScreen.style.setProperty("--blast-board-y", `${boardY}px`);
    this.refs.operationScreen.style.setProperty("--blast-scene-x", `${sceneX}px`);
    this.refs.operationScreen.style.setProperty("--blast-scene-y", `${sceneY}px`);
  }

  private queueAftermathState(): void {
    this.clearAftermathTimer();
    this.aftermathTimerId = window.setTimeout(() => {
      this.aftermathTimerId = null;
      this.refs.operationScreen.classList.remove("is-exploding");
      this.refs.operationScreen.classList.add("is-burning-aftermath");
    }, BLAST_TIMING.ignition);
  }

  private clearAftermathTimer(): void {
    if (this.aftermathTimerId !== null) {
      window.clearTimeout(this.aftermathTimerId);
      this.aftermathTimerId = null;
    }
  }

  private showDebrief(
    tone: "win" | "loss",
    operation: ClassicOperation,
    biome: Biome,
    character: Character,
    result: MissionResult
  ): void {
    const rankChanged = result.previousRank.id !== result.currentRank.id;
    const survivedLoss = tone === "loss" && result.profile.status === "active";
    const statusLabelText = result.profile.status === "fallen" ? t("common.fallen") : t("common.active");
    const detailParts = [
      `${t("common.time")}: ${result.elapsedSeconds} сек.`,
      `${t("common.operation")}: ${operation.label}`,
      `${t("hud.biome")}: ${getBiomeLabel(biome.id)}`,
      `${t("hud.operative")}: ${character.name}`,
      `${t("common.status")}: ${statusLabelText}`,
      `${t("common.hp")}: ${result.profile.hp}/${result.profile.maxHp}`
    ];

    if (survivedLoss && result.perkEvents.some(event => event.startsWith("Запас плавучести:") || event.startsWith("Реанимационный шанс:"))) {
      detailParts.push(t("debrief.savedByPerk"));
    }

    this.refs.debriefPanel.classList.toggle("is-win", tone === "win");
    this.refs.debriefPanel.classList.toggle("is-loss", tone === "loss");
    this.refs.debriefTitle.textContent = tone === "win"
      ? t("debrief.winTitle")
      : survivedLoss
        ? t("debrief.survivedTitle")
        : t("debrief.lossTitle");
    this.refs.debriefDetails.textContent = detailParts.join(" | ");
    this.refs.debriefDetails.textContent += ` | Ручных постановок: ${result.manualFlagPlacements} | Автофлагов: ${result.automaticFlagPlacements}`;
    const discipline = result.flagDiscipline;
    this.refs.debriefDiscipline.classList.toggle("is-hidden", !discipline);
    this.refs.debriefDiscipline.innerHTML = discipline ? `
      <strong>Флажковая дисциплина</strong>
      <p>Мин: ${discipline.mineCount} · Ручных постановок: ${discipline.manualFlagPlacements}</p>
      <p>Неиспользованный бюджет: ${discipline.unusedFlagBudget} · Бонус каждому: +${discipline.bonusPercent}% (${discipline.bonusXpPerOperative} XP), максимум +60%</p>
      <div class="discipline-recipients">${discipline.recipients.map(recipient => `<span>${getCharacter(recipient.characterId).name}: +${recipient.totalXp} XP <small>(дисциплина +${recipient.disciplineXp})</small></span>`).join("")}</div>
    ` : "";
    const statistics = tone === "loss" ? this.postBlastFlags.getStatistics() : null;
    this.refs.debriefFlags.classList.toggle("is-hidden", !statistics);
    this.refs.debriefFlags.innerHTML = statistics ? `
      <div><dt>${t("aftermath.correctFlags")}</dt><dd>${statistics.correctFlags}</dd></div>
      <div><dt>${t("aftermath.wrongFlags")}</dt><dd>${statistics.wrongFlags}</dd></div>
      <div><dt>${t("aftermath.unflaggedMines")}</dt><dd>${statistics.unflaggedMines}</dd></div>
    ` : "";
    this.refs.debriefXp.textContent = `+${result.xpAwarded} XP`;
    this.refs.debriefRank.textContent = rankChanged
      ? `${result.previousRank.label} → ${result.currentRank.label}`
      : result.currentRank.label;
    this.refs.debriefQuote.textContent = tone === "win" ? character.lines.win : character.lines.death;
    this.refs.debriefAwards.innerHTML = renderAwards(result);
    this.refs.debriefNewOperationButton.textContent = result.sessionEnded
      ? t("session.menu")
      : t("debrief.next");
  }

  private async primeDestroyedBackground(biome: Biome): Promise<void> {
    await this.resolveDestroyedBackground(biome);
  }

  private async resolveDestroyedBackground(biome: Biome): Promise<string | null> {
    const candidates = [
      biome.destroyedBackgroundAsset,
      `/assets/biome_backgrounds/fallen/${biome.id}.png`,
      `/assets/biome_backgrounds/fallen/${biome.id}.jpg`,
      `/assets/biome_backgrounds/fallen/${biome.id}.jpeg`,
      `/assets/biome_backgrounds/fallen/${biome.id}.webp`,
      `/assets/biome_backgrounds/fallen/${biome.id}_destroyed.png`,
      `/assets/biome_backgrounds/fallen/${biome.id}_destroyed.jpg`,
      `/assets/biome_backgrounds/fallen/${biome.id}_destroyed.webp`
    ].filter((asset, index, assets) => assets.indexOf(asset) === index);

    for (const asset of candidates) {
      if (await this.isAssetAvailable(asset)) {
        return asset;
      }
    }

    return null;
  }

  private isAssetAvailable(asset: string): Promise<boolean> {
    if (!this.assetAvailability.has(asset)) {
      this.assetAvailability.set(asset, imageExists(asset));
    }

    return this.assetAvailability.get(asset)!;
  }
}

function renderAwards(result: MissionResult): string {
  const achievementItems = result.newAchievementIds.map((id) => {
    const item = ACHIEVEMENTS.find((achievement) => achievement.id === id);
    return item ? `<span class="award-pill"><b><span>${item.icon}</span>${item.label}</b><small>${item.description}</small></span>` : "";
  });

  const medalItems = result.newMedalIds.map(id => renderMedalAward(id));

  const perkItems = result.newPerkIds.map((id) => {
    const item = getPerk(id);
    return item ? `<span class="award-pill perk"><b>${item.label}</b><small>${getPerkDescription(item, result.campaignMode, getPerkTierByXp(result.profile.xp))}</small></span>` : "";
  });
  const perkEventItems = result.perkEvents.map((event) => `
    <span class="award-pill perk">
      <b>Перк</b>
      <small>${event}</small>
    </span>
  `);

  const awards = [...achievementItems, ...medalItems, ...perkItems, ...perkEventItems].filter(Boolean);

  if (awards.length === 0) {
    return result.outcome === "lost"
      ? `<span class="award-pill muted">${t("debrief.noLossRewards")}</span>`
      : `<span class="award-pill muted">${t("debrief.noRewards")}</span>`;
  }

  return awards.join("");
}

function statusLabel(status: import("../core/types").GameStatus): string {
  return t(`status.${status}`);
}

function padTime(seconds: number): string {
  return String(Math.min(seconds, 999)).padStart(3, "0");
}

function imageExists(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}
