import "./styles.css";
import type { BoardState, Cell } from "./core/types";
import { BIOMES, getBiome } from "./data/biomes";
import { CHARACTERS, getCharacter } from "./data/characters";
import { pickCharacterQuote, type CharacterQuoteEvent } from "./data/characterQuotes";
import { getCharacterPerks, getPerk, getPerkDescription, getPerkEffectDescription, getNextPerkEffectDescription } from "./data/perks";
import type { ClassicOperation } from "./data/operations";
import { getRankProgressionForCharacter } from "./data/rankProgression";
import { getHpBonusByXp, getNextRankBenefit, getPerkTierByXp, getRankIndexByXp, getUnlockedRankBenefits } from "./data/rankBenefits";
import { getNextRank, getRankById } from "./data/ranks";
import { EventBus } from "./events/eventBus";
import type { GameEventMap } from "./events/gameEvents";
import { createLeaderboardRepository } from "./leaderboard/leaderboardRepositoryFactory";
import { getLeaderboardScoreBreakdown } from "./leaderboard/leaderboardTypes";
import type { GlobalLeaderboardRecord, LeaderboardRecord, OperationLeaderboardFilter } from "./leaderboard/leaderboardTypes";
import { getBiomeLabel, getLanguage, getModeLabel, setLanguage, t } from "./localization/i18n";
import { loadPlayerIdentity, savePlayerIdentity, type PlayerIdentity } from "./player/playerIdentity";
import { createProgressRepository } from "./progress/progressRepositoryFactory";
import type { SavedGameProgress } from "./progress/progressTypes";
import { CampaignSessionStore } from "./progression/campaignSessionStore";
import type { CampaignMode, MissionResult, OperativeSessionProfile, OperativeStatus } from "./progression/campaignTypes";
import { RunManager } from "./run/runManager";
import { validateOperationStart } from "./run/operationStartValidation";
import { BoardView } from "./ui/boardView";
import { HudView } from "./ui/hudView";
import { hydratePortraitFallbacks, renderPortraitMarkup } from "./ui/portraitView";
import {
  formatBestResult,
  formatBestResultMeta,
  renderHpBar,
  renderMedalStrip,
  renderPerkTags,
  renderUnlockedAwards
} from "./ui/renderHelpers";
import { createApp, showScreen } from "./ui/screens";
import type { AppScreen } from "./ui/screens";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const refs = createApp(root);
const bus = new EventBus<GameEventMap>();
const campaignStore = new CampaignSessionStore();
const leaderboardRepository = createLeaderboardRepository();
const progressRepository = createProgressRepository();
const runManager = new RunManager(bus, campaignStore);

let playerIdentity: PlayerIdentity = loadPlayerIdentity();
let selectedCampaignMode: CampaignMode = "squad";
let selectedSoloCharacterId = CHARACTERS[0].id;
let selectedOperationId = "";
let profileReturnScreen: AppScreen = "preparation";
let recordsReturnScreen: AppScreen = "mainMenu";
let recordsFilter: OperationLeaderboardFilter = {
  mode: "squad",
  cycleIndex: 1,
  operationIndex: 1
};
let debriefCharacterId = "";
let pendingDebriefTimer: number | null = null;
let lastMissionResult: MissionResult | null = null;
let tacticalMode: "lada-tools" | null = null;
let tacticalScanCharge = 0;
let tacticalScanMax = 0;
let tacticalRepairCharge = 0;
let tacticalRepairMax = 0;
let campaignActive = false;
let campaignJustStarted = false;
let confirmAction: (() => void) | null = null;
const lastQuotes = new Map<string, string>();
const BLAST_DEBRIEF_DELAY_MS = 4000;

const boardView = new BoardView(refs.boardWrap, refs.board, runManager, bus, {
  onTacticalCell: (row, col) => handleTacticalCell(row, col)
});
const hudView = new HudView(refs, runManager, bus);

refs.playerNameInput.value = playerIdentity.displayName;
void updateContinueButton();

refs.playerNameInput.addEventListener("input", () => {
  refs.playerNameError.classList.add("is-hidden");
  playerIdentity = savePlayerIdentity(refs.playerNameInput.value, playerIdentity);
});

refs.campaignModeCards.forEach((button) => {
  button.addEventListener("click", () => {
    selectedCampaignMode = button.dataset.mode === "solo" ? "solo" : "squad";
    refs.campaignModeCards.forEach((card) => card.classList.toggle("is-selected", card === button));
  });
});

refs.languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.language;

    if (language === "ru" || language === "en" || language === "es") {
      playerIdentity = savePlayerIdentity(refs.playerNameInput.value, playerIdentity);
      setLanguage(language);
      window.location.reload();
    }
  });
});

refs.mainStartButton.addEventListener("click", () => {
  const playerName = getValidatedPlayerName();

  if (!playerName) {
    refs.playerNameError.classList.remove("is-hidden");
    refs.playerNameInput.focus();
    return;
  }

  clearPendingDebrief();
  clearOutcomeState();
  campaignStore.startSession(selectedCampaignMode, playerIdentity.playerId, playerName);
  campaignActive = true;
  campaignJustStarted = true;
  lastQuotes.clear();
  void persistCampaign();

  if (selectedCampaignMode === "solo") {
    renderSoloRoster();
    showScreen(refs, "soloSelect");
    return;
  }

  enterPreparation();
});

refs.mainContinueButton.addEventListener("click", async () => {
  const saved = await progressRepository.load(playerIdentity.playerId);

  if (!saved) {
    await updateContinueButton();
    return;
  }

  playerIdentity = savePlayerIdentity(saved.playerIdentity.displayName, saved.playerIdentity, saved.playerIdentity.email);
  setLanguage(saved.language);
  refs.playerNameInput.value = playerIdentity.displayName;
  campaignStore.restoreSession(saved.campaign);
  selectedCampaignMode = saved.campaign.mode;
  selectedOperationId = campaignStore.getOpenOperations()[0]?.id ?? campaignStore.getOperationPool()[0]?.id ?? "";
  campaignActive = !campaignStore.isSessionEnded();
  campaignJustStarted = false;
  lastQuotes.clear();
  enterPreparation();
});

refs.recordsButton.addEventListener("click", () => {
  clearOutcomeState();
  recordsReturnScreen = "mainMenu";
  void renderRecords();
  showScreen(refs, "records");
});

refs.recordsBackButton.addEventListener("click", () => {
  if (recordsReturnScreen === "mainMenu") {
    clearPageBiome();
  }
  showScreen(refs, recordsReturnScreen);
});

refs.soloBackButton.addEventListener("click", () => {
  clearPageBiome();
  showScreen(refs, "mainMenu");
});

refs.soloConfirmButton.addEventListener("click", () => {
  campaignStore.lockSoloOperative(selectedSoloCharacterId);
  void persistCampaign();
  enterPreparation();
});

refs.prepBackMenuButton.addEventListener("click", () => {
  maybeReturnToMainMenu();
});

