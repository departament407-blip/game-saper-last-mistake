import { ACHIEVEMENTS } from "../data/achievements";
import { MEDALS } from "../data/medals";
import { getPerk, getPerkDescription } from "../data/perks";
import { getPerkTierByXp } from "../data/rankBenefits";
import { getBiomeLabel, getModeLabel, t } from "../localization/i18n";
import type { LeaderboardRecord } from "../leaderboard/leaderboardTypes";
import type { CampaignMode, OperativeBestResult, OperativeSessionProfile } from "../progression/campaignTypes";

type RecordLike = OperativeBestResult | LeaderboardRecord;

export function renderHpBar(currentHp: number, maxHp: number): string {
  const segments = Array.from({ length: Math.max(0, maxHp) }, (_, index) => {
    const active = index < currentHp;
    return `<span class="hp-segment ${active ? "is-filled" : ""}" aria-hidden="true"></span>`;
  }).join("");

  return `
    <div class="hp-bar" aria-label="${t("common.hp")}: ${currentHp}/${maxHp}">
      ${segments}
    </div>
  `;
}

export function renderMedalStrip(medalIds: string[], emptyText: string): string {
  if (medalIds.length === 0) {
    return `<span class="empty-note">${emptyText}</span>`;
  }

  return medalIds
    .map((id) => MEDALS.find((medal) => medal.id === id))
    .filter((medal): medal is NonNullable<typeof medal> => Boolean(medal))
    .map((medal) => `
      <span class="medal-chip" title="${medal.label}: ${medal.description}">
        <img class="medal-chip__image" alt="" src="${medal.assetPath}" onerror="this.hidden=true">
        <span class="medal-chip__fallback" aria-hidden="true">${medal.icon}</span>
      </span>
    `)
    .join("");
}

export function renderPerkTags(profile: OperativeSessionProfile, mode: CampaignMode, emptyText: string): string {
  if (profile.unlockedPerkIds.length === 0) {
    return `<span class="award-pill muted">${emptyText}</span>`;
  }

  const perkTier = getPerkTierByXp(profile.xp);

  return profile.unlockedPerkIds
    .map((id) => getPerk(id))
    .filter((perk): perk is NonNullable<typeof perk> => Boolean(perk))
    .map((perk) => `
      <span class="award-pill perk">
        <b>${perk.label}</b>
        <small>${getPerkDescription(perk, mode, perkTier)}</small>
      </span>
    `)
    .join("");
}

export function renderUnlockedAwards(ids: string[], type: "achievement" | "medal", emptyText: string): string {
  if (ids.length === 0) {
    return `<span class="award-pill muted">${emptyText}</span>`;
  }

  const source = type === "achievement" ? ACHIEVEMENTS : MEDALS;
  const className = type === "achievement" ? "award-pill" : "award-pill medal";

  return ids
    .map((id) => source.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => {
      const asset = "assetPath" in item
        ? `<img class="award-icon" alt="" src="${item.assetPath}" onerror="this.hidden=true">`
        : "";
      return `
        <span class="${className}">
          <b>${asset}<span>${item.icon}</span>${item.label}</b>
          <small>${item.description}</small>
        </span>
      `;
    })
    .join("");
}

export function formatBestResult(record: RecordLike): string {
  const playerLabel = getRecordDisplayName(record);
  const operationIndex = getRecordOperationIndex(record);
  const operationName = getRecordOperationName(record);
  const operationLabel = operationIndex === null
    ? operationName
    : `${t("common.operation")} ${operationIndex}`;

  return [
    playerLabel,
    getModeLabel(record.mode),
    `${t("common.cycle")} ${getRecordCycle(record)}`,
    operationLabel,
    `«${operationName}»`,
    getBiomeLabel(record.biomeId),
    `${getRecordBoardRows(record)}x${getRecordBoardCols(record)}`,
    `${record.mineCount} ${t("common.mines").toLowerCase()}`,
    `${record.elapsedSeconds} сек.`
  ].join(" · ");
}

export function formatBestResultMeta(record: RecordLike): string {
  const playerLabel = getRecordDisplayName(record);
  const xp = "xpAwarded" in record ? record.xpAwarded : record.baseOperationXp;
  return `${t("common.player")}: ${playerLabel} | ${t("common.score")}: ${record.score} | XP: ${xp}`;
}

function getRecordDisplayName(record: RecordLike): string {
  return "displayName" in record && typeof record.displayName === "string" && record.displayName
    ? record.displayName
    : record.playerName;
}

function getRecordCycle(record: RecordLike): number {
  return "cycleIndex" in record ? record.cycleIndex : record.cycle;
}

function getRecordOperationIndex(record: RecordLike): number | null {
  return record.operationIndex;
}

function getRecordOperationName(record: RecordLike): string {
  return "operationName" in record ? record.operationName : record.operationLabel;
}

function getRecordBoardRows(record: RecordLike): number {
  return "boardRows" in record ? record.boardRows : record.boardHeight;
}

function getRecordBoardCols(record: RecordLike): number {
  return "boardCols" in record ? record.boardCols : record.boardWidth;
}
