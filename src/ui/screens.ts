import { LANGUAGES, getLanguage, t } from "../localization/i18n";
import type { CampaignMode } from "../progression/campaignTypes";

export type AppScreen =
  | "mainMenu"
  | "soloSelect"
  | "preparation"
  | "operation"
  | "debrief"
  | "sessionEnd"
  | "records"
  | "profile";

export interface AppRefs {
  game: HTMLElement;
  mainMenuScreen: HTMLElement;
  soloSelectScreen: HTMLElement;
  preparationScreen: HTMLElement;
  operationScreen: HTMLElement;
  debriefScreen: HTMLElement;
  sessionEndScreen: HTMLElement;
  recordsScreen: HTMLElement;
  profileScreen: HTMLElement;
  campaignModeCards: HTMLButtonElement[];
  languageButtons: HTMLButtonElement[];
  playerNameInput: HTMLInputElement;
  playerNameError: HTMLElement;
  mainStartButton: HTMLButtonElement;
  recordsButton: HTMLButtonElement;
  soloRoster: HTMLElement;
  soloConfirmButton: HTMLButtonElement;
  soloBackButton: HTMLButtonElement;
  prepBackMenuButton: HTMLButtonElement;
  prepRecordsButton: HTMLButtonElement;
  characterField: HTMLElement;
  prepRoster: HTMLElement;
  characterSelect: HTMLSelectElement;
  operativeBriefing: HTMLElement;
  squadStatus: HTMLElement;
  cycleStatus: HTMLElement;
  operationList: HTMLElement;
  selectedOperationTitle: HTMLElement;
  selectedOperationDescription: HTMLElement;
  selectedOperationMeta: HTMLElement;
  startOperationButton: HTMLButtonElement;
  prepProfileButton: HTMLButtonElement;
  operationProfileButton: HTMLButtonElement;
  operationMenuButton: HTMLButtonElement;
  debriefNewOperationButton: HTMLButtonElement;
  debriefProfileButton: HTMLButtonElement;
  sessionEndTitle: HTMLElement;
  sessionEndDetails: HTMLElement;
  sessionEndMenuButton: HTMLButtonElement;
  recordsContent: HTMLElement;
  recordsBackButton: HTMLButtonElement;
  profileBackButton: HTMLButtonElement;
  profileContent: HTMLElement;
  mineCount: HTMLElement;
  flagCount: HTMLElement;
  timer: HTMLElement;
  status: HTMLElement;
  tacticalPanel: HTMLElement;
  tacticalButton: HTMLButtonElement;
  tacticalCharge: HTMLElement;
  tacticalResult: HTMLElement;
  message: HTMLElement;
  boardWrap: HTMLElement;
  board: HTMLElement;
  portrait: HTMLElement;
  operativeName: HTMLElement;
  operativeRankIcon: HTMLElement;
  operativeRank: HTMLElement;
  operativeHpBar: HTMLElement;
  operativeHpText: HTMLElement;
  operativeStatus: HTMLElement;
  operativeMedals: HTMLElement;
  operativePerks: HTMLElement;
  speaker: HTMLElement;
  quote: HTMLElement;
  operationName: HTMLElement;
  operationMeta: HTMLElement;
  operationBiome: HTMLElement;
  operationCharacter: HTMLElement;
  debriefPanel: HTMLElement;
  debriefTitle: HTMLElement;
  debriefDetails: HTMLElement;
  debriefXp: HTMLElement;
  debriefRank: HTMLElement;
  debriefAwards: HTMLElement;
  debriefQuote: HTMLElement;
  confirmModal: HTMLElement;
  confirmTitle: HTMLElement;
  confirmBody: HTMLElement;
  confirmAccept: HTMLButtonElement;
  confirmCancel: HTMLButtonElement;
  progressionModal: HTMLElement;
  progressionTitle: HTMLElement;
  progressionSubtitle: HTMLElement;
  progressionContent: HTMLElement;
  progressionClose: HTMLButtonElement;
}