refs.prepRecordsButton.addEventListener("click", () => {
  recordsReturnScreen = "preparation";
  void renderRecords();
  showScreen(refs, "records");
});

refs.operationMenuButton.addEventListener("click", () => {
  maybeReturnToMainMenu();
});

refs.operationProfileButton.addEventListener("click", () => {
  const character = runManager.getCharacter();
  openProfile(character.id, lastMissionResult ? "debrief" : "operation");
});

refs.characterSelect.addEventListener("change", () => {
  refs.prepProfileButton.disabled = refs.characterSelect.value === "";
  clearPreparationError();
  renderOperativeBriefing();
});

refs.preparationScreen.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const startButton = target?.closest("[data-role='start-operation']");

  if (!startButton) {
    return;
  }

  event.preventDefault();
  beginSelectedOperation();
});

refs.revealModeButton.addEventListener("click", () => {
  setFlagMode(false);
});

refs.flagModeButton.addEventListener("click", () => {
  setFlagMode(true);
});

refs.tacticalButton.addEventListener("click", () => {
  const state = runManager.getState();
  const character = runManager.getCharacter();

  if (tacticalScanCharge + tacticalRepairCharge <= 0) {
    refs.tacticalResult.textContent = t("hud.scanSpent");
    return;
  }

  if (!state.firstMoveDone || state.status !== "playing") {
    refs.tacticalResult.textContent = t("hud.scanNeedFirst");
    return;
  }

  tacticalMode = getTacticalModeForCharacter(character.id);

  if (!tacticalMode) {
    refs.tacticalResult.textContent = t("hud.noTactical");
    return;
  }

  setFlagMode(false);
  setCharacterQuote(character.id, "perkReady");
  boardView.setTacticalMode(true);
  refs.tacticalResult.textContent = t("hud.scanPickCell");
});

refs.prepProfileButton.addEventListener("click", () => {
  const characterId = getSelectedPreparationCharacterId();

  if (characterId) {
    openProfile(characterId, "preparation");
  }
});

refs.debriefProfileButton.addEventListener("click", () => {
  if (debriefCharacterId) {
    openProfile(debriefCharacterId, "debrief");
  }
});

refs.debriefNewOperationButton.addEventListener("click", () => {
  clearPendingDebrief();
  refs.debriefScreen.classList.add("is-hidden");

  if (lastMissionResult?.sessionEnded) {
    clearOutcomeState();
    renderSessionEnd();
    showScreen(refs, "sessionEnd");
    return;
  }

  clearOutcomeState();
  enterPreparation(debriefCharacterId);
});

refs.sessionEndMenuButton.addEventListener("click", () => {
  hardReturnToMainMenu();
});

refs.profileBackButton.addEventListener("click", () => {
  showScreen(refs, profileReturnScreen);
});

refs.confirmAccept.addEventListener("click", () => {
  hideConfirmModal();
  confirmAction?.();
  confirmAction = null;
});

refs.confirmCancel.addEventListener("click", () => {
  hideConfirmModal();
});

refs.progressionClose.addEventListener("click", () => {
  hideProgressionModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || refs.progressionModal.classList.contains("is-hidden")) {
    return;
  }

  event.preventDefault();
  hideProgressionModal();
});

bus.on("GAME_STARTED", ({ biome, character }) => {
  clearPendingDebrief();
  debriefCharacterId = character.id;
  lastMissionResult = null;
  setFlagMode(false);
  setPageBiome(biome.cssClass);
  setupTacticalPerk(character.id);
  renderOperationSidePanel(character.id);
  setCharacterQuote(character.id, "startOperation");
  showScreen(refs, "operation");
});

bus.on("FIRST_MOVE_COMPLETED", ({ character }) => {
  setCharacterQuote(character.id, "firstClick");
});

bus.on("PERK_USED", ({ character }) => {
  setCharacterQuote(character.id, "perkUsed");
});

bus.on("RUN_WON", ({ character, operation, biome, result }) => {
  setFlagMode(false);
  debriefCharacterId = character.id;
  lastMissionResult = result;
  campaignActive = !result.sessionEnded;
  saveWinRecord(operation, biome.id, character, result);
  void persistCampaign();
  renderOperationSidePanel(character.id, result.profile);
  renderOperationPool();
  renderOperativeSelect(character.id);
  setDebriefQuote(character.id, result.previousRank.id !== result.currentRank.id ? "rankUp" : "victory");
  showScreen(refs, "debrief");
});

bus.on("RUN_LOST", ({ character, result }) => {
  setFlagMode(false);
  debriefCharacterId = character.id;
  lastMissionResult = result;
  campaignActive = !result.sessionEnded;
  renderOperationSidePanel(character.id, result.profile);
  renderOperationPool();
  renderOperativeSelect();
  setDebriefQuote(character.id, result.profile.status === "active" ? "survivedBlast" : "defeat");
  void persistCampaign();
  clearPendingDebrief();
  pendingDebriefTimer = window.setTimeout(() => {
    pendingDebriefTimer = null;
    hudView.markDebriefVisible();
    showScreen(refs, "debrief");
  }, BLAST_DEBRIEF_DELAY_MS);
});

clearPageBiome();
showScreen(refs, "mainMenu");

function enterPreparation(preferredCharacterId?: string): void {
  clearOutcomeState();
  clearPreparationError();
  renderOperationPool();
  renderOperativeSelect(preferredCharacterId);
  renderSelectedOperation();
  const operation = campaignStore.getOperationById(selectedOperationId);
  setPageBiome(getBiome(operation.biomeId).cssClass);
  showScreen(refs, "preparation");
}

function beginSelectedOperation(): void {
  clearPreparationError();

  const mode = campaignStore.getMode();
  const state = campaignStore.getState();
  const operation = getSelectedOperationForStart();
  const characterId = getSelectedPreparationCharacterId();
  const profile = getPreparationProfile(characterId);
  const playerName = campaignStore.getPlayerName() || playerIdentity.displayName || refs.playerNameInput.value.trim();

  if (import.meta.env.DEV) {
    console.debug("beginSelectedOperation", {
      mode,
      selectedOperation: operation?.id ?? selectedOperationId,
      selectedOperative: characterId,
      playerName
    });
  }

  const validation = validateOperationStart({
    mode,
    playerName,
    selectedOperationId,
    operationExists: Boolean(operation),
    selectedOperativeId: characterId,
    operativeStatus: profile?.status,
    soloOperativeLocked: mode !== "solo" || Boolean(state.soloOperativeId)
  });

  if (!validation.ok) {
    showPreparationError(validation.message);

    if (validation.reason === "missingPlayerName") {
      refs.playerNameError.classList.remove("is-hidden");
      showScreen(refs, "mainMenu");
      refs.playerNameInput.focus();
    }

    if (validation.reason === "missingSoloOperative") {
      renderSoloRoster();
      showScreen(refs, "soloSelect");
    }

    return;
  }

  if (!operation || !characterId) {
    showPreparationError("Ошибка запуска операции. Проверьте консоль или начните кампанию заново.");
    return;
  }

  try {
    runManager.newGame(operation, true, { characterId });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("beginSelectedOperation failed", error);
    }

    showPreparationError("Ошибка запуска операции. Проверьте консоль или начните кампанию заново.");
  }
}

