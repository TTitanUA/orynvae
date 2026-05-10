import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronLeft,
  FileText,
  ListChecks,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  ScrollText,
  Send,
  Square,
  Undo2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  chapterPaceLabel,
  chapterUserRoleLabel,
  type SessionTurn,
} from "../../../entities/chapter";
import {
  memoryQueries,
  memoryQueryKeys,
  memoryTypeLabel,
  type MemoryItemType,
} from "../../../entities/memory";
import {
  actorLabel,
  narratorInputLabel,
  narratorInputOptions,
  narratorSessionMutations,
  narratorSessionQueries,
  narratorSessionQueryKeys,
  sessionStatusLabel,
  type KeyEvent,
  type NarratorInputType,
  type NarratorReasoningEffort,
  type NarratorSessionDetail,
  type NarratorKeyEventUpdatePayload,
  type NarratorSuggestedActionsResponse,
  type NarratorTurnPayload,
  type NarratorTurnResponse,
  type SessionSuggestedAction,
  updateNarratorKeyEvent,
  updateNarratorTurnFlags,
} from "../../../entities/narrator-session";
import {
  allowedModels,
  modelSupportsParameter,
  modelSupportsReasoning,
  providerQueries,
  selectableAiProviders,
  type Provider,
  type ProviderModel,
} from "../../../entities/provider";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./NarratorSessionRoute.css";

type NarratorSessionRouteProps = {
  projectId: string;
  sessionId: string;
};

type TabId = "scene" | "log";

type PendingUserTurn = {
  content: string;
  inputType: NarratorInputType;
};