export function createApp(root: HTMLElement): AppRefs {
  root.innerHTML = `
    <section class="game command-theme" data-role="game" aria-label="${t("app.title")}">
      <section class="screen main-menu-screen" data-screen="mainMenu">
        <header class="command-hero">
          <div class="language-row" aria-label="Language">
            ${renderLanguageButtons()}
          </div>
          <p class="eyebrow">${t("main.eyebrow")}</p>
          <h1>${t("app.title")}</h1>
          <p class="subtitle">${t("main.subtitle")}</p>
        </header>

        <label class="input-field">
          <span>${t("main.playerName")}</span>
          <input class="text-input" data-role="player-name" type="text" maxlength="24" placeholder="${t("main.playerNamePlaceholder")}">
          <small class="field-error is-hidden" data-role="player-name-error">${t("main.playerNameError")}</small>
        </label>

        <section class="mode-grid" aria-label="Выбор режима кампании">
          ${renderModeCard("squad")}
          ${renderModeCard("solo")}
        </section>

        <div class="button-row">
          <button class="button button-primary" data-role="main-start" type="button">${t("main.start")}</button>
          <button class="button button-secondary" data-role="records-open" type="button">${t("main.records")}</button>
        </div>
      </section>

      <section class="screen solo-select-screen is-hidden" data-screen="soloSelect">
        <header class="topbar">
          <div>
            <h1>${t("solo.title")}</h1>
            <p class="subtitle">${t("solo.subtitle")}</p>
          </div>
          <button class="button button-secondary" data-role="solo-back" type="button">${t("common.back")}</button>
        </header>
        <div class="solo-roster" data-role="solo-roster"></div>
        <button class="button button-primary" data-role="solo-confirm" type="button">${t("solo.confirm")}</button>
      </section>

      <section class="screen preparation-screen is-hidden" data-screen="preparation">
        <header class="topbar">
          <div>
            <h1>${t("prep.title")}</h1>
            <p class="subtitle">${t("prep.subtitle")}</p>
          </div>
          <div class="button-row">
            <button class="button button-secondary" data-role="prep-profile" type="button">${t("prep.profile")}</button>
            <button class="button button-secondary" data-role="prep-records" type="button">${t("main.records")}</button>
            <button class="button button-secondary" data-role="prep-back-menu" type="button">${t("prep.menu")}</button>
          </div>
        </header>

        <p class="cycle-status" data-role="cycle-status"></p>

        <div class="prep-grid">
          <section class="prep-panel prep-operations" aria-label="Выбор операции">
            <h2>${t("prep.operations")}</h2>
            <div class="operation-list" data-role="operation-list"></div>
            <button class="button button-primary start-operation-cta" data-role="start-operation" type="button">${t("prep.start")}</button>
          </section>

          <section class="prep-panel prep-briefing" aria-label="Брифинг">
            <div>
              <p class="eyebrow">${t("prep.briefing")}</p>
              <h2 data-role="selected-operation-title">Операция</h2>
              <p data-role="selected-operation-description"></p>
              <p class="meta-line" data-role="selected-operation-meta"></p>
            </div>

            <p class="squad-status" data-role="squad-status"></p>

            <label class="input-field" data-role="character-field">
              <span>${t("prep.operator")}</span>
              <select class="select is-hidden" data-role="character"></select>
              <div class="prep-roster" data-role="prep-roster"></div>
            </label>

            <div class="operative-briefing" data-role="operative-briefing"></div>
          </section>
        </div>
      </section>

      <section class="screen operation-screen is-hidden" data-screen="operation">
        <div class="operation-layout">
          <aside class="operative-sidebar">
            <section class="operative-sidebar-card">
              <div class="portrait portrait-sidebar" data-role="portrait" aria-hidden="true"></div>

              <div class="operative-header">
                <div>
                  <p class="eyebrow">${t("hud.operative")}</p>
                  <h2 data-role="operative-name">Оперативник</h2>
                </div>
                <div class="rank-chip">
                  <span class="rank-chip__icon" data-role="operative-rank-icon"></span>
                  <strong data-role="operative-rank">Кадет</strong>
                </div>
              </div>

              <div class="hp-block">
                <div class="hp-block__head">
                  <span class="hud-label">${t("common.hp")}</span>
                  <strong data-role="operative-hp-text">0/0</strong>
                </div>
                <div data-role="operative-hp-bar"></div>
              </div>

              <div class="status-card">
                <span class="hud-label">${t("common.status")}</span>
                <strong data-role="operative-status">${t("common.active")}</strong>
              </div>

              <div class="quote-card">
                <strong data-role="speaker">Оперативник</strong>
                <p data-role="quote"></p>
              </div>

              <div class="sidebar-section">
                <div class="section-head">
                  <span class="hud-label">${t("common.medals")}</span>
                </div>
                <div class="medal-strip" data-role="operative-medals"></div>
              </div>

              <div class="sidebar-section">
                <div class="section-head">
                  <span class="hud-label">${t("common.perks")}</span>
                </div>
                <div class="award-list award-list--sidebar" data-role="operative-perks"></div>
              </div>

              <div class="button-row button-row--sidebar">
                <button class="button button-secondary" data-role="operation-profile" type="button">${t("hud.profile")}</button>
                <button class="button button-secondary" data-role="operation-menu" type="button">${t("hud.menu")}</button>
              </div>
            </section>
          </aside>

          <div class="operation-main">
            <header class="topbar">
              <div>
                <h1 data-role="operation-name">Операция</h1>
                <p class="subtitle" data-role="operation-meta"></p>
              </div>
            </header>

            <div class="mission-chips" aria-label="Контекст операции">
              <span>${t("hud.biome")}: <strong data-role="operation-biome">Лес</strong></span>
              <span>${t("hud.operative")}: <strong data-role="operation-character">Оперативник</strong></span>
            </div>

            <section class="hud" aria-label="Состояние партии">
              <div class="hud-item">
                <span class="hud-label">${t("hud.mines")}</span>
                <strong class="hud-value" data-role="mine-count">0</strong>
              </div>
              <div class="hud-item">
                <span class="hud-label">${t("hud.flags")}</span>
                <strong class="hud-value" data-role="flag-count">0</strong>
              </div>
              <div class="hud-item">
                <span class="hud-label">${t("hud.time")}</span>
                <strong class="hud-value" data-role="timer">000</strong>
              </div>
              <div class="hud-item">
                <span class="hud-label">${t("hud.status")}</span>
                <strong class="hud-value" data-role="status">${t("status.idle")}</strong>
              </div>
            </section>

            <section class="tactical-panel" data-role="tactical-panel" aria-label="Тактический перк">
              <button class="button button-secondary" data-role="tactical-button" type="button">${t("hud.scan")}</button>
              <span class="hud-label">${t("hud.charge")}: <strong data-role="tactical-charge">0/0</strong></span>
              <span data-role="tactical-result">${t("hud.noTactical")}</span>
            </section>

            <p class="message" data-role="message">${t("hud.instruction")}</p>

            <div class="board-wrap" data-role="board-wrap">
              <div class="board" data-role="board" aria-label="Минное поле"></div>
            </div>
          </div>
        </div>
      </section>

      <section class="screen debrief-screen is-hidden" data-screen="debrief">
        <div class="debrief-panel" data-role="debrief-panel">
          <p class="eyebrow">${t("debrief.eyebrow")}</p>
          <h2 data-role="debrief-title">${t("debrief.title")}</h2>
          <p data-role="debrief-details"></p>
          <div class="debrief-stats">
            <div>
              <span class="hud-label">${t("debrief.xp")}</span>
              <strong data-role="debrief-xp">+0 XP</strong>
            </div>
            <div>
              <span class="hud-label">${t("debrief.rank")}</span>
              <strong data-role="debrief-rank">Кадет</strong>
            </div>
          </div>
          <div class="award-list" data-role="debrief-awards"></div>
          <blockquote data-role="debrief-quote"></blockquote>
          <div class="button-row">
            <button class="button button-primary" data-role="debrief-new-operation" type="button">${t("debrief.next")}</button>
            <button class="button button-secondary" data-role="debrief-profile" type="button">${t("debrief.profile")}</button>
          </div>
        </div>
      </section>

      <section class="screen session-end-screen is-hidden" data-screen="sessionEnd">
        <div class="debrief-panel session-end-panel">
          <p class="eyebrow">${t("session.eyebrow")}</p>
          <h2 data-role="session-end-title">Кампания завершена</h2>
          <p data-role="session-end-details"></p>
          <button class="button button-primary" data-role="session-end-menu" type="button">${t("session.menu")}</button>
        </div>
      </section>

      <section class="screen records-screen is-hidden" data-screen="records">
        <header class="topbar">
          <div>
            <h1>${t("records.title")}</h1>
            <p class="subtitle">${t("records.subtitle")}</p>
          </div>
          <button class="button button-secondary" data-role="records-back" type="button">${t("common.back")}</button>
        </header>
        <div class="records-content" data-role="records-content"></div>
      </section>

      <section class="screen profile-screen is-hidden" data-screen="profile">
        <header class="topbar">
          <div>
            <h1>${t("profile.title")}</h1>
            <p class="subtitle">${t("profile.subtitle")}</p>
          </div>
          <button class="button button-secondary" data-role="profile-back" type="button">${t("common.back")}</button>
        </header>
        <div class="profile-content" data-role="profile-content"></div>
      </section>

      <div class="modal-backdrop is-hidden" data-role="confirm-modal" aria-hidden="true">
        <div class="modal-card">
          <p class="eyebrow">${t("common.confirm")}</p>
          <h2 data-role="confirm-title">${t("confirm.exitTitle")}</h2>
          <p data-role="confirm-body">${t("confirm.exitBody")}</p>
          <div class="button-row">
            <button class="button button-primary" data-role="confirm-accept" type="button">${t("common.confirm")}</button>
            <button class="button button-secondary" data-role="confirm-cancel" type="button">${t("common.cancel")}</button>
          </div>
        </div>
      </div>

      <div class="modal-backdrop is-hidden" data-role="progression-modal" aria-hidden="true">
        <div class="modal-card modal-card--progression">
          <div class="topbar">
            <div>
              <p class="eyebrow">${t("progression.title")}</p>
              <h2 data-role="progression-title">${t("progression.title")}</h2>
              <p class="subtitle" data-role="progression-subtitle">${t("progression.subtitle")}</p>
            </div>
            <button class="button button-secondary" data-role="progression-close" type="button">${t("common.close")}</button>
          </div>
          <div class="progression-list" data-role="progression-content"></div>
        </div>
      </div>
    </section>
  `;

  return {
    game: query(root, "[data-role='game']"),
    mainMenuScreen: query(root, "[data-screen='mainMenu']"),
    soloSelectScreen: query(root, "[data-screen='soloSelect']"),
    preparationScreen: query(root, "[data-screen='preparation']"),
    operationScreen: query(root, "[data-screen='operation']"),
    debriefScreen: query(root, "[data-screen='debrief']"),
    sessionEndScreen: query(root, "[data-screen='sessionEnd']"),
    recordsScreen: query(root, "[data-screen='records']"),
    profileScreen: query(root, "[data-screen='profile']"),
    campaignModeCards: Array.from(root.querySelectorAll<HTMLButtonElement>("[data-role='campaign-mode-card']")),
    languageButtons: Array.from(root.querySelectorAll<HTMLButtonElement>("[data-language]")),
    playerNameInput: query<HTMLInputElement>(root, "[data-role='player-name']"),
    playerNameError: query(root, "[data-role='player-name-error']"),
    mainStartButton: query<HTMLButtonElement>(root, "[data-role='main-start']"),
    recordsButton: query<HTMLButtonElement>(root, "[data-role='records-open']"),
    soloRoster: query(root, "[data-role='solo-roster']"),
    soloConfirmButton: query<HTMLButtonElement>(root, "[data-role='solo-confirm']"),
    soloBackButton: query<HTMLButtonElement>(root, "[data-role='solo-back']"),
    prepBackMenuButton: query<HTMLButtonElement>(root, "[data-role='prep-back-menu']"),
    prepRecordsButton: query<HTMLButtonElement>(root, "[data-role='prep-records']"),
    characterField: query(root, "[data-role='character-field']"),
    prepRoster: query(root, "[data-role='prep-roster']"),
    characterSelect: query<HTMLSelectElement>(root, "[data-role='character']"),
    operativeBriefing: query(root, "[data-role='operative-briefing']"),
    squadStatus: query(root, "[data-role='squad-status']"),
    cycleStatus: query(root, "[data-role='cycle-status']"),
    operationList: query(root, "[data-role='operation-list']"),
    selectedOperationTitle: query(root, "[data-role='selected-operation-title']"),
    selectedOperationDescription: query(root, "[data-role='selected-operation-description']"),
    selectedOperationMeta: query(root, "[data-role='selected-operation-meta']"),
    startOperationButton: query<HTMLButtonElement>(root, "[data-role='start-operation']"),
    prepProfileButton: query<HTMLButtonElement>(root, "[data-role='prep-profile']"),
    operationProfileButton: query<HTMLButtonElement>(root, "[data-role='operation-profile']"),
    operationMenuButton: query<HTMLButtonElement>(root, "[data-role='operation-menu']"),
    debriefNewOperationButton: query<HTMLButtonElement>(root, "[data-role='debrief-new-operation']"),
    debriefProfileButton: query<HTMLButtonElement>(root, "[data-role='debrief-profile']"),
    sessionEndTitle: query(root, "[data-role='session-end-title']"),
    sessionEndDetails: query(root, "[data-role='session-end-details']"),
    sessionEndMenuButton: query<HTMLButtonElement>(root, "[data-role='session-end-menu']"),
    recordsContent: query(root, "[data-role='records-content']"),
    recordsBackButton: query<HTMLButtonElement>(root, "[data-role='records-back']"),
    profileBackButton: query<HTMLButtonElement>(root, "[data-role='profile-back']"),
    profileContent: query(root, "[data-role='profile-content']"),
    mineCount: query(root, "[data-role='mine-count']"),
    flagCount: query(root, "[data-role='flag-count']"),
    timer: query(root, "[data-role='timer']"),
    status: query(root, "[data-role='status']"),
    tacticalPanel: query(root, "[data-role='tactical-panel']"),
    tacticalButton: query<HTMLButtonElement>(root, "[data-role='tactical-button']"),
    tacticalCharge: query(root, "[data-role='tactical-charge']"),
    tacticalResult: query(root, "[data-role='tactical-result']"),
    message: query(root, "[data-role='message']"),
    boardWrap: query(root, "[data-role='board-wrap']"),
    board: query(root, "[data-role='board']"),
    portrait: query(root, "[data-role='portrait']"),
    operativeName: query(root, "[data-role='operative-name']"),
    operativeRankIcon: query(root, "[data-role='operative-rank-icon']"),
    operativeRank: query(root, "[data-role='operative-rank']"),
    operativeHpBar: query(root, "[data-role='operative-hp-bar']"),
    operativeHpText: query(root, "[data-role='operative-hp-text']"),
    operativeStatus: query(root, "[data-role='operative-status']"),
    operativeMedals: query(root, "[data-role='operative-medals']"),
    operativePerks: query(root, "[data-role='operative-perks']"),
    speaker: query(root, "[data-role='speaker']"),
    quote: query(root, "[data-role='quote']"),
    operationName: query(root, "[data-role='operation-name']"),
    operationMeta: query(root, "[data-role='operation-meta']"),
    operationBiome: query(root, "[data-role='operation-biome']"),
    operationCharacter: query(root, "[data-role='operation-character']"),
    debriefPanel: query(root, "[data-role='debrief-panel']"),
    debriefTitle: query(root, "[data-role='debrief-title']"),
    debriefDetails: query(root, "[data-role='debrief-details']"),
    debriefXp: query(root, "[data-role='debrief-xp']"),
    debriefRank: query(root, "[data-role='debrief-rank']"),
    debriefAwards: query(root, "[data-role='debrief-awards']"),
    debriefQuote: query(root, "[data-role='debrief-quote']"),
    confirmModal: query(root, "[data-role='confirm-modal']"),
    confirmTitle: query(root, "[data-role='confirm-title']"),
    confirmBody: query(root, "[data-role='confirm-body']"),
    confirmAccept: query<HTMLButtonElement>(root, "[data-role='confirm-accept']"),
    confirmCancel: query<HTMLButtonElement>(root, "[data-role='confirm-cancel']"),
    progressionModal: query(root, "[data-role='progression-modal']"),
    progressionTitle: query(root, "[data-role='progression-title']"),
    progressionSubtitle: query(root, "[data-role='progression-subtitle']"),
    progressionContent: query(root, "[data-role='progression-content']"),
    progressionClose: query<HTMLButtonElement>(root, "[data-role='progression-close']")
  };
}