function getSelectedOperationForStart(): ClassicOperation | null {
  const operations = [...campaignStore.getOpenOperations(), ...campaignStore.getOperationPool()];
  return operations.find((operation) => operation.id === selectedOperationId) ?? null;
}

function getPreparationProfile(characterId: string): OperativeSessionProfile | null {
  if (!characterId) {
    return null;
  }

  return campaignStore.getVisibleProfiles().find((profile) => profile.id === characterId) ?? null;
}

function showPreparationError(message: string): void {
  refs.preparationError.textContent = message;
  refs.preparationError.classList.remove("is-hidden");
}

function clearPreparationError(): void {
  refs.preparationError.textContent = "";
  refs.preparationError.classList.add("is-hidden");
}

function renderSoloRoster(): void {
  refs.soloRoster.innerHTML = CHARACTERS.map((character) => {
    const perk = getPerk(character.startingPerkId);
    const description = perk ? getPerkDescription(perk, "solo") : character.innateTrait.soloDescription;
    const quote = pickCharacterQuote(character.id, "greeting", getPlayerName(), lastQuotes.get(character.id) ?? null) ?? character.lines.start;

    return `
      <button class="operative-card solo-card ${character.id === selectedSoloCharacterId ? "is-selected" : ""}" data-solo-character="${character.id}" type="button">
        <div class="portrait portrait-card portrait--tall ${character.portraitClass}" data-mark="${character.portraitMark}" aria-label="${character.name}">
          ${renderPortraitMarkup(character, "active")}
        </div>
        <div class="solo-card__body">
          <strong>${character.name}</strong>
          <div class="rank-line">${t("common.hp")}: ${character.baseHp}</div>
          <p><b>${perk ? perk.label : character.innateTrait.label}</b></p>
          <p>${description}</p>
          <blockquote class="briefing-quote">${quote}</blockquote>
        </div>
      </button>
    `;
  }).join("");

  hydratePortraitFallbacks(refs.soloRoster);
  refs.soloRoster.querySelectorAll<HTMLButtonElement>("[data-solo-character]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSoloCharacterId = button.dataset.soloCharacter ?? CHARACTERS[0].id;
      renderSoloRoster();
    });
  });
}

function renderOperationPool(): void {
  const openOperations = campaignStore.getOpenOperations();
  const operations = openOperations.length > 0 ? openOperations : campaignStore.getOperationPool();

  if (!operations.some((operation) => operation.id === selectedOperationId)) {
    selectedOperationId = operations[0]?.id ?? "";
  }

  refs.operationList.innerHTML = operations.map((operation) => {
    const biome = getBiome(operation.biomeId);
    const selectedClass = operation.id === selectedOperationId ? "is-selected" : "";
    const operationLabel = operation.operationIndex === null
      ? operation.label
      : `${operation.operationIndex}. ${operation.label}`;

    return `
      <button class="operation-card ${selectedClass}" data-operation-id="${operation.id}" type="button">
        <span>
          <strong>${operationLabel}</strong>
          <small>${t("common.cycle")} ${operation.cycle} | ${tierLabel(operation.tier)} | ${getBiomeLabel(biome.id)}</small>
        </span>
        <em>${operation.rows}x${operation.cols} • ${operation.mines}</em>
      </button>
    `;
  }).join("");

  refs.operationList.querySelectorAll<HTMLButtonElement>("[data-operation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      clearPreparationError();
      selectedOperationId = button.dataset.operationId ?? selectedOperationId;
      renderOperationPool();
      renderSelectedOperation();
      const operation = campaignStore.getOperationById(selectedOperationId);
      setPageBiome(getBiome(operation.biomeId).cssClass);
    });
  });
}

function renderOperativeSelect(preferredId?: string): void {
  const visibleProfiles = campaignStore.getVisibleProfiles();
  const selectableProfiles = campaignStore.getSelectableProfiles();
  const selectableIds = new Set(selectableProfiles.map((profile) => profile.id));
  const currentSelectedId = getSelectedPreparationCharacterId();
  const selectedId = preferredId && selectableIds.has(preferredId)
    ? preferredId
    : currentSelectedId && selectableIds.has(currentSelectedId)
      ? currentSelectedId
      : selectableProfiles[0]?.id ?? "";

  refs.characterSelect.innerHTML = "";
  refs.characterField.classList.toggle("is-hidden", campaignStore.getMode() === "solo");

  selectableProfiles.forEach((profile) => {
    const character = getCharacter(profile.id);
    const rank = getRankById(profile.rankId);
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = `${character.name} | ${rank.label} | ${profile.hp}/${profile.maxHp} HP | ${profile.xp} XP`;
    refs.characterSelect.appendChild(option);
  });

  if (selectedId) {
    refs.characterSelect.value = selectedId;
  }

  renderPreparationRoster(visibleProfiles, selectedId);
  refs.startOperationButton.disabled = false;
  refs.startOperationButton.setAttribute(
    "aria-disabled",
    String(selectableProfiles.length === 0 || selectedOperationId === "" || !selectedId)
  );
  refs.prepProfileButton.disabled = !getSelectedPreparationCharacterId();
  refs.squadStatus.textContent = getRosterStatusText();
  renderOperativeBriefing();
}

function renderPreparationRoster(visibleProfiles: OperativeSessionProfile[], selectedId: string): void {
  if (campaignStore.getMode() === "solo") {
    refs.prepRoster.innerHTML = "";
    return;
  }

  if (visibleProfiles.length === 0) {
    refs.prepRoster.innerHTML = `<span class="empty-note">${t("prep.noOperatives")}</span>`;
    return;
  }

  refs.prepRoster.innerHTML = visibleProfiles.map((profile) => {
    const character = getCharacter(profile.id);
    const statusText = profile.status === "fallen" ? t("common.fallen") : t("common.active");

    return `
      <button
        class="prep-operator-card prep-operator-card--portrait ${profile.id === selectedId ? "is-selected" : ""} ${profile.status === "fallen" ? "is-fallen" : ""}"
        data-prep-character="${character.id}"
        type="button"
        aria-label="${character.name}: ${statusText}"
        title="${character.name}"
        ${profile.status === "fallen" ? "disabled" : ""}
      >
        <div class="portrait portrait-mini portrait-selector ${character.portraitClass} ${profile.status === "fallen" ? "is-fallen" : ""}" data-mark="${character.portraitMark}" aria-label="${character.name}">
          ${renderPortraitMarkup(character, profile.status)}
        </div>
      </button>
    `;
  }).join("");

  hydratePortraitFallbacks(refs.prepRoster);
  refs.prepRoster.querySelectorAll<HTMLButtonElement>("[data-prep-character]").forEach((button) => {
    button.addEventListener("click", () => {
      const characterId = button.dataset.prepCharacter ?? "";

      if (!characterId || button.disabled) {
        return;
      }

      clearPreparationError();
      refs.characterSelect.value = characterId;
      renderOperativeSelect(characterId);
    });
  });
}

