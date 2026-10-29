import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import {
  assignAnonymousHands,
  cardById,
  categoryLabels,
  createAnonymousDeal,
  createCards,
  createGameConfig,
  createPlayers,
  formatCardsForMessage,
  isPlayerActive,
  judgeGuess,
  moveEntry,
  nextActivePlayerIndex,
  parseList,
  removePlayerFromGame,
  undoLastGameEvent,
  validateCatalog,
  validateDistribution,
  type AnonymousDeal,
} from "./domain";
import { clearSession, readSession, saveSession } from "./storage";
import { createExampleSession } from "./exampleGame";
import clueIcon from "./img/clueIcon.png";
import saeIcon from "./img/SAE.png";
import type {
  Card,
  Catalog,
  Category,
  GameSession,
  Guess,
  GuessRecord,
  Player,
} from "./types";
import { categories } from "./types";

const emptyTexts: Record<Category, string> = {
  suspects: "",
  items: "",
  places: "",
};

const categorySingular: Record<Category, string> = {
  suspects: "Suspect",
  items: "Item",
  places: "Place",
};

const alphabeticalCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function Icon({ name }: { name: "up" | "down" | "back" | "forward" | "close" | "copy" | "check" }) {
  const paths = {
    up: "m7 14 5-5 5 5",
    down: "m7 10 5 5 5-5",
    back: "m15 18-6-6 6-6",
    forward: "m9 18 6-6-6-6",
    close: "m7 7 10 10M17 7 7 17",
    copy: "M9 9h10v10H9zM5 15H4V5h10v1",
    check: "m5 12 4 4L19 6",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // File URLs may not receive Clipboard API permission. Use the local fallback below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed.");
}

function CopyCardsButton({ cards, compact = false }: { cards: Card[]; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyCards() {
    try {
      await copyText(formatCardsForMessage(cards));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert("The cards could not be copied. Please try again.");
    }
  }

  return (
    <button
      className={`copy-cards-button ${compact ? "compact" : ""} ${copied ? "copied" : ""}`}
      type="button"
      onClick={copyCards}
      aria-label={copied ? "Cards copied" : "Copy cards"}
    >
      <Icon name={copied ? "check" : "copy"} />
      <span>{copied ? "Copied" : "Copy cards"}</span>
    </button>
  );
}

function CaseFileCards({ cards }: { cards: Card[] }) {
  return (
    <div className="case-file-cards">
      {categories.map((category) => {
        const card = cards.find((candidate) => candidate.category === category);
        return (
          <div className={`case-file-card ${category}`} key={category}>
            <small>{categorySingular[category]}</small>
            <strong>{card?.name ?? "Unknown"}</strong>
          </div>
        );
      })}
    </div>
  );
}

function AppHeader() {
  return (
    <header className="app-header">
      <div className="header-icons" aria-label="Clue Host">
        <img src={clueIcon} alt="Clue magnifying glass" />
        <img src={saeIcon} alt="SAE" />
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <span>Made by <strong>FKF7</strong></span>
    </footer>
  );
}

type SetupProps = {
  onComplete: (session: GameSession) => void;
};

type DealLocation = "case-file" | number;

type DealCardSelection = {
  cardId: string;
  location: DealLocation;
};

function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState(0);
  const [texts, setTexts] = useState<Record<Category, string>>(emptyTexts);
  const [players, setPlayers] = useState<Player[]>([]);
  const [anonymousDeal, setAnonymousDeal] = useState<AnonymousDeal | null>(null);
  const [hands, setHands] = useState<Record<string, string[]>>({});
  const [handNumbers, setHandNumbers] = useState<Record<string, number>>({});
  const [selectedDealCard, setSelectedDealCard] = useState<DealCardSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalog = useMemo<Catalog>(
    () => ({
      suspects: parseList(texts.suspects),
      items: parseList(texts.items),
      places: parseList(texts.places),
    }),
    [texts],
  );
  const validation = useMemo(() => validateCatalog(catalog), [catalog]);
  const cards = useMemo(() => createCards(catalog), [catalog]);
  const distribution = useMemo(
    () =>
      validation.cardsPerPlayer === null
        ? null
        : validateDistribution(cards, players, hands, validation.cardsPerPlayer),
    [cards, hands, players, validation.cardsPerPlayer],
  );

  const alphabeticalPlayers = useMemo(
    () => [...players].sort((left, right) => alphabeticalCollator.compare(left.name, right.name)),
    [players],
  );

  function orderedCards(cardIds: string[]) {
    return cardIds
      .map((cardId) => cards.find((card) => card.id === cardId))
      .filter((card): card is Card => Boolean(card))
      .sort((left, right) => {
        const categoryDifference = categories.indexOf(left.category) - categories.indexOf(right.category);
        return categoryDifference || alphabeticalCollator.compare(left.name, right.name);
      });
  }

  function generateDeal() {
    if (validation.cardsPerPlayer === null) return null;
    return createAnonymousDeal(cards, players.length || catalog.suspects.length, validation.cardsPerPlayer);
  }

  function continueFromCatalog() {
    if (!validation.valid || validation.cardsPerPlayer === null) {
      setError(validation.errors[0] ?? "Review the lists before continuing.");
      return;
    }
    const nextPlayers = createPlayers(
      [...catalog.suspects].sort((left, right) => alphabeticalCollator.compare(left, right)),
    );
    const nextDeal = createAnonymousDeal(cards, nextPlayers.length, validation.cardsPerPlayer);
    setPlayers(nextPlayers);
    setAnonymousDeal(nextDeal);
    setHands({});
    setHandNumbers({});
    setSelectedDealCard(null);
    setError(null);
    setStep(1);
  }

  function redealEverything() {
    if (!window.confirm("Replace the current deal with a completely new random deal?")) return;
    const nextDeal = generateDeal();
    if (!nextDeal) return;
    setAnonymousDeal(nextDeal);
    setSelectedDealCard(null);
    setError(null);
  }

  function selectDealCard(cardId: string, location: DealLocation) {
    if (!anonymousDeal) return;
    if (!selectedDealCard) {
      setSelectedDealCard({ cardId, location });
      setError(null);
      return;
    }
    if (selectedDealCard.cardId === cardId) {
      setSelectedDealCard(null);
      return;
    }
    if (selectedDealCard.location === location) {
      setSelectedDealCard({ cardId, location });
      setError(null);
      return;
    }

    const selectedCard = cards.find((card) => card.id === selectedDealCard.cardId);
    const targetCard = cards.find((card) => card.id === cardId);
    const involvesCaseFile = selectedDealCard.location === "case-file" || location === "case-file";
    if (!selectedCard || !targetCard) return;
    if (involvesCaseFile && selectedCard.category !== targetCard.category) {
      setError("A case-file card can only be exchanged for a card from the same category.");
      return;
    }

    const nextCaseFile = [...anonymousDeal.caseFile];
    const nextHands = anonymousDeal.hands.map((hand) => [...hand]);
    const replaceCard = (source: DealLocation, oldCardId: string, newCardId: string) => {
      const collection = source === "case-file" ? nextCaseFile : nextHands[source];
      const cardIndex = collection.indexOf(oldCardId);
      if (cardIndex >= 0) collection[cardIndex] = newCardId;
    };
    replaceCard(selectedDealCard.location, selectedDealCard.cardId, cardId);
    replaceCard(location, cardId, selectedDealCard.cardId);
    setAnonymousDeal({ caseFile: nextCaseFile, hands: nextHands });
    setSelectedDealCard(null);
    setError(null);
  }

  function assignHands() {
    if (!anonymousDeal) return;
    const assignment = assignAnonymousHands(players, anonymousDeal.hands);
    setHands(assignment.hands);
    setHandNumbers(assignment.handNumbers);
    setSelectedDealCard(null);
    setError(null);
    setStep(2);
  }

  function finishSetup() {
    if (!distribution?.valid || validation.cardsPerPlayer === null) {
      setError(distribution?.errors[0] ?? "Finish dealing the cards.");
      return;
    }
    try {
      const config = createGameConfig(catalog, players, hands, validation.cardsPerPlayer);
      onComplete({ config, currentPlayerIndex: 0, history: [] });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "The game could not be started.");
    }
  }

  function renderDealCard(card: Card, location: DealLocation) {
    const selected = selectedDealCard?.cardId === card.id;
    const selectedCard = selectedDealCard
      ? cards.find((candidate) => candidate.id === selectedDealCard.cardId)
      : null;
    const differentLocation = selectedDealCard && selectedDealCard.location !== location;
    const involvesCaseFile =
      selectedDealCard &&
      differentLocation &&
      (selectedDealCard.location === "case-file" || location === "case-file");
    const incompatible = Boolean(
      selectedCard && involvesCaseFile && selectedCard.category !== card.category,
    );
    return (
      <button
        className={`deal-card ${card.category} ${selected ? "selected" : ""}`}
        type="button"
        key={card.id}
        disabled={incompatible}
        aria-pressed={selected}
        onClick={() => selectDealCard(card.id, location)}
        title={incompatible ? "Case-file swaps must use the same category." : undefined}
      >
        <small>{categorySingular[card.category]}</small>
        <strong>{card.name}</strong>
      </button>
    );
  }

  return (
    <main className="setup-page page-shell">
      <section className="setup-intro">
        <span className="eyebrow">PREPARE THE TABLE</span>
        <h1>Set up your game</h1>
        <p>Add the deck, prepare the hands, assign them to players, and set the turn order.</p>
      </section>

      <ol className="stepper" aria-label="Setup steps">
        {["Deck", "Prepare deal", "Assign hands", "Turn order"].map((label, index) => (
          <li key={label} className={`${index === step ? "active" : ""} ${index < step ? "done" : ""}`}>
            <span>{index < step ? "✓" : index + 1}</span>
            <div><small>STEP {index + 1}</small><strong>{label}</strong></div>
          </li>
        ))}
      </ol>

      <section className="surface setup-surface">
        {step === 0 && (
          <>
            <div className="section-heading split-heading">
              <div>
                <h2>Which cards are in play?</h2>
                <p>Type or paste one name per line. Each suspect also represents a player.</p>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => onComplete(createExampleSession())}
              >
                Start example game
              </button>
            </div>

            <div className="catalog-editors">
              {categories.map((category) => (
                <label className={`catalog-editor ${category}`} key={category}>
                  <span>
                    <strong>{categoryLabels[category]}</strong>
                    <small>{catalog[category].length}</small>
                  </span>
                  <textarea
                    value={texts[category]}
                    onChange={(event) => {
                      setTexts((current) => ({ ...current, [category]: event.target.value }));
                      setError(null);
                    }}
                    placeholder={
                      category === "suspects"
                        ? "FKF\nCaustic\nOmars31609\nJGMC32"
                        : category === "items"
                          ? "Surfboard\nKeytar\nIce Cream Cone\nVuvuzela"
                          : "Arcade\nLighthouse\nStadium\nCove"
                    }
                    spellCheck="false"
                  />
                </label>
              ))}
            </div>

            <div className={`setup-summary ${validation.valid ? "valid" : ""}`}>
              <div className="summary-stat"><strong>{catalog.suspects.length}</strong><span>players<br />and suspects</span></div>
              <div className="summary-stat"><strong>{catalog.items.length}</strong><span>items</span></div>
              <div className="summary-stat"><strong>{catalog.places.length}</strong><span>places</span></div>
              <div className="summary-stat"><strong>{validation.totalCards}</strong><span>cards<br />in total</span></div>
              <div className="summary-result">
                <span className="status-dot" />
                {validation.valid ? (
                  <span><strong>Valid setup</strong>{validation.cardsPerPlayer} card(s) per player</span>
                ) : (
                  <span><strong>Setup incomplete</strong>{validation.errors[0] ?? "Fill in the lists to continue."}</span>
                )}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="section-heading">
              <h2>What is the turn order?</h2>
              <p>Arrange the players in play order. After the last player, play returns to the first.</p>
            </div>
            <ol className="order-list">
              {players.map((player, index) => (
                <li key={player.id}>
                  <span className="order-number">{index + 1}</span>
                  <strong>{player.name}</strong>
                  <CopyCardsButton cards={orderedCards(hands[player.id] ?? [])} compact />
                  <div className="order-controls">
                    <button
                      type="button"
                      aria-label={`Move ${player.name} up`}
                      disabled={index === 0}
                      onClick={() => setPlayers((current) => moveEntry(current, index, index - 1))}
                    ><Icon name="up" /></button>
                    <button
                      type="button"
                      aria-label={`Move ${player.name} down`}
                      disabled={index === players.length - 1}
                      onClick={() => setPlayers((current) => moveEntry(current, index, index + 1))}
                    ><Icon name="down" /></button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {step === 1 && validation.cardsPerPlayer !== null && anonymousDeal && (
          <>
            <div className="section-heading split-heading">
              <div>
                <h2>Prepare the hands</h2>
                <p>Review the random deal and select two cards to exchange them.</p>
              </div>
              <button className="text-button" type="button" onClick={redealEverything}>
                Redeal everything
              </button>
            </div>

            <div className={`swap-guidance ${selectedDealCard ? "active" : ""}`} aria-live="polite">
              <span>{selectedDealCard ? "1" : "↔"}</span>
              <p>
                {selectedDealCard
                  ? "Now select a card in another hand to exchange it. Case-file swaps must use the same category."
                  : "Select any card, then select a card in another hand to swap their positions."}
              </p>
              {selectedDealCard && (
                <button type="button" onClick={() => setSelectedDealCard(null)}>Cancel selection</button>
              )}
            </div>

            <section className="anonymous-case-file" aria-labelledby="anonymous-case-title">
              <div>
                <span className="case-icon">?</span>
                <div>
                  <small>THE CRIME</small>
                  <h3 id="anonymous-case-title">Case file</h3>
                </div>
              </div>
              <div className="deal-card-list">
                {categories.flatMap((category) =>
                  orderedCards(anonymousDeal.caseFile)
                    .filter((card) => card.category === category)
                    .map((card) => renderDealCard(card, "case-file")),
                )}
              </div>
            </section>

            <div className="anonymous-hands-grid">
              {anonymousDeal.hands.map((hand, handIndex) => {
                const handCards = orderedCards(hand);
                return (
                  <article className="anonymous-hand" key={handIndex}>
                    <header>
                      <div>
                        <small>PREPARED HAND</small>
                        <h3>Hand {handIndex + 1}</h3>
                      </div>
                      <div className="hand-balance" aria-label={`Category counts for hand ${handIndex + 1}`}>
                        {categories.map((category) => (
                          <span className={category} key={category} title={categoryLabels[category]}>
                            {handCards.filter((card) => card.category === category).length}
                          </span>
                        ))}
                      </div>
                    </header>
                    <div className="deal-card-list">
                      {handCards.map((card) => renderDealCard(card, handIndex))}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && anonymousDeal && (
          <>
            <div className="section-heading assignment-heading">
              <h2>Hands assigned</h2>
              <p>Each prepared hand has been randomly assigned to a player.</p>
            </div>

            <div className="locked-case-file">
              <div><small>CASE FILE</small><strong>Crime cards</strong></div>
              <CaseFileCards cards={orderedCards(anonymousDeal.caseFile)} />
            </div>

            <div className="assigned-hands-grid">
              {alphabeticalPlayers.map((player) => (
                <article className="assigned-hand" key={player.id}>
                  <header>
                    <span className="avatar">{player.name.slice(0, 1).toLocaleUpperCase("en")}</span>
                    <div>
                      <small>PREPARED HAND {handNumbers[player.id]}</small>
                      <h3>{player.name}</h3>
                    </div>
                    <CopyCardsButton cards={orderedCards(hands[player.id] ?? [])} />
                  </header>
                  <div className="assigned-card-list">
                    {orderedCards(hands[player.id] ?? []).map((card) => (
                      <span className={`hand-card ${card.category}`} key={card.id}>
                        <small>{categorySingular[card.category]}</small>
                        {card.name}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {error && <p className="error-banner" role="alert">{error}</p>}

        <footer className="setup-actions">
          {(step === 1 || step === 3) && (
            <button className="ghost-button" type="button" onClick={() => { setStep(step === 1 ? 0 : 2); setError(null); }}>
              Back
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={(step === 0 && !validation.valid) || (step === 1 && !anonymousDeal)}
            onClick={
              step === 0
                ? continueFromCatalog
                : step === 1
                  ? assignHands
                  : step === 2
                    ? () => setStep(3)
                    : finishSetup
            }
          >
            {step === 1
              ? "Assign hands"
              : step === 2
                ? "Continue to turn order"
                : step === 3
                  ? "Start game"
                  : "Continue"}
            <Icon name="forward" />
          </button>
        </footer>
      </section>
    </main>
  );
}

function CardSelect({
  category,
  cards,
  value,
  onChange,
  selectRef,
  ownership,
}: {
  category: Category;
  cards: Card[];
  value: string;
  onChange: (value: string) => void;
  selectRef?: Ref<HTMLSelectElement>;
  ownership: { text: string; kind: "player" | "public" | "case-file" } | null;
}) {
  return (
    <label className={`guess-field ${category}`}>
      <span>{categorySingular[category]}</span>
      <select ref={selectRef} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select...</option>
        {cards.filter((card) => card.category === category).map((card) => (
          <option value={card.id} key={card.id}>{card.name}</option>
        ))}
      </select>
      <small
        className={`card-ownership ${ownership?.kind ?? "empty"}`}
        aria-live="polite"
      >
        {ownership?.text ?? "\u00a0"}
      </small>
    </label>
  );
}

function Game({
  session,
  onChange,
  onNewGame,
}: {
  session: GameSession;
  onChange: (session: GameSession) => void;
  onNewGame: () => void;
}) {
  const [guess, setGuess] = useState<Guess>({ suspects: "", items: "", places: "" });
  const [openPanel, setOpenPanel] = useState<"hands" | "history" | null>(null);
  const suspectSelectRef = useRef<HTMLSelectElement>(null);
  const { config, currentPlayerIndex } = session;
  const currentPlayer = config.players[currentPlayerIndex];
  const activePlayerCount = config.players.filter(isPlayerActive).length;
  const guessCount = session.history.filter(
    (event) => event.type === "guess",
  ).length;
  const completeGuess = Object.values(guess).every(Boolean);
  const result = useMemo(
    () => completeGuess ? judgeGuess(config, currentPlayerIndex, guess) : null,
    [completeGuess, config, currentPlayerIndex, guess],
  );
  const responder = result?.responderId
    ? config.players.find((player) => player.id === result.responderId)
    : null;
  const caseFileCards = config.caseFile
    .map((cardId) => cardById(config, cardId))
    .filter((card): card is Card => Boolean(card));
  const publicGuessedCards = useMemo(
    () =>
      Object.values(guess).flatMap((cardId) => {
        if (!cardId) return [];
        const owner = config.players.find(
          (player) =>
            !isPlayerActive(player) &&
            (config.hands[player.id] ?? []).includes(cardId),
        );
        const card = cardById(config, cardId);
        return owner && card ? [{ card, owner }] : [];
      }),
    [config, guess],
  );

  function changeTurn(direction: -1 | 1) {
    const nextIndex = nextActivePlayerIndex(config.players, currentPlayerIndex, direction);
    if (nextIndex < 0) return;
    setGuess({ suspects: "", items: "", places: "" });
    onChange({ ...session, currentPlayerIndex: nextIndex });
  }

  function registerTurn() {
    if (!result) return;
    const record: GuessRecord = {
      type: "guess",
      id: `${Date.now()}:${session.history.length}`,
      guesserId: currentPlayer.id,
      guess,
      responderId: result.responderId,
      possibleCardIds: result.possibleCardIds,
      createdAt: Date.now(),
    };
    const nextIndex = nextActivePlayerIndex(config.players, currentPlayerIndex);
    onChange({ ...session, currentPlayerIndex: nextIndex, history: [...session.history, record] });
    setGuess({ suspects: "", items: "", places: "" });
    window.requestAnimationFrame(() => suspectSelectRef.current?.focus());
  }

  function undoLastEvent() {
    const lastEvent = session.history.at(-1);
    const undone = undoLastGameEvent(session);
    onChange(undone.session);
    if (lastEvent?.type === "guess") {
      setGuess(undone.restoredGuess ?? { suspects: "", items: "", places: "" });
    }
    setOpenPanel(null);
    window.requestAnimationFrame(() => suspectSelectRef.current?.focus());
  }

  function removePlayer(playerId: string) {
    const playerIndex = config.players.findIndex((player) => player.id === playerId);
    const player = config.players[playerIndex];
    if (!player) return;

    if (activePlayerCount <= 1) {
      window.alert("At least one player must remain in the game.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${player.name} from the game? Their cards will become public, and they will be skipped in turn and response order.`,
      )
    ) {
      return;
    }

    if (currentPlayer.id === playerId) {
      setGuess({ suspects: "", items: "", places: "" });
    }
    onChange(removePlayerFromGame(session, playerId));
  }

  function ownershipFor(cardId: string) {
    if (!cardId) return null;
    if (config.caseFile.includes(cardId)) {
      return { text: "Case file", kind: "case-file" as const };
    }
    const owner = config.players.find((player) =>
      (config.hands[player.id] ?? []).includes(cardId),
    );
    if (!owner) return null;
    return isPlayerActive(owner)
      ? { text: `Held by ${owner.name}`, kind: "player" as const }
      : { text: `Public card — held by ${owner.name}`, kind: "public" as const };
  }

  return (
    <main className="game-page page-shell">
      <div className="game-topline">
        <div>
          <span className="live-dot" /> GAME IN PROGRESS
        </div>
        <div className="game-reference-actions">
          <button className="reference-button" type="button" onClick={() => setOpenPanel("hands")}>
            Hands <span>{config.players.length}</span>
          </button>
          <button className="reference-button" type="button" onClick={() => setOpenPanel("history")}>
            History <span>{session.history.length}</span>
          </button>
          <button className="new-game-button" type="button" onClick={onNewGame}>
            New game
          </button>
        </div>
      </div>

      <section className="crime-summary" aria-label="Case file crime cards">
        <div className="crime-summary-heading">
          <span>CASE FILE</span>
          <strong>Crime cards</strong>
        </div>
        <CaseFileCards cards={caseFileCards} />
      </section>

      <section className="turn-hero">
        <button type="button" className="turn-arrow" aria-label="Previous player" onClick={() => changeTurn(-1)}>
          <Icon name="back" />
        </button>
        <div>
          <span>TURN</span>
          <h1>{currentPlayer.name}</h1>
          <p>Make a guess by choosing one card from each category.</p>
        </div>
        <button type="button" className="turn-arrow" aria-label="Next player" onClick={() => changeTurn(1)}>
          <Icon name="forward" />
        </button>
      </section>

      <section className="surface guess-surface">
        <div className="guess-number">{String(guessCount + 1).padStart(2, "0")}</div>
        <div className="section-heading">
          <span className="eyebrow">NEW GUESS</span>
          <h2>What happened?</h2>
        </div>
        <div className="guess-fields">
          {categories.map((category) => (
            <CardSelect
              key={category}
              category={category}
              cards={config.cards}
              value={guess[category]}
              onChange={(value) => setGuess((current) => ({ ...current, [category]: value }))}
              selectRef={category === "suspects" ? suspectSelectRef : undefined}
              ownership={ownershipFor(guess[category])}
            />
          ))}
        </div>

        {publicGuessedCards.length > 0 && (
          <div className="public-card-notice">
            <strong>Public information</strong>
            <span>
              {publicGuessedCards
                .map(({ card, owner }) => `${card.name} (${owner.name} is out)`)
                .join(" · ")}
            </span>
          </div>
        )}

        <div className={`judge-result ${result ? "visible" : ""}`} aria-live="polite">
          {!result ? (
            <div className="result-placeholder">
              <span>?</span>
              <p>Select all three cards to find out who must respond.</p>
            </div>
          ) : responder ? (
            <>
              <div className="result-public">
                <span className="result-avatar">{responder.name.slice(0, 1).toLocaleUpperCase("en")}</span>
                <div><small>MUST SHOW A CARD</small><strong>{responder.name}</strong></div>
              </div>
              <div className="private-result">
                <div>
                  <span>Can show:</span>
                  <strong>{result.possibleCardIds.map((id) => cardById(config, id)?.name).join(" or ")}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="nobody-result">
              <span>∅</span>
              <div><small>RESULT</small><strong>No active player can show a card</strong></div>
            </div>
          )}
        </div>

        <button className="primary-button register-button" type="button" disabled={!result} onClick={registerTurn}>
          Record and continue <Icon name="forward" />
        </button>
      </section>

      <footer className="game-footer">
        <span>Autosave active</span>
      </footer>

      {openPanel && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpenPanel(null)}>
          <section className="reference-panel" role="dialog" aria-modal="true" aria-labelledby="reference-panel-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="eyebrow">
                  {openPanel === "hands" ? "HOST REFERENCE" : "GAME LOG"}
                </span>
                <h2 id="reference-panel-title">{openPanel === "hands" ? "Hands" : "History"}</h2>
              </div>
              <button type="button" aria-label="Close panel" onClick={() => setOpenPanel(null)}><Icon name="close" /></button>
            </header>
            {openPanel === "hands" ? (
              <>
                <p className="panel-intro">Every dealt card, grouped by player.</p>
                <ol className="hands-overview">
                  {config.players.map((player, playerIndex) => {
                    const playerCards = (config.hands[player.id] ?? [])
                      .map((cardId) => cardById(config, cardId))
                      .filter((card): card is Card => Boolean(card));
                    return (
                    <li className={!isPlayerActive(player) ? "player-out" : ""} key={player.id}>
                      <div className="hand-player">
                        <span className="avatar">{player.name.slice(0, 1).toLocaleUpperCase("en")}</span>
                        <div>
                          <small>PLAYER {playerIndex + 1}</small>
                          <strong>{player.name}</strong>
                          {!isPlayerActive(player) && <em>OUT · CARDS PUBLIC</em>}
                        </div>
                        <span className="hand-count">{config.hands[player.id]?.length ?? 0}</span>
                        <CopyCardsButton cards={playerCards} compact />
                        {isPlayerActive(player) && (
                          <button
                            className="player-state-button remove"
                            type="button"
                            disabled={activePlayerCount <= 1}
                            onClick={() => removePlayer(player.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="hand-card-list">
                        {(config.hands[player.id] ?? []).map((cardId) => {
                          const card = cardById(config, cardId);
                          if (!card) return null;
                          return (
                            <span className={`hand-card ${card.category}`} key={card.id}>
                              <small>{categorySingular[card.category]}</small>
                              {card.name}
                            </span>
                          );
                        })}
                      </div>
                    </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <>
                <div className="history-toolbar">
                  <p>{session.history.length} recorded event(s)</p>
                  <button
                    type="button"
                    disabled={session.history.length === 0}
                    onClick={undoLastEvent}
                  >
                    Undo last event
                  </button>
                </div>
                {session.history.length === 0 ? (
                  <p className="empty-history">No events have been recorded yet.</p>
                ) : (
                  <ol className="history-list">
                    {[...session.history].reverse().map((event, reverseIndex) => {
                      if (event.type === "player-removed") {
                        const removedPlayer = config.players.find(
                          (player) => player.id === event.playerId,
                        );
                        return (
                          <li className="removal-event" key={event.id}>
                            <span>{session.history.length - reverseIndex}</span>
                            <div>
                              <strong>{removedPlayer?.name ?? "Player"} left the game</strong>
                              <p>Their cards became public.</p>
                              <small>Removed from turn and response order</small>
                            </div>
                          </li>
                        );
                      }

                      const guesser = config.players.find(
                        (player) => player.id === event.guesserId,
                      );
                      const eventResponder = config.players.find(
                        (player) => player.id === event.responderId,
                      );
                      const names = Object.values(event.guess)
                        .map((id) => cardById(config, id)?.name)
                        .join(" · ");
                      return (
                        <li key={event.id}>
                          <span>{session.history.length - reverseIndex}</span>
                          <div>
                            <strong>{guesser?.name}</strong>
                            <p>{names}</p>
                            <small>
                              {eventResponder
                                ? `${eventResponder.name} responded`
                                : "No one responded"}
                            </small>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<GameSession | null>(() => readSession());

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>("#favicon");
    if (favicon) favicon.href = clueIcon;
  }, []);

  useEffect(() => {
    if (session) saveSession(session);
  }, [session]);

  function newGame() {
    if (!window.confirm("Start a new game? The current game and all progress will be deleted.")) return;
    clearSession();
    setSession(null);
  }

  return (
    <div className="app">
      <AppHeader />
      {session ? (
        <Game session={session} onChange={setSession} onNewGame={newGame} />
      ) : (
        <Setup onComplete={setSession} />
      )}
      <AppFooter />
    </div>
  );
}