export function NarratorSessionRoute({ projectId, sessionId }: NarratorSessionRouteProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputType, setInputType] = useState<NarratorInputType>("action");
  const [content, setContent] = useState("");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [replayComment, setReplayComment] = useState("");
  const [actionPrompt, setActionPrompt] = useState("");
  const [selectedProviderIdDraft, setSelectedProviderId] = useState("");
  const [selectedModelIdDraft, setSelectedModelId] = useState("");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [agentTemperature, setAgentTemperature] = useState(0.7);
  const [agentTopP, setAgentTopP] = useState(0.9);
  const [agentReasoningEffort, setAgentReasoningEffort] = useState<NarratorReasoningEffort | "">("");

  const activeTab: TabId = searchParams.get("tab") === "log" ? "log" : "scene";
  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const detailQuery = useQuery(narratorSessionQueries.detail(sessionId));
  const providersQuery = useQuery(providerQueries.list());

  const detail = detailQuery.data;
  const summary = summaryQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
  const session = detail?.session;
  const providers = useMemo(
    () => (Array.isArray(providersQuery.data) ? providersQuery.data : []),
    [providersQuery.data],
  );
  const selectableProviders = useMemo(() => selectableAiProviders(providers), [providers]);
  const projectProviderId = detail?.project.active_provider_id || summary?.project.active_provider_id || summary?.runtime.active_provider?.id;
  const projectProvider = selectableProviders.find((provider) => provider.id === projectProviderId);
  const defaultProvider = selectableProviders.find((provider) => provider.is_default);
  const selectedProviderId =
    selectedProviderIdDraft || (projectProvider || defaultProvider || selectableProviders[0])?.id || "";
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const models = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const projectModelId =
    selectedProvider?.id === projectProviderId
      ? detail?.project.active_model_id || summary?.project.active_model_id || summary?.runtime.active_model?.model_id
      : undefined;
  const projectModel = models.find((model) => model.model_id === projectModelId);
  const defaultModel = models.find((model) => model.model_id === selectedProvider?.default_model_id);
  const fallbackModelId = (projectModel || defaultModel || models[0])?.model_id || "";
  const selectedModelId = models.some((model) => model.model_id === selectedModelIdDraft)
    ? selectedModelIdDraft
    : fallbackModelId;
  const selectedModel = models.find((model) => model.model_id === selectedModelId);
  const selectedProviderAvailable = selectableProviders.some((provider) => provider.id === selectedProviderId);
  const supportsTemperature = modelSupportsParameter(selectedModel, "temperature");
  const supportsTopP = modelSupportsParameter(selectedModel, "top_p");
  const supportsModelReasoning = modelSupportsReasoning(selectedModel);
  const selectedModelReady = Boolean(selectedProviderAvailable && selectedProvider && selectedModel);
  const modelBlockedReason =
    providersQuery.isPending
      ? "Загрузка моделей"
      : !selectedProvider
        ? summary?.runtime.reason || "Выбери AI-провайдер"
        : !selectedModel
          ? "Выбери разрешенную модель"
          : selectedProvider.last_error || undefined;
  const activeProviderLabel =
    selectedProvider && selectedModel ? `${selectedProvider.name} · ${selectedModel.display_name}` : "AI не выбран";
  const turns = useMemo(() => detail?.turns || [], [detail?.turns]);
  const latestAiTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.actor_type === "ai") || null,
    [turns],
  );
  const latestNarrationTurn = useMemo(
    () =>
      [...turns]
        .reverse()
        .find((turn) => turn.actor_type === "ai" && turn.turn_type === "narration") || null,
    [turns],
  );
  const suggestedActions = useMemo(
    () =>
      (detail?.suggested_actions || []).filter(
        (action) =>
          action.status === "suggested" &&
          (!latestAiTurn || action.source_turn_id === latestAiTurn.id),
      ),
    [detail?.suggested_actions, latestAiTurn],
  );
  const selectedAction =
    suggestedActions.find((action) => action.id === selectedActionId) || null;
  const canStart = Boolean(
    !readOnly && session && ["preparing", "paused"].includes(session.status),
  );
  const canPause = Boolean(!readOnly && session?.status === "active");
  const canComplete = Boolean(
    !readOnly && session && ["active", "paused"].includes(session.status),
  );
  const draftHref = `/projects/${projectId}/sessions/${sessionId}/draft`;
  const canSubmit = Boolean(
    !readOnly &&
      session?.status === "active" &&
      (content.trim() || selectedActionId),
  );
  const canReplay = Boolean(
    !readOnly &&
      session?.status === "active" &&
      latestNarrationTurn &&
      turns.some((turn) => turn.actor_type === "user" && turn.turn_index < latestNarrationTurn.turn_index),
  );
  const canRegenerateActions = Boolean(
    !readOnly && session?.status === "active" && latestAiTurn?.turn_type === "narration",
  );
  const busy = detailQuery.isPending || summaryQuery.isPending;
  const errors = [detailQuery.error, summaryQuery.error, providersQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  useEffect(() => {
    if (!session) {
      return;
    }
    setAgentInstructions(session.agent_instructions || "");
    setAgentTemperature(session.agent_temperature ?? 0.7);
    setAgentTopP(session.agent_top_p ?? 0.9);
    setAgentReasoningEffort(session.agent_reasoning_effort || "");
  }, [
    session?.id,
    session?.updated_at,
    session?.agent_instructions,
    session?.agent_temperature,
    session?.agent_top_p,
    session?.agent_reasoning_effort,
  ]);

  function invalidateWorkspace() {
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.workspaceSummary(projectId) });
  }

  function setSessionDetail(nextDetail: NarratorSessionDetail) {
    queryClient.setQueryData(narratorSessionQueryKeys.detail(sessionId), nextDetail);
    invalidateWorkspace();
  }

  function mergeTurnResponse(response: NarratorTurnResponse) {
    queryClient.setQueryData<NarratorSessionDetail>(
      narratorSessionQueryKeys.detail(sessionId),
      (current) => {
        if (!current) {
          return current;
        }
        const selectedActionIdSnapshot = selectedActionId;
        return {
          ...current,
          session: response.session,
          turns: orderTurns(mergeById(current.turns, [response.user_turn, response.ai_turn])),
          suggested_actions: mergeById(
            current.suggested_actions.map((action) =>
              selectedActionIdSnapshot && action.id === selectedActionIdSnapshot
                ? {
                    ...action,
                    status: "selected" as const,
                    selected_turn_id: response.user_turn.id,
                  }
                : action,
            ),
            response.suggested_actions,
          ),
          key_events: mergeById(current.key_events, response.key_event_candidates),
          memory_proposals: mergeById(
            current.memory_proposals,
            response.memory_proposal_candidates,
          ),
          warnings: response.warnings,
        };
      },
    );
    invalidateWorkspace();
  }

  function mergeSuggestedActionsResponse(response: NarratorSuggestedActionsResponse) {
    queryClient.setQueryData<NarratorSessionDetail>(
      narratorSessionQueryKeys.detail(sessionId),
      (current) =>
        current
          ? {
              ...current,
              session: response.session,
              suggested_actions: [
                ...current.suggested_actions.filter(
                  (action) => action.source_turn_id !== response.source_turn.id,
                ),
                ...response.suggested_actions,
              ],
              warnings: response.warnings,
            }
          : current,
    );
    invalidateWorkspace();
  }

  const startMutation = useMutation({
    ...narratorSessionMutations.start(sessionId),
    onSuccess: setSessionDetail,
  });
  const submitTurnMutation = useMutation({
    ...narratorSessionMutations.submitTurn(sessionId),
    onSuccess: (response) => {
      mergeTurnResponse(response);
      setContent("");
      setSelectedActionId(null);
    },
  });
  const agentSettingsMutation = useMutation({
    ...narratorSessionMutations.updateAgentSettings(sessionId),
    onSuccess: setSessionDetail,
  });
  const regenerateMutation = useMutation({
    ...narratorSessionMutations.regenerateLast(sessionId),
    onSuccess: (nextDetail) => {
      setSessionDetail(nextDetail);
      setReplayComment("");
    },
  });
  const regenerateActionsMutation = useMutation({
    ...narratorSessionMutations.regenerateSuggestedActions(sessionId),
    onSuccess: (response) => {
      mergeSuggestedActionsResponse(response);
      setSelectedActionId(null);
      setContent("");
      setActionPrompt("");
    },
  });
  const rollbackMutation = useMutation({
    ...narratorSessionMutations.rollback(sessionId),
    onSuccess: (nextDetail, variables) => {
      setSessionDetail(nextDetail);
      setReplayComment("");
      if (variables.user_turn_mode === "redo") {
        setSearchParams({});
      }
    },
  });
  const pauseMutation = useMutation({
    ...narratorSessionMutations.pause(sessionId),
    onSuccess: setSessionDetail,
  });
  const completeMutation = useMutation({
    ...narratorSessionMutations.complete(sessionId),
    onSuccess: (nextDetail) => {
      setSessionDetail(nextDetail);
      setSearchParams({ tab: "log" });
    },
  });
  const turnFlagMutation = useMutation({
    mutationFn: ({ turn, payload }: { turn: SessionTurn; payload: { is_key_event?: boolean; exclude_from_draft?: boolean } }) =>
      updateNarratorTurnFlags(sessionId, turn.id, payload),
    onSuccess: (updatedTurn) => {
      queryClient.setQueryData<NarratorSessionDetail>(
        narratorSessionQueryKeys.detail(sessionId),
        (current) =>
          current
            ? { ...current, turns: orderTurns(mergeById(current.turns, [updatedTurn])) }
            : current,
      );
      invalidateWorkspace();
    },
  });
  const keyEventMutation = useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: NarratorKeyEventUpdatePayload }) =>
      updateNarratorKeyEvent(sessionId, eventId, payload),
    onSuccess: (updatedEvent) => {
      queryClient.setQueryData<NarratorSessionDetail>(
        narratorSessionQueryKeys.detail(sessionId),
        (current) =>
          current
            ? { ...current, key_events: mergeById(current.key_events, [updatedEvent]) }
            : current,
      );
      invalidateWorkspace();
    },
  });
  const narratorGenerationLabel = generationLabel({
    isRegenerating: regenerateMutation.isPending || rollbackMutation.isPending,
    isSubmitting: submitTurnMutation.isPending,
    latestTurn: turns[turns.length - 1] || null,
    sessionStatus: session?.status || null,
  });
  const pendingUserTurn = pendingUserTurnView({
    fallbackContent: content,
    fallbackInputType: selectedActionId ? "choice" : inputType,
    isSubmitting: submitTurnMutation.isPending,
    selectedAction,
    variables: submitTurnMutation.variables,
  });
  const generationSettings = {
    provider_id: selectedProviderId || null,
    model_id: selectedModelId || null,
    temperature: supportsTemperature ? agentTemperature : undefined,
    top_p: supportsTopP ? agentTopP : null,
    reasoning_effort: supportsModelReasoning && agentReasoningEffort ? agentReasoningEffort : null,
  };

  function submitTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitTurnMutation.isPending) {
      return;
    }
    submitTurnMutation.mutate({
      input_type: selectedActionId ? "choice" : inputType,
      content: content.trim() || null,
      selected_option_id: selectedActionId,
      ...generationSettings,
    });
  }

  function regenerateLastNarration() {
    if (!canReplay || regenerateMutation.isPending) {
      return;
    }
    regenerateMutation.mutate({ comment: replayComment.trim() || null });
  }

  function regenerateSuggestedActions() {
    if (!canRegenerateActions || regenerateActionsMutation.isPending || !latestAiTurn) {
      return;
    }
    regenerateActionsMutation.mutate({
      source_turn_id: latestAiTurn.id,
      prompt: actionPrompt.trim() || null,
      ...generationSettings,
    });
  }

  function rollbackToTurn(turnId: string, userTurnMode: "keep" | "redo" = "keep") {
    if (!canReplay || rollbackMutation.isPending) {
      return;
    }
    rollbackMutation.mutate({
      target_turn_id: turnId,
      user_turn_mode: userTurnMode,
      comment: replayComment.trim() || null,
    });
  }

  function selectAction(action: SessionSuggestedAction) {
    setSelectedActionId(action.id);
    setContent(action.action);
    setInputType("choice");
  }

  return (
    <AppShell>
      <div className="narrator-route">
        <header className="narrator-header">
          <div>
            <Link className="narrator-back" to={`/projects/${projectId}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Проект
            </Link>
            <h1>{detail?.chapter?.title || "Режим рассказчика"}</h1>
            <p>{detail?.project.title || summary?.project.title || "Текущая история"}</p>
          </div>
          <div className="narrator-header__status">
            <StatusPill
              label={readOnly ? "Только чтение" : "AI доступен"}
              tone={readOnly ? "warning" : "ready"}
            />
            <span>{session ? sessionStatusLabel(session.status) : "сессия"}</span>
          </div>
        </header>

        {busy && <NoticeBlock>Загрузка сессии рассказчика</NoticeBlock>}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {summary?.warnings.map((warning) => <NoticeBlock key={warning}>{warning}</NoticeBlock>)}
        {readOnly && (
          <NoticeBlock>
            Сессия доступна только для чтения. Чтобы продолжить сцену, восстанови AI-провайдер.
          </NoticeBlock>
        )}
        {submitTurnMutation.error instanceof Error && (
          <NoticeBlock tone="error">{submitTurnMutation.error.message}</NoticeBlock>
        )}
        {agentSettingsMutation.error instanceof Error && (
          <NoticeBlock tone="error">{agentSettingsMutation.error.message}</NoticeBlock>
        )}
        {regenerateMutation.error instanceof Error && (
          <NoticeBlock tone="error">{regenerateMutation.error.message}</NoticeBlock>
        )}
        {regenerateActionsMutation.error instanceof Error && (
          <NoticeBlock tone="error">{regenerateActionsMutation.error.message}</NoticeBlock>
        )}
        {rollbackMutation.error instanceof Error && (
          <NoticeBlock tone="error">{rollbackMutation.error.message}</NoticeBlock>
        )}

        <nav className="narrator-tabs" aria-label="Режим сессии">
          <button
            aria-pressed={activeTab === "scene"}
            onClick={() => setSearchParams({})}
            type="button"
          >
            <Bot size={16} aria-hidden="true" />
            Сцена
          </button>
          <button
            aria-pressed={activeTab === "log"}
            onClick={() => setSearchParams({ tab: "log" })}
            type="button"
          >
            <ScrollText size={16} aria-hidden="true" />
            Лог
          </button>
        </nav>

        {detail && activeTab === "scene" && (
          <div className="narrator-layout">
            <main className="narrator-feed-panel">
              <div className="narrator-panel-title">
                <BookOpen size={18} aria-hidden="true" />
                <h2>Ходы сцены</h2>
              </div>
              <TurnFeed
                generationLabel={narratorGenerationLabel}
                pendingUserTurn={pendingUserTurn}
                turns={turns}
              />
            </main>

            <aside className="narrator-side">
              <section className="narrator-panel">
                <div className="narrator-panel-title">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <h2>Состояние</h2>
                </div>
                <dl className="narrator-facts">
                  <div>
                    <dt>Роль</dt>
                    <dd>{chapterUserRoleLabel(session?.user_role)}</dd>
                  </div>
                  <div>
                    <dt>Темп</dt>
                    <dd>{chapterPaceLabel(session?.pace)}</dd>
                  </div>
                  <div>
                    <dt>Активные линии</dt>
                    <dd>{session?.active_story_line_ids.length || "не выбраны"}</dd>
                  </div>
                  <div>
                    <dt>Модель</dt>
                    <dd>{summary?.runtime.active_model?.display_name || summary?.runtime.reason || "не выбрана"}</dd>
                  </div>
                </dl>
                <div className="narrator-session-actions">
                  <button
                    disabled={!canStart || startMutation.isPending}
                    onClick={() => startMutation.mutate()}
                    type="button"
                  >
                    <Play size={15} aria-hidden="true" />
                    {session?.status === "paused" ? "Продолжить" : "Начать"}
                  </button>
                  <button
                    disabled={!canPause || pauseMutation.isPending}
                    onClick={() => pauseMutation.mutate()}
                    type="button"
                  >
                    <Pause size={15} aria-hidden="true" />
                    Пауза
                  </button>
                  <button
                    disabled={!canComplete || completeMutation.isPending}
                    onClick={() => completeMutation.mutate()}
                    type="button"
                  >
                    <Square size={15} aria-hidden="true" />
                    Завершить
                  </button>
                  {session && ["completed", "draft_ready", "reviewed"].includes(session.status) && (
                    <Link className="narrator-stage-link" to={draftHref}>
                      <FileText size={15} aria-hidden="true" />
                      Черновик
                    </Link>
                  )}
                </div>
              </section>

              <AgentSettingsPanel
                activeProviderLabel={activeProviderLabel}
                agentInstructions={agentInstructions}
                agentReasoningEffort={agentReasoningEffort}
                agentTemperature={agentTemperature}
                agentTopP={agentTopP}
                modelBlockedReason={modelBlockedReason}
                models={models}
                onModelChange={setSelectedModelId}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  setSelectedModelId("");
                }}
                onReasoningEffortChange={setAgentReasoningEffort}
                onInstructionsChange={setAgentInstructions}
                onSave={() =>
                  agentSettingsMutation.mutate({
                    agent_instructions: agentInstructions.trim() || null,
                    agent_temperature: supportsTemperature ? agentTemperature : null,
                    agent_top_p: supportsTopP ? agentTopP : null,
                    agent_reasoning_effort:
                      supportsModelReasoning && agentReasoningEffort ? agentReasoningEffort : null,
                  })
                }
                onTemperatureChange={setAgentTemperature}
                onTopPChange={setAgentTopP}
                providers={selectableProviders}
                readOnly={readOnly}
                selectedModelId={selectedModelId}
                selectedModelReady={selectedModelReady}
                selectedProvider={selectedProvider}
                selectedProviderId={selectedProviderId}
                supportsModelReasoning={supportsModelReasoning}
                supportsTemperature={supportsTemperature}
                supportsTopP={supportsTopP}
                updating={agentSettingsMutation.isPending}
              />

              <section className="narrator-panel narrator-replay-panel">
                <div className="narrator-panel-title">
                  <RotateCcw size={18} aria-hidden="true" />
                  <h2>Пересборка</h2>
                </div>
                <textarea
                  disabled={readOnly || regenerateMutation.isPending || rollbackMutation.isPending}
                  name="narrator-replay-comment"
                  onChange={(event) => setReplayComment(event.target.value)}
                  placeholder="Комментарий для перегенерации или отката"
                  rows={3}
                  value={replayComment}
                />
                <button
                  disabled={!canReplay || regenerateMutation.isPending || rollbackMutation.isPending}
                  onClick={regenerateLastNarration}
                  type="button"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Перегенерировать последний narration
                </button>
              </section>

              <section className="narrator-panel">
                <div className="narrator-panel-title">
                  <ListChecks size={18} aria-hidden="true" />
                  <h2>Варианты</h2>
                </div>
                <textarea
                  className="narrator-actions-prompt"
                  disabled={readOnly || regenerateActionsMutation.isPending}
                  name="narrator-actions-prompt"
                  onChange={(event) => setActionPrompt(event.target.value)}
                  placeholder="Промпт для вариантов"
                  rows={3}
                  value={actionPrompt}
                />
                <button
                  className="narrator-inline-command"
                  disabled={
                    !canRegenerateActions ||
                    regenerateActionsMutation.isPending ||
                    regenerateMutation.isPending ||
                    rollbackMutation.isPending
                  }
                  onClick={regenerateSuggestedActions}
                  type="button"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Перегенерировать варианты
                </button>
                <div className="narrator-actions-list">
                  {suggestedActions.map((action) => (
                    <button
                      aria-pressed={selectedActionId === action.id}
                      disabled={readOnly || session?.status !== "active"}
                      key={action.id}
                      onClick={() => selectAction(action)}
                      type="button"
                    >
                      <strong>{action.label}</strong>
                      <span>{action.action}</span>
                    </button>
                  ))}
                  {suggestedActions.length === 0 && <span>варианты появятся после ответа рассказчика</span>}
                </div>
              </section>

              <form className="narrator-input-panel" onSubmit={submitTurn}>
                <div className="narrator-panel-title">
                  <Send size={18} aria-hidden="true" />
                  <h2>Твой ход</h2>
                </div>
                <div className="narrator-input-types" role="group" aria-label="Тип хода">
                  {narratorInputOptions.map((option) => (
                    <button
                      aria-pressed={inputType === option.value}
                      disabled={readOnly || session?.status !== "active"}
                      key={option.value}
                      onClick={() => {
                        setInputType(option.value);
                        if (option.value !== "choice") {
                          setSelectedActionId(null);
                        }
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {selectedAction && (
                  <span className="narrator-selected-action">
                    Выбран вариант: {selectedAction.label}
                  </span>
                )}
                <textarea
                  disabled={readOnly || session?.status !== "active" || submitTurnMutation.isPending}
                  name="narrator-turn-content"
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={
                    session?.status === "active"
                      ? "Опиши действие, реплику или авторское вмешательство"
                      : "Сначала начни или продолжи сессию"
                  }
                  rows={5}
                  value={content}
                />
                <button disabled={!canSubmit || submitTurnMutation.isPending} type="submit">
                  <Send size={15} aria-hidden="true" />
                  Отправить ход
                </button>
              </form>
            </aside>
          </div>
        )}

        {detail && activeTab === "log" && (
          <SessionLog
            canReplay={canReplay}
            detail={detail}
            onKeyEventUpdate={(eventId, payload) => keyEventMutation.mutate({ eventId, payload })}
            onRegenerateLast={regenerateLastNarration}
            onReplayCommentChange={setReplayComment}
            onRollback={rollbackToTurn}
            onTurnFlagUpdate={(turn, payload) => turnFlagMutation.mutate({ turn, payload })}
            readOnly={readOnly}
            replayComment={replayComment}
            updating={turnFlagMutation.isPending || keyEventMutation.isPending}
            replaying={regenerateMutation.isPending || rollbackMutation.isPending}
          />
        )}
      </div>
    </AppShell>
  );
}

function TurnFeed({
  generationLabel,
  pendingUserTurn,
  turns,
}: {
  generationLabel: string | null;
  pendingUserTurn: PendingUserTurn | null;
  turns: SessionTurn[];
}) {
  return (
    <div className="narrator-feed">
      {turns.map((turn) => (
        <article className={`narrator-turn narrator-turn--${turn.actor_type}`} key={turn.id}>
          <div>
            <strong>{actorLabel(turn.actor_type)}</strong>
            <span>{narratorInputLabel(turn.turn_type)}</span>
          </div>
          <p>{turn.content}</p>
          <footer>
            {turn.is_key_event && <span>важно</span>}
            {turn.exclude_from_draft && <span>не включать в черновик</span>}
          </footer>
        </article>
      ))}
      {pendingUserTurn && (
        <article className="narrator-turn narrator-turn--user narrator-turn--optimistic">
          <div>
            <strong>Пользователь</strong>
            <span>{narratorInputLabel(pendingUserTurn.inputType)}</span>
          </div>
          <p>{pendingUserTurn.content}</p>
          <footer>
            <span>отправлено, ждет ответа</span>
          </footer>
        </article>
      )}
      {generationLabel && (
        <article className="narrator-turn narrator-turn--pending" role="status" aria-live="polite">
          <div>
            <strong>Рассказчик</strong>
            <span>generation</span>
          </div>
          <p>{generationLabel}</p>
          <div className="narrator-generation-pulse" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </article>
      )}
      {turns.length === 0 && <NoticeBlock>Лог ходов пока пуст</NoticeBlock>}
    </div>
  );
}

function generationLabel({
  isRegenerating,
  isSubmitting,
  latestTurn,
  sessionStatus,
}: {
  isRegenerating: boolean;
  isSubmitting: boolean;
  latestTurn: SessionTurn | null;
  sessionStatus: string | null;
}) {
  if (isRegenerating) {
    return "Рассказчик пересобирает продолжение сцены...";
  }
  if (isSubmitting || (sessionStatus === "active" && latestTurn?.actor_type === "user")) {
    return "Рассказчик генерирует продолжение сцены...";
  }
  return null;
}

function pendingUserTurnView({
  fallbackContent,
  fallbackInputType,
  isSubmitting,
  selectedAction,
  variables,
}: {
  fallbackContent: string;
  fallbackInputType: NarratorInputType;
  isSubmitting: boolean;
  selectedAction: SessionSuggestedAction | null;
  variables: NarratorTurnPayload | undefined;
}): PendingUserTurn | null {
  if (!isSubmitting) {
    return null;
  }
  const submittedContent = variables?.content?.trim() || selectedAction?.action || fallbackContent.trim();
  if (!submittedContent) {
    return null;
  }
  return {
    content: submittedContent,
    inputType: variables?.input_type || fallbackInputType,
  };
}

function AgentSettingsPanel({
  activeProviderLabel,
  agentInstructions,
  agentReasoningEffort,
  agentTemperature,
  agentTopP,
  modelBlockedReason,
  models,
  onInstructionsChange,
  onModelChange,
  onProviderChange,
  onReasoningEffortChange,
  onSave,
  onTemperatureChange,
  onTopPChange,
  providers,
  readOnly,
  selectedModelId,
  selectedModelReady,
  selectedProvider,
  selectedProviderId,
  supportsModelReasoning,
  supportsTemperature,
  supportsTopP,
  updating,
}: {
  activeProviderLabel: string;
  agentInstructions: string;
  agentReasoningEffort: NarratorReasoningEffort | "";
  agentTemperature: number;
  agentTopP: number;
  modelBlockedReason: string | undefined;
  models: ProviderModel[];
  onInstructionsChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onReasoningEffortChange: (value: NarratorReasoningEffort | "") => void;
  onSave: () => void;
  onTemperatureChange: (value: number) => void;
  onTopPChange: (value: number) => void;
  providers: Provider[];
  readOnly: boolean;
  selectedModelId: string;
  selectedModelReady: boolean;
  selectedProvider: Provider | undefined;
  selectedProviderId: string;
  supportsModelReasoning: boolean;
  supportsTemperature: boolean;
  supportsTopP: boolean;
  updating: boolean;
}) {
  function saveAgentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  return (
    <form className="narrator-panel narrator-agent-panel" onSubmit={saveAgentSettings}>
      <div className="narrator-agent-header">
        <div className="narrator-panel-title">
          <Bot size={18} aria-hidden="true" />
          <h2>Модель ассистента</h2>
        </div>
        <div className="narrator-agent-status">
          <span>{activeProviderLabel}</span>
          {!selectedModelReady && (
            <Link
              aria-label="Настроить AI"
              className="narrator-agent-settings-link"
              title="Настроить AI"
              to="/settings/providers"
            >
              <PlugZap size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <p className="narrator-agent-help">
        Это “голос и мозг” рассказчика для следующих ходов. Настройки влияют на новые ответы и не
        меняют уже сохраненный текст.
      </p>
      {!readOnly && !selectedModelReady && modelBlockedReason && (
        <NoticeBlock tone="error">{modelBlockedReason}</NoticeBlock>
      )}
      <div className="narrator-agent-select-grid">
        <label className="narrator-agent-field">
          <span>Провайдер</span>
          <small>Где запускается модель: локально на твоем компьютере или во внешнем сервисе.</small>
          <select
            disabled={readOnly || updating}
            name="narrator-agent-provider"
            onChange={(event) => onProviderChange(event.target.value)}
            value={selectedProviderId}
          >
            {providers.length === 0 && <option value="">Нет доступных</option>}
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className="narrator-agent-field">
          <span>Модель</span>
          <small>Конкретная модель, которая будет продолжать сцену и предлагать действия.</small>
          <select
            disabled={readOnly || updating || !selectedProvider}
            name="narrator-agent-model"
            onChange={(event) => onModelChange(event.target.value)}
            value={selectedModelId}
          >
            {models.length === 0 && <option value="">Нет разрешенных</option>}
            {models.map((model) => (
              <option key={model.id} value={model.model_id}>
                {model.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="narrator-agent-parameter-grid">
        {supportsTemperature && (
          <label className="narrator-agent-range">
            <span>Температура</span>
            <small>Ниже - спокойнее и предсказуемее. Выше - смелее, образнее и рискованнее.</small>
            <input
              aria-label="Температура"
              disabled={readOnly || updating}
              max="2"
              min="0"
              name="narrator-agent-temperature"
              onChange={(event) => onTemperatureChange(Number(event.target.value))}
              step="0.05"
              type="range"
              value={agentTemperature}
            />
            <output>{agentTemperature.toFixed(2)}</output>
          </label>
        )}
        {supportsTopP && (
          <label className="narrator-agent-range">
            <span>Top P</span>
            <small>Сужает или расширяет выбор слов и идей. Если не уверен, оставь около 0.90.</small>
            <input
              aria-label="Top P"
              disabled={readOnly || updating}
              max="1"
              min="0"
              name="narrator-agent-top-p"
              onChange={(event) => onTopPChange(Number(event.target.value))}
              step="0.05"
              type="range"
              value={agentTopP}
            />
            <output>{agentTopP.toFixed(2)}</output>
          </label>
        )}
        {supportsModelReasoning && (
          <label className="narrator-agent-field">
            <span>Reasoning</span>
            <small>Auto оставляет выбор модели. High полезен для сложных сцен с несколькими линиями.</small>
            <select
              aria-label="Reasoning"
              disabled={readOnly || updating}
              name="narrator-agent-reasoning-effort"
              onChange={(event) =>
                onReasoningEffortChange(event.target.value as NarratorReasoningEffort | "")
              }
              value={agentReasoningEffort}
            >
              <option value="">Auto</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        )}
      </div>

      <label className="narrator-agent-field">
        <span>Инструкции</span>
        <small>Стиль, ограничения и поведение рассказчика для этой сессии.</small>
        <textarea
          disabled={readOnly || updating}
          name="narrator-agent-instructions"
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Стиль, ограничения и поведение рассказчика"
          rows={3}
          value={agentInstructions}
        />
      </label>
      <button disabled={readOnly || updating} type="submit">
        Сохранить настройки
      </button>
    </form>
  );
}

function SessionLog({
  canReplay,
  detail,
  onKeyEventUpdate,
  onRegenerateLast,
  onReplayCommentChange,
  onRollback,
  onTurnFlagUpdate,
  readOnly,
  replayComment,
  replaying,
  updating,
}: {
  canReplay: boolean;
  detail: NarratorSessionDetail;
  onKeyEventUpdate: (eventId: string, payload: NarratorKeyEventUpdatePayload) => void;
  onRegenerateLast: () => void;
  onReplayCommentChange: (value: string) => void;
  onRollback: (turnId: string, userTurnMode?: "keep" | "redo") => void;
  onTurnFlagUpdate: (turn: SessionTurn, payload: { is_key_event?: boolean; exclude_from_draft?: boolean }) => void;
  readOnly: boolean;
  replayComment: string;
  replaying: boolean;
  updating: boolean;
}) {
  return (
    <div className="narrator-log-layout">
      <section className="narrator-panel narrator-log-turns">
        <div className="narrator-panel-title">
          <ScrollText size={18} aria-hidden="true" />
          <h2>Лог ходов</h2>
        </div>
        {detail.turns.map((turn) => (
          <article className="narrator-log-turn" key={turn.id}>
            <div>
              <strong>{actorLabel(turn.actor_type)}</strong>
              <span>{narratorInputLabel(turn.turn_type)}</span>
            </div>
            <p>{turn.content}</p>
            <label>
              <input
                checked={turn.is_key_event}
                disabled={readOnly || updating}
                name={`turn-important-${turn.id}`}
                onChange={(event) => onTurnFlagUpdate(turn, { is_key_event: event.target.checked })}
                type="checkbox"
              />
              Важное
            </label>
            <label>
              <input
                checked={turn.exclude_from_draft}
                disabled={readOnly || updating}
                name={`turn-exclude-${turn.id}`}
                onChange={(event) =>
                  onTurnFlagUpdate(turn, { exclude_from_draft: event.target.checked })
                }
                type="checkbox"
              />
              Не включать в черновик
            </label>
            <div className="narrator-log-replay-actions">
              {turn.actor_type === "ai" && turn.turn_type === "narration" && (
                <button
                  disabled={readOnly || replaying || !canReplay || !hasPreviousUserTurn(detail.turns, turn)}
                  onClick={() => onRollback(turn.id, "keep")}
                  type="button"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Откатить и перегенерировать
                </button>
              )}
              {turn.actor_type === "user" && (
                <>
                  <button
                    disabled={readOnly || replaying || !canReplay}
                    onClick={() => onRollback(turn.id, "keep")}
                    type="button"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Оставить ход, перегенерировать
                  </button>
                  <button
                    disabled={readOnly || replaying || !canReplay}
                    onClick={() => onRollback(turn.id, "redo")}
                    type="button"
                  >
                    <Undo2 size={15} aria-hidden="true" />
                    Переделать мой ход
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      <aside className="narrator-log-side">
        <section className="narrator-panel narrator-replay-panel">
          <div className="narrator-panel-title">
            <RotateCcw size={18} aria-hidden="true" />
            <h2>Откат</h2>
          </div>
          <textarea
            disabled={readOnly || replaying}
            name="narrator-log-replay-comment"
            onChange={(event) => onReplayCommentChange(event.target.value)}
            placeholder="Комментарий для перегенерации после отката"
            rows={4}
            value={replayComment}
          />
          <button
            disabled={readOnly || replaying || !canReplay}
            onClick={onRegenerateLast}
            type="button"
          >
            <RotateCcw size={15} aria-hidden="true" />
            Перегенерировать последний narration
          </button>
        </section>

        <section className="narrator-panel">
          <div className="narrator-panel-title">
            <ListChecks size={18} aria-hidden="true" />
            <h2>Ключевые события</h2>
          </div>
          {detail.key_events.map((event) => (
            <KeyEventCard
              event={event}
              key={event.id}
              onSave={(payload) => onKeyEventUpdate(event.id, payload)}
              readOnly={readOnly || updating}
            />
          ))}
          {detail.key_events.length === 0 && <span className="narrator-empty">событий пока нет</span>}
        </section>

        <section className="narrator-panel">
          <div className="narrator-panel-title">
            <Bot size={18} aria-hidden="true" />
            <h2>Кандидаты памяти</h2>
          </div>
          {detail.memory_proposals.map((proposal) => (
            <article className="narrator-memory-proposal" key={proposal.id}>
              <strong>{String(proposal.suggested_payload.title || proposal.proposal_type)}</strong>
              <span>{memoryTypeLabel(memoryProposalType(proposal.suggested_payload.type))}</span>
              {proposal.reason && <p>{proposal.reason}</p>}
            </article>
          ))}
          {detail.memory_proposals.length === 0 && (
            <span className="narrator-empty">кандидатов памяти пока нет</span>
          )}
        </section>
      </aside>
    </div>
  );
}

function memoryProposalType(value: unknown): MemoryItemType {
  const known: MemoryItemType[] = [
    "character",
    "location",
    "item",
    "group",
    "world_rule",
    "mystery",
    "event",
    "canon_fact",
    "note",
  ];
  return known.includes(value as MemoryItemType) ? (value as MemoryItemType) : "note";
}

function hasPreviousUserTurn(turns: SessionTurn[], turn: SessionTurn): boolean {
  return turns.some(
    (candidate) => candidate.actor_type === "user" && candidate.turn_index < turn.turn_index,
  );
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function orderTurns(turns: SessionTurn[]): SessionTurn[] {
  return [...turns].sort((left, right) => left.turn_index - right.turn_index);
}

function KeyEventCard({
  event,
  onSave,
  readOnly,
}: {
  event: KeyEvent;
  onSave: (payload: NarratorKeyEventUpdatePayload) => void;
  readOnly: boolean;
}) {
  const [summary, setSummary] = useState(event.summary || "");
  const [consequences, setConsequences] = useState(event.consequences || "");
  const [includeInDraft, setIncludeInDraft] = useState(event.include_in_draft);

  return (
    <article className="narrator-key-event">
      <strong>{event.title}</strong>
      <textarea
        disabled={readOnly}
        name={`key-event-summary-${event.id}`}
        onChange={(event) => setSummary(event.target.value)}
        rows={3}
        value={summary}
      />
      <textarea
        disabled={readOnly}
        name={`key-event-consequences-${event.id}`}
        onChange={(event) => setConsequences(event.target.value)}
        placeholder="Последствия"
        rows={3}
        value={consequences}
      />
      <label>
        <input
          checked={includeInDraft}
          disabled={readOnly}
          name={`key-event-include-${event.id}`}
          onChange={(event) => setIncludeInDraft(event.target.checked)}
          type="checkbox"
        />
        Включить в черновик
      </label>
      <button
        disabled={readOnly}
        onClick={() =>
          onSave({
            summary: summary.trim() || null,
            consequences: consequences.trim() || null,
            include_in_draft: includeInDraft,
          })
        }
        type="button"
      >
        Сохранить событие
      </button>
    </article>
  );
}