function getRosterStatusText(): string {
  const state = campaignStore.getState();
  const visibleProfiles = campaignStore.getVisibleProfiles();
  const activeCount = visibleProfiles.filter((profile) => profile.status === "active").length;

  if (state.campaignCompleted) {
    return `${t("common.player")}: ${state.playerName} • ${t("debrief.campaignClosed")}`;
  }

  if (state.mode === "solo") {
    const soloProfile = visibleProfiles[0];
    return soloProfile
      ? `${getModeLabel("solo")} • ${t("common.hp")}: ${soloProfile.hp}/${soloProfile.maxHp} • ${t("common.status")}: ${soloProfile.status === "active" ? t("common.active") : t("common.fallen")}`
      : `${getModeLabel("solo")} • ${t("prep.noOperatives")}`;
  }

  return `${getModeLabel("squad")} • ${t("common.active")}: ${activeCount}/${CHARACTERS.length} • ${t("common.player")}: ${state.playerName}`;
}

function renderOperativeBriefing(): void {
  const characterId = getSelectedPreparationCharacterId();

  if (!characterId) {
    refs.operativeBriefing.innerHTML = `<span class="empty-note">${t("prep.noOperatives")}</span>`;
    return;
  }

  const operation = campaignStore.getOperationById(selectedOperationId);
  const character = getCharacter(characterId);
  const profile = campaignStore.getProfile(character.id);
  const rank = getRankById(profile.rankId);
  const mode = campaignStore.getMode();
  const nextPerk = getCharacterPerks(character.id).find((perk) => !profile.unlockedPerkIds.includes(perk.id));
  const perkTier = getPerkTierByXp(profile.xp);
  const nextImprovement = renderNextPerkImprovement(profile, mode);
  const quoteEvent: CharacterQuoteEvent = operation.tier === "special" || operation.isEndgame
    ? "specialOperation"
    : campaignJustStarted
      ? "startCampaign"
      : "greeting";
  const quote = pickCharacterQuote(character.id, quoteEvent, getPlayerName(), lastQuotes.get(character.id) ?? null) ?? character.lines.start;
  lastQuotes.set(character.id, quote);

  refs.operativeBriefing.innerHTML = `
    <div class="operative-card operative-card--briefing ${profile.status === "fallen" ? "is-fallen" : ""}">
      <div class="portrait portrait-card portrait--tall ${character.portraitClass} ${profile.status === "fallen" ? "is-fallen" : ""}" data-mark="${character.portraitMark}" aria-label="${character.name}">
        ${renderPortraitMarkup(character, profile.status)}
      </div>
      <div class="operative-card__body">
        <div class="operative-card__top">
          <strong>${character.name}</strong>
          <span class="rank-chip"><span class="rank-chip__icon">${rank.icon}</span><strong>${rank.label}</strong></span>
        </div>
        <div class="hp-inline">
          ${renderHpBar(profile.hp, profile.maxHp)}
          <span>${profile.hp}/${profile.maxHp} HP</span>
        </div>
        <p><b>${character.innateTrait.label}:</b> ${mode === "solo" ? character.innateTrait.soloDescription : character.innateTrait.squadDescription}</p>
        <div class="award-list">
          <span class="award-pill rank"><b>Ступень перков ${perkTier}</b><small>Открытые перки ниже показывают конкретные числа этой ступени.</small></span>
          ${renderPerkTags(profile, mode, t("prep.noPerks"))}
        </div>
        ${nextPerk ? `<p><b>${t("prep.nextPerk")}:</b> ${nextPerk.label} — ${nextPerk.unlockMinXp} XP. ${getPerkEffectDescription(nextPerk.id, mode, perkTier)}</p>` : nextImprovement}
        <blockquote class="briefing-quote">${quote}</blockquote>
      </div>
    </div>
  `;

  hydratePortraitFallbacks(refs.operativeBriefing);
  campaignJustStarted = false;
}

function renderSelectedOperation(): void {
  if (!selectedOperationId) {
    refs.selectedOperationTitle.textContent = t("prep.operations");
    refs.selectedOperationDescription.textContent = "";
    refs.selectedOperationMeta.textContent = "";
    return;
  }

  const operation = campaignStore.getOperationById(selectedOperationId);
  const biome = getBiome(operation.biomeId);
  const state = campaignStore.getState();
  const openCount = campaignStore.getOpenOperations().length;

  refs.cycleStatus.textContent = state.endgameUnlocked
    ? t("prep.endgameNote")
    : operation.tier === "special"
      ? t("prep.specialNote")
      : `${t("common.cycle")} ${state.cycle}/5 • ${t("prep.operations")}: ${openCount}/7`;
  refs.selectedOperationTitle.textContent = operation.label;
  refs.selectedOperationDescription.textContent = operation.description;
  refs.selectedOperationMeta.textContent = `${operation.rows}x${operation.cols} • ${operation.mines} ${t("common.mines").toLowerCase()} • ${getBiomeLabel(biome.id)} • +${operation.xpWin} XP • -3 HP при подрыве`;
}

function openProfile(characterId: string, returnScreen: AppScreen): void {
  profileReturnScreen = returnScreen;
  if (lastMissionResult) {
    hudView.clearSceneState();
    clearPendingDebrief();
    refs.debriefScreen.classList.add("is-hidden");
  }
  renderProfile(characterId);
  showScreen(refs, "profile");
}