export function showScreen(refs: AppRefs, screen: AppScreen): void {
  const operationVisible = screen === "operation" || screen === "debrief";

  refs.mainMenuScreen.classList.toggle("is-hidden", screen !== "mainMenu");
  refs.soloSelectScreen.classList.toggle("is-hidden", screen !== "soloSelect");
  refs.preparationScreen.classList.toggle("is-hidden", screen !== "preparation");
  refs.operationScreen.classList.toggle("is-hidden", !operationVisible);
  refs.debriefScreen.classList.toggle("is-hidden", screen !== "debrief");
  refs.sessionEndScreen.classList.toggle("is-hidden", screen !== "sessionEnd");
  refs.recordsScreen.classList.toggle("is-hidden", screen !== "records");
  refs.profileScreen.classList.toggle("is-hidden", screen !== "profile");
  refs.game.dataset.view = screen;
}

function renderModeCard(mode: CampaignMode): string {
  const isSquad = mode === "squad";
  const tone = isSquad ? t("mode.squadTone") : t("mode.soloTone");

  return `
    <button class="mode-card ${isSquad ? "is-selected" : ""}" data-role="campaign-mode-card" data-mode="${mode}" type="button">
      <span>
        <strong>${t(`mode.${mode}`)}</strong>
        <small>${tone}</small>
      </span>
    </button>
  `;
}

function renderLanguageButtons(): string {
  const currentLanguage = getLanguage();

  return LANGUAGES.map((language) => `
    <button class="language-button ${language.id === currentLanguage ? "is-selected" : ""}" data-language="${language.id}" type="button">
      <span>${language.flag}</span>
      <strong>${language.label}</strong>
    </button>
  `).join("");
}

function query<ElementType extends Element = HTMLElement>(root: ParentNode, selector: string): ElementType {
  const element = root.querySelector<ElementType>(selector);

  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }

  return element;
}