function renderProfile(characterId: string): void {
  const character = getCharacter(characterId);
  const profile = campaignStore.getProfile(character.id);
  const rank = getRankById(profile.rankId);
  const nextRank = getNextRank(profile.xp);
  const totalRuns = profile.wins + profile.losses;
  const nextRankText = profile.status === "fallen"
    ? t("debrief.statusFrozen")
    : nextRank
      ? `${t("profile.nextRank")} ${nextRank.label}: ${Math.max(0, nextRank.minXp - profile.xp)} XP`
      : t("profile.maxRank");
  const fallenOperation = profile.fallenOperationId ? getOperationLabel(profile.fallenOperationId) : "";
  const nextRankBenefit = getNextRankBenefit(profile.xp);
  const perkTier = getPerkTierByXp(profile.xp);
  const hpBonus = getHpBonusByXp(profile.xp);

  refs.profileContent.innerHTML = `
    <section class="roster-tabs" aria-label="Состав кампании">
      ${renderRosterTabs(character.id)}
    </section>

    <section class="profile-summary dossier-card ${profile.status === "fallen" ? "is-fallen" : ""}">
      <div class="portrait portrait-large portrait--tall ${character.portraitClass} ${profile.status === "fallen" ? "is-fallen" : ""}" data-mark="${character.portraitMark}" aria-label="${character.name}">
        ${renderPortraitMarkup(character, profile.status)}
      </div>
      <div class="profile-summary__body">
        <p class="eyebrow">${character.name}</p>
        <div class="profile-summary__top">
          <h2>${rank.label}</h2>
          <span class="rank-chip"><span class="rank-chip__icon">${rank.icon}</span><strong>${rank.label}</strong></span>
        </div>
        <p><span class="status-pill ${profile.status}">${profile.status === "fallen" ? t("common.fallen") : t("common.active")}</span></p>
        <div class="hp-inline">
          ${renderHpBar(profile.hp, profile.maxHp)}
          <span>${profile.hp}/${profile.maxHp} HP</span>
        </div>
        <p><b>${character.innateTrait.label}:</b> ${campaignStore.getMode() === "solo" ? character.innateTrait.soloDescription : character.innateTrait.squadDescription}</p>
        <p><b>${t("profile.rankBonuses")}:</b> ступень перков ${perkTier} • +${hpBonus} к max HP • 1 HP за каждое новое звание.</p>
        <p>${nextRankText}</p>
        ${nextRankBenefit ? `<p><b>${t("common.next")}:</b> ${nextRankBenefit.label}</p>` : ""}
        ${renderNextPerkImprovement(profile, campaignStore.getMode())}
        ${profile.status === "fallen" && fallenOperation ? `<p class="fatal-note">${t("profile.fallenAt")}: ${fallenOperation}</p>` : ""}
        <div class="button-row">
          <button class="button button-secondary" data-open-progression type="button">${t("profile.progression")}</button>
        </div>
      </div>
    </section>

    <section class="profile-grid" aria-label="Сессионная статистика оперативника">
      <div class="hud-item"><span class="hud-label">${t("profile.wins")}</span><strong class="hud-value">${profile.wins}</strong></div>
      <div class="hud-item"><span class="hud-label">${t("profile.losses")}</span><strong class="hud-value">${profile.losses}</strong></div>
      <div class="hud-item"><span class="hud-label">${t("common.hp")}</span><strong class="hud-value">${profile.hp}/${profile.maxHp}</strong></div>
      <div class="hud-item"><span class="hud-label">${t("profile.operations")}</span><strong class="hud-value">${totalRuns}</strong></div>
      <div class="hud-item"><span class="hud-label">${t("profile.bestStreak")}</span><strong class="hud-value">${profile.bestWinStreak}</strong></div>
      <div class="hud-item"><span class="hud-label">Ступень перков</span><strong class="hud-value">${perkTier}</strong></div>
    </section>

    <section class="profile-section">
      <h3>${t("profile.rankBonuses")}</h3>
      <div class="award-list">${renderRankBenefits(profile.xp)}</div>
    </section>
    <section class="profile-section">
      <h3>${t("common.perks")}</h3>
      <div class="award-list">${renderPerkTags(profile, campaignStore.getMode(), t("prep.noPerks"))}</div>
    </section>
    <section class="profile-section">
      <h3>${t("profile.bestResults")}</h3>
      <div class="profile-list">${renderBestResults(profile)}</div>
    </section>
    <section class="profile-section">
      <h3>${t("common.achievements")}</h3>
      <div class="award-list">${renderUnlockedAwards(profile.unlockedAchievementIds, "achievement", t("profile.empty"))}</div>
    </section>
    <section class="profile-section">
      <h3>${t("common.medals")}</h3>
      <div class="medal-strip medal-strip--large">${renderMedalStrip(profile.unlockedMedalIds, t("profile.empty"))}</div>
      <div class="award-list">${renderUnlockedAwards(profile.unlockedMedalIds, "medal", t("profile.empty"))}</div>
    </section>
  `;

  hydratePortraitFallbacks(refs.profileContent);
  refs.profileContent.querySelectorAll<HTMLButtonElement>("[data-profile-character]").forEach((button) => {
    button.addEventListener("click", () => renderProfile(button.value));
  });
  refs.profileContent.querySelector<HTMLButtonElement>("[data-open-progression]")?.addEventListener("click", () => {
    openRankProgression(character.id);
  });
}

function openRankProgression(characterId: string): void {
  const character = getCharacter(characterId);
  const profile = campaignStore.getProfile(characterId);
  const currentRank = getRankById(profile.rankId);
  const nextRank = getNextRank(profile.xp);
  const entries = getRankProgressionForCharacter(characterId, campaignStore.getMode());

  refs.progressionTitle.textContent = `${character.name} — ${t("progression.title")}`;
  refs.progressionSubtitle.textContent = nextRank
    ? t("progression.next", { xp: Math.max(0, nextRank.minXp - profile.xp) })
    : t("progression.maxed");
  refs.progressionContent.innerHTML = entries.map((entry) => {
    const unlocked = profile.xp >= entry.xpRequired;
    const current = entry.rankId === currentRank.id;

    return `
      <article class="progression-entry ${unlocked ? "is-unlocked" : ""} ${current ? "is-current" : ""}">
        <div class="progression-entry__head">
          <span class="rank-chip">
            <span class="rank-chip__icon">${entry.icon}</span>
            <strong>${entry.title}</strong>
          </span>
          <span class="progression-entry__xp">${entry.xpRequired} XP</span>
        </div>
        <ul class="progression-entry__bonuses">
          ${entry.bonuses.map((bonus) => `<li>${bonus}</li>`).join("")}
        </ul>
      </article>
    `;
  }).join("");
  refs.progressionModal.classList.remove("is-hidden");
  refs.progressionModal.setAttribute("aria-hidden", "false");
}

function hideProgressionModal(): void {
  refs.progressionModal.classList.add("is-hidden");
  refs.progressionModal.setAttribute("aria-hidden", "true");
}

function getOperationLabel(operationId: string): string {
  const operation = campaignStore.getOperationById(operationId);
  return operation.id === operationId ? operation.label : operationId;
}

function renderRankBenefits(xp: number): string {
  return getUnlockedRankBenefits(xp)
    .map((benefit) => `<span class="award-pill rank"><b>${benefit.label}</b><small>${benefit.description}</small></span>`)
    .join("");
}

function renderNextPerkImprovement(profile: OperativeSessionProfile, mode: CampaignMode): string {
  const perkTier = getPerkTierByXp(profile.xp);
  const next = profile.unlockedPerkIds
    .map((id) => getPerk(id))
    .filter((perk): perk is NonNullable<typeof perk> => Boolean(perk))
    .map((perk) => ({
      label: perk.label,
      effect: getNextPerkEffectDescription(perk.id, mode, perkTier)
    }))
    .find((item) => item.effect !== null);

  return next
    ? `<p><b>Следующее улучшение:</b> ${next.label}: ${next.effect}</p>`
    : "";
}

function renderRosterTabs(activeCharacterId: string): string {
  return campaignStore.getVisibleProfiles().map((profile) => {
    const character = getCharacter(profile.id);
    const rank = getRankById(profile.rankId);
    const stateClass = profile.status === "fallen" ? "is-fallen" : "is-active";
    const selectedClass = character.id === activeCharacterId ? "is-selected" : "";

    return `
      <button class="roster-tab ${stateClass} ${selectedClass}" data-profile-character type="button" value="${character.id}">
        <span>${character.name}</span>
        <small>${profile.status === "fallen" ? t("common.fallen") : rank.label}</small>
      </button>
    `;
  }).join("");
}

function renderBestResults(profile: OperativeSessionProfile): string {
  const entries = Object.values(profile.bestResultsByOperation).sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);

  if (entries.length === 0) {
    return `<span class="empty-note">${t("profile.noWins")}</span>`;
  }

  return entries
    .map((entry) => `
      <span class="profile-row profile-row--stacked">
        <strong>${formatBestResult(entry)}</strong>
        <em>${formatBestResultMeta(entry)}</em>
      </span>
    `)
    .join("");
}

async function renderRecords(): Promise<void> {
  const operationRecords = await leaderboardRepository.getOperationRecords(recordsFilter);
  const globalRecords = await leaderboardRepository.getGlobalRecords();
  const allRecords = await leaderboardRepository.getAllLocalRecords();

  refs.recordsContent.innerHTML = `
    <section class="records-panel profile-section">
      <div class="records-tabs" aria-label="Разделы таблицы рекордов">
        <span class="records-tab is-active">По операциям</span>
        <span class="records-tab">Общий рейтинг</span>
        <span class="records-tab">Соло</span>
        <span class="records-tab">Отряд</span>
      </div>

      <div class="records-filters">
        <label>
          <span>Режим</span>
          <select class="select" data-record-filter="mode">
            <option value="squad" ${recordsFilter.mode === "squad" ? "selected" : ""}>${getModeLabel("squad")}</option>
            <option value="solo" ${recordsFilter.mode === "solo" ? "selected" : ""}>${getModeLabel("solo")}</option>
          </select>
        </label>
        <label>
          <span>Цикл</span>
          <select class="select" data-record-filter="cycle">
            ${[1, 2, 3, 4, 5].map((cycle) => `<option value="${cycle}" ${recordsFilter.cycleIndex === cycle ? "selected" : ""}>${cycle}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Операция</span>
          <select class="select" data-record-filter="operation">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map((operation) => `<option value="${operation}" ${recordsFilter.operationIndex === operation ? "selected" : ""}>${operation === 8 ? "8 · спецоперация" : operation}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="records-table-wrap">
        <h2>Топ по выбранной операции</h2>
        ${renderOperationRecordTable(operationRecords)}
      </div>
    </section>

    <section class="records-grid">
      <div class="profile-section">
        <h2>Общий рейтинг</h2>
        ${renderGlobalRecordTable(globalRecords)}
      </div>
      <div class="profile-section">
        <h2>${t("records.local")}</h2>
        <div class="profile-list">${renderRecordRows(allRecords)}</div>
      </div>
    </section>
  `;

  refs.recordsContent.querySelector<HTMLSelectElement>("[data-record-filter='mode']")?.addEventListener("change", (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    recordsFilter = { ...recordsFilter, mode: value === "solo" ? "solo" : "squad" };
    void renderRecords();
  });
  refs.recordsContent.querySelector<HTMLSelectElement>("[data-record-filter='cycle']")?.addEventListener("change", (event) => {
    recordsFilter = { ...recordsFilter, cycleIndex: Number((event.currentTarget as HTMLSelectElement).value) };
    void renderRecords();
  });
  refs.recordsContent.querySelector<HTMLSelectElement>("[data-record-filter='operation']")?.addEventListener("change", (event) => {
    recordsFilter = { ...recordsFilter, operationIndex: Number((event.currentTarget as HTMLSelectElement).value) };
    void renderRecords();
  });
}

function renderRecordRows(records: LeaderboardRecord[]): string {
  if (records.length === 0) {
    return `<span class="empty-note">${t("records.empty")}</span>`;
  }

  return records.slice(0, 10).map((record) => `
    <span class="profile-row profile-row--stacked">
      <strong>${formatBestResult(record)}</strong>
      <em>${formatBestResultMeta(record)}</em>
    </span>
  `).join("");
}

function renderOperationRecordTable(records: LeaderboardRecord[]): string {
  if (records.length === 0) {
    return `<span class="empty-note">${t("records.empty")}</span>`;
  }

  return `
    <table class="records-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Игрок</th>
          <th>Оперативник</th>
          <th>Время</th>
          <th>Очки</th>
          <th>Дата</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${record.playerName}</td>
            <td>${record.operativeName}</td>
            <td>${record.elapsedSeconds} сек</td>
            <td>${record.score}</td>
            <td>${formatRecordDate(record.createdAt)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderGlobalRecordTable(records: GlobalLeaderboardRecord[]): string {
  if (records.length === 0) {
    return `<span class="empty-note">${t("records.empty")}</span>`;
  }

  return `
    <table class="records-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Игрок</th>
          <th>Очки</th>
          <th>Победы</th>
          <th>Лучший рубеж</th>
          <th>Оперативник</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${record.playerName}</td>
            <td>${record.totalScore}</td>
            <td>${record.wins}</td>
            <td>Цикл ${record.bestCycleIndex}, операция ${record.bestOperationIndex ?? "финал"}</td>
            <td>${record.topOperativeName}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function saveWinRecord(operation: ClassicOperation, biomeId: ClassicOperation["biomeId"], character: ReturnType<typeof getCharacter>, result: MissionResult): void {
  const biome = getBiome(biomeId);
  const medalsEarnedCount = result.newMedalIds.length;
  const remainingHp = result.profile.hp;
  const rankIndex = getRankIndexByXp(result.profile.xp);
  const scoreBreakdown = getLeaderboardScoreBreakdown({
    baseOperationXp: operation.xpWin,
    parTimeSeconds: operation.parTimeSeconds,
    elapsedSeconds: result.elapsedSeconds,
    remainingHp,
    medalsEarnedCount,
    rankIndex
  });
  const score = scoreBreakdown.total;

  refs.debriefAwards.insertAdjacentHTML("beforeend", `
    <span class="award-pill score">
      <b>${t("common.score")}: ${score}</b>
      <small>XP ${scoreBreakdown.baseOperationXp} · время +${scoreBreakdown.timeBonus} · HP +${scoreBreakdown.hpBonus} · медали +${scoreBreakdown.medalBonus} · звание +${scoreBreakdown.rankBonus}</small>
    </span>
  `);

  void leaderboardRepository.saveRecord({
    playerId: campaignStore.getPlayerId(),
    playerName: campaignStore.getPlayerName(),
    mode: result.campaignMode,
    cycleIndex: result.cycle,
    operationId: operation.id,
    operationIndex: operation.operationIndex,
    operationName: operation.label,
    biomeId,
    biomeName: biome.name,
    boardRows: operation.rows,
    boardCols: operation.cols,
    mineCount: operation.mines,
    operativeId: character.id,
    operativeName: character.name,
    elapsedSeconds: result.elapsedSeconds,
    score,
    baseOperationXp: operation.xpWin,
    parTimeSeconds: operation.parTimeSeconds,
    medalsEarnedCount,
    remainingHp,
    rankIndex,
    rankBonus: scoreBreakdown.rankBonus,
    scoreBreakdown,
    usedPerks: result.perkEvents
  });
}

function formatRecordDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru-RU");
}

function renderOperationSidePanel(characterId: string, profileOverride?: OperativeSessionProfile): void {
  const character = getCharacter(characterId);
  const profile = profileOverride ?? campaignStore.getProfile(characterId);
  const rank = getRankById(profile.rankId);
  const perkTier = getPerkTierByXp(profile.xp);

  refs.operativeName.textContent = character.name;
  refs.operativeRankIcon.textContent = rank.icon;
  refs.operativeRank.textContent = rank.label;
  refs.operativeHpBar.innerHTML = renderHpBar(profile.hp, profile.maxHp);
  refs.operativeHpText.textContent = `${profile.hp}/${profile.maxHp}`;
  refs.operativeStatus.textContent = profile.status === "fallen" ? t("common.fallen") : t("common.active");
  refs.operativeStatus.className = `status-pill ${profile.status}`;
  refs.operativeMedals.innerHTML = renderMedalStrip(profile.unlockedMedalIds, t("profile.empty"));
  const armor = getVisibleTemporaryArmor(characterId);
  refs.operativePerks.innerHTML = `
    <span class="award-pill rank"><b>Ступень перков ${perkTier}</b><small>Ниже показаны реальные эффекты текущей ступени.</small></span>
    ${armor > 0 ? `<span class="award-pill perk"><b>Броня: ${armor}</b><small>Временная броня Сергея поглотит ${armor} HP урона в этой операции.</small></span>` : ""}
    ${renderPerkTags(profile, campaignStore.getMode(), t("prep.noPerks"))}
  `;
  const status: OperativeStatus = profile.status;
  refs.portrait.innerHTML = "";
  refs.portrait.classList.remove("is-fallen");
  refs.portrait.classList.add("portrait", "portrait-sidebar", character.portraitClass);
  refs.portrait.dataset.mark = character.portraitMark;
  refs.portrait.setAttribute("aria-label", character.name);
  refs.portrait.innerHTML = renderPortraitMarkup(character, status);
  hydratePortraitFallbacks(refs.portrait);
}

function getVisibleTemporaryArmor(characterId: string): number {
  try {
    return runManager.getCharacter().id === characterId ? runManager.getTemporaryArmor() : 0;
  } catch {
    return 0;
  }
}

function setupTacticalPerk(characterId: string): void {
  tacticalMode = null;
  tacticalScanCharge = 0;
  tacticalScanMax = 0;
  tacticalRepairCharge = 0;
  tacticalRepairMax = 0;
  boardView.clearTacticalCells();

  if (characterId === "lada") {
    const profile = campaignStore.getProfile(characterId);
    const perkTier = getPerkTierByXp(profile.xp);

    if (profile.unlockedPerkIds.includes("lada-local-scan")) {
      tacticalScanMax = perkTier >= 2 ? 2 : 1;
      tacticalScanCharge = tacticalScanMax;
    }

    if (profile.unlockedPerkIds.includes("lada-field-restoration")) {
      tacticalRepairMax = perkTier >= 2 ? 2 : 1;
      tacticalRepairCharge = tacticalRepairMax;
    }
  }

  const hasCharge = tacticalScanCharge + tacticalRepairCharge > 0;
  refs.tacticalPanel.classList.toggle("is-disabled", !hasCharge);
  refs.tacticalButton.disabled = !hasCharge;
  refs.tacticalButton.textContent = characterId === "lada" ? "Инструменты Лады" : t("hud.perk");
  updateTacticalChargeText();
  refs.tacticalResult.textContent = characterId === "lada" ? "Сканируй клетки или выбери флаг для проверки." : t("hud.noTactical");
}

function getTacticalModeForCharacter(characterId: string): "lada-tools" | null {
  return characterId === "lada" ? "lada-tools" : null;
}

function handleTacticalCell(row: number, col: number): void {
  const state = runManager.getState();

  if (tacticalMode === "lada-tools") {
    const cell = state.cells.find((candidate) => candidate.row === row && candidate.col === col);
    const profile = campaignStore.getProfile(runManager.getCharacter().id);
    const perkTier = getPerkTierByXp(profile.xp);

    if (cell?.state === "flagged" && profile.unlockedPerkIds.includes("lada-field-restoration")) {
      handleLadaFlagRepair(row, col, perkTier);
      return;
    }

    if (tacticalScanCharge <= 0) {
      refs.tacticalResult.textContent = "Сканер разряжен. Можно выбрать флаг для восстановления, если заряд есть.";
      return;
    }

    const sector = getCellSector(state, row, col, perkTier >= 3 ? 4 : 3);
    const mines = sector.filter((cell) => cell.hasMine).length;
    tacticalScanCharge -= 1;
    tacticalMode = null;
    boardView.setTacticalMode(false);
    boardView.setTacticalCells(sector.map((cell) => cell.id));
    refs.tacticalButton.disabled = tacticalScanCharge + tacticalRepairCharge <= 0;
    updateTacticalChargeText();
    refs.tacticalResult.textContent = t("hud.scanDone", { count: sector.length, mines });
    runManager.recordPerkEvent(`Сканер сектора: Лада проверила ${sector.length} клетки; мин в секторе: ${mines}.`);
    setCharacterQuote(runManager.getCharacter().id, "perkUsed");
  }
}

function handleLadaFlagRepair(row: number, col: number, perkTier: number): void {
  if (tacticalRepairCharge <= 0) {
    refs.tacticalResult.textContent = "Полевое восстановление разряжено.";
    return;
  }

  const result = runManager.repairFlag(row, col);

  if (result === "not-flagged") {
    refs.tacticalResult.textContent = "Выбери уже поставленный флаг.";
    return;
  }

  if (result === "removed-wrong") {
    tacticalRepairCharge -= 1;
    refs.tacticalResult.textContent = "Полевое восстановление: ошибочный флаг снят без штрафа.";
  } else {
    if (perkTier < 3) {
      tacticalRepairCharge -= 1;
      refs.tacticalResult.textContent = "Полевое восстановление: флаг был правильным, заряд потрачен.";
      runManager.recordPerkEvent("Полевое восстановление: выбранный флаг был правильным, заряд потрачен.");
    } else {
      refs.tacticalResult.textContent = "Полевое восстановление: флаг правильный, заряд сохранён.";
      runManager.recordPerkEvent("Полевое восстановление: правильный флаг подтверждён, заряд сохранён.");
    }
  }

  tacticalMode = null;
  boardView.setTacticalMode(false);
  refs.tacticalButton.disabled = tacticalScanCharge + tacticalRepairCharge <= 0;
  updateTacticalChargeText();
  setCharacterQuote(runManager.getCharacter().id, "perkUsed");
}

function updateTacticalChargeText(): void {
  if (tacticalScanMax + tacticalRepairMax === 0) {
    refs.tacticalCharge.textContent = "0/0";
    return;
  }

  refs.tacticalCharge.textContent = `Скан ${tacticalScanCharge}/${tacticalScanMax} • Ремонт ${tacticalRepairCharge}/${tacticalRepairMax}`;
}

function getCellSector(state: BoardState, row: number, col: number, size: number): Cell[] {
  const candidates = [
    state.cells.find((cell) => cell.row === row && cell.col === col),
    state.cells.find((cell) => cell.row === row && cell.col === col - 1),
    state.cells.find((cell) => cell.row === row && cell.col === col + 1),
    state.cells.find((cell) => cell.row === row - 1 && cell.col === col),
    state.cells.find((cell) => cell.row === row + 1 && cell.col === col)
  ].filter((cell): cell is Cell => cell !== undefined);

  return candidates.slice(0, size);
}

function renderSessionEnd(): void {
  const state = campaignStore.getState();

  if (state.campaignCompleted) {
    refs.sessionEndTitle.textContent = "Великая спецоперация закрыта";
    refs.sessionEndDetails.textContent = t("debrief.campaignClosed");
    refs.sessionEndScreen.querySelector(".session-end-panel")?.classList.remove("is-loss");
    refs.sessionEndScreen.querySelector(".session-end-panel")?.classList.add("is-win");
    return;
  }

  refs.sessionEndTitle.textContent = state.mode === "squad" ? "Группа выбыла" : "Оперативник выбыл";
  refs.sessionEndDetails.textContent = state.mode === "squad"
    ? "Весь состав потерян. Эта кампания закрыта."
    : "Резерв исчерпан. Эта кампания закрыта.";
  refs.sessionEndScreen.querySelector(".session-end-panel")?.classList.remove("is-win");
  refs.sessionEndScreen.querySelector(".session-end-panel")?.classList.add("is-loss");
}

function maybeReturnToMainMenu(): void {
  if (!campaignActive) {
    hardReturnToMainMenu();
    return;
  }

  refs.confirmTitle.textContent = t("confirm.exitTitle");
  refs.confirmBody.textContent = t("confirm.exitBody");
  showConfirmModal(() => {
    hardReturnToMainMenu();
  });
}

function hardReturnToMainMenu(): void {
  clearPendingDebrief();
  clearOutcomeState();
  clearPageBiome();
  lastMissionResult = null;
  campaignActive = false;
  campaignJustStarted = false;
  void progressRepository.clear(playerIdentity.playerId).then(() => updateContinueButton());
  showScreen(refs, "mainMenu");
}

function showConfirmModal(action: () => void): void {
  confirmAction = action;
  refs.confirmModal.classList.remove("is-hidden");
}

function hideConfirmModal(): void {
  refs.confirmModal.classList.add("is-hidden");
}

function setPageBiome(cssClass: string): void {
  refs.game.classList.remove("command-theme");
  BIOMES.forEach((biome) => {
    document.body.classList.remove(`${biome.cssClass}-page`);
    refs.game.classList.remove(biome.cssClass);
  });
  const biome = BIOMES.find((item) => item.cssClass === cssClass);
  if (biome) {
    refs.game.style.setProperty("--biome-background-image", `url("${biome.backgroundAsset}")`);
    document.body.style.setProperty("--biome-background-image", `url("${biome.backgroundAsset}")`);
  }
  document.body.classList.add(`${cssClass}-page`);
  refs.game.classList.add(cssClass);
}

function clearPageBiome(): void {
  BIOMES.forEach((biome) => {
    document.body.classList.remove(`${biome.cssClass}-page`);
    refs.game.classList.remove(biome.cssClass);
  });
  refs.game.style.removeProperty("--biome-background-image");
  document.body.style.removeProperty("--biome-background-image");
  refs.game.classList.add("command-theme");
}

function clearPendingDebrief(): void {
  if (pendingDebriefTimer !== null) {
    window.clearTimeout(pendingDebriefTimer);
    pendingDebriefTimer = null;
  }
}

function clearOutcomeState(): void {
  hudView.clearSceneState();
  refs.debriefScreen.classList.add("is-hidden");
  refs.debriefPanel.classList.remove("is-win", "is-loss");
}

function setFlagMode(enabled: boolean): void {
  boardView.setFlagMode(enabled);
  refs.revealModeButton.classList.toggle("is-active", !enabled);
  refs.revealModeButton.setAttribute("aria-pressed", String(!enabled));
  refs.flagModeButton.classList.toggle("is-active", enabled);
  refs.flagModeButton.setAttribute("aria-pressed", String(enabled));
  refs.inputModeLabel.textContent = enabled ? t("hud.modeFlag") : t("hud.modeReveal");
  refs.mobileInputHint.textContent = enabled ? t("hud.flagHint") : t("hud.revealHint");
}

async function persistCampaign(): Promise<void> {
  const progress: SavedGameProgress = {
    version: 1,
    playerIdentity,
    language: getLanguage(),
    campaign: campaignStore.getState(),
    savedAt: Date.now()
  };

  await progressRepository.save(progress);
  await updateContinueButton();
}

async function updateContinueButton(): Promise<void> {
  const hasSavedCampaign = await progressRepository.has(playerIdentity.playerId);
  refs.mainContinueButton.classList.toggle("is-hidden", !hasSavedCampaign);
}

function tierLabel(tier: ClassicOperation["tier"]): string {
  return t(`tier.${tier}`);
}

function getSelectedPreparationCharacterId(): string {
  if (campaignStore.getMode() === "solo") {
    return campaignStore.getVisibleProfiles()[0]?.id ?? selectedSoloCharacterId;
  }

  return refs.characterSelect.value;
}

function getValidatedPlayerName(): string | null {
  const name = refs.playerNameInput.value.trim().replace(/\s+/g, " ").slice(0, 24);

  if (!name) {
    return null;
  }

  refs.playerNameInput.value = name;
  playerIdentity = savePlayerIdentity(name, playerIdentity);
  return name;
}

function getPlayerName(): string {
  return refs.playerNameInput.value.trim() || playerIdentity.displayName || campaignStore.getPlayerName() || "Игрок";
}

function setCharacterQuote(characterId: string, eventType: CharacterQuoteEvent): void {
  const quote = pickCharacterQuote(characterId, eventType, getPlayerName(), lastQuotes.get(characterId) ?? null);

  if (!quote) {
    return;
  }

  lastQuotes.set(characterId, quote);
  refs.speaker.textContent = getCharacter(characterId).name;
  refs.quote.textContent = quote;
}

function setDebriefQuote(characterId: string, eventType: CharacterQuoteEvent): void {
  const quote = pickCharacterQuote(characterId, eventType, getPlayerName(), lastQuotes.get(characterId) ?? null);

  if (!quote) {
    return;
  }

  lastQuotes.set(characterId, quote);
  refs.quote.textContent = quote;
  refs.debriefQuote.textContent = quote;
}
