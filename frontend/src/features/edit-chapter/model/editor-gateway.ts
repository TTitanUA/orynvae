import {
  Annotation,
  type Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export type EditorSelectionSnapshot = {
  from: number;
  to: number;
  text: string;
  isEmpty: boolean;
  anchorLine: number;
  anchorColumn: number;
  headLine: number;
  headColumn: number;
};

export type EditorAgentMetadata = {
  projectId: string;
  chapterId: string;
  sessionId?: string | null;
  draftVersionId?: string | null;
  agentActionType: string;
  sourceTurnIds?: string[];
  relatedMemoryItemIds?: string[];
  relatedStoryLineIds?: string[];
  createdAt: string;
};

export type ReplaceRangeInput = {
  from: number;
  to: number;
  text: string;
  metadata?: EditorAgentMetadata;
};

export type InsertTextInput = {
  text: string;
  metadata?: EditorAgentMetadata;
};

export type AgentSuggestionInput = ReplaceRangeInput & {
  suggestionId: string;
};

export type InlineSuggestionInput = {
  id: string;
  from: number;
  to: number;
  text: string;
};

export type RangeDecorationInput = {
  id: string;
  from: number;
  to: number;
  className?: string;
};

export type ReadOnlyInput = {
  readOnly: boolean;
};

export type OrynvaeEditorGateway = {
  getMarkdown: () => string;
  getSelection: () => EditorSelectionSnapshot;
  replaceRange: (input: ReplaceRangeInput) => void;
  insertAtCursor: (input: InsertTextInput) => void;
  applyAgentSuggestion: (input: AgentSuggestionInput) => void;
  showInlineSuggestion: (input: InlineSuggestionInput) => void;
  clearInlineSuggestion: (id: string) => void;
  decorateRange: (input: RangeDecorationInput) => void;
  setReadOnly: (input: ReadOnlyInput) => void;
};

export const agentTransactionAnnotation = Annotation.define<EditorAgentMetadata>();

type SuggestionEffectValue =
  | { type: "show"; suggestion: InlineSuggestionInput }
  | { type: "decorate"; decoration: RangeDecorationInput }
  | { type: "clear"; id?: string };

export const setEditorSuggestionEffect = StateEffect.define<SuggestionEffectValue>();

export const editorSuggestionField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    let decorations = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setEditorSuggestionEffect)) {
        continue;
      }
      if (effect.value.type === "clear") {
        decorations = Decoration.none;
        continue;
      }
      if (effect.value.type === "show") {
        const { from, to } = effect.value.suggestion;
        decorations = Decoration.set([
          Decoration.mark({
            attributes: {
              "data-suggestion-id": effect.value.suggestion.id,
              title: effect.value.suggestion.text,
            },
            class: "orynvae-markdown-editor__suggestion",
          }).range(from, to),
        ]);
        continue;
      }
      const { from, to, className, id } = effect.value.decoration;
      decorations = Decoration.set([
        Decoration.mark({
          attributes: { "data-decoration-id": id },
          class: className || "orynvae-markdown-editor__decoration",
        }).range(from, to),
      ]);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export type GatewayReadOnlyControls = {
  readonlyCompartment: Compartment;
  editableCompartment: Compartment;
};

export function selectionSnapshot(state: EditorState): EditorSelectionSnapshot {
  const selection = state.selection.main;
  const anchor = state.doc.lineAt(selection.anchor);
  const head = state.doc.lineAt(selection.head);
  return {
    from: selection.from,
    to: selection.to,
    text: state.sliceDoc(selection.from, selection.to),
    isEmpty: selection.empty,
    anchorLine: anchor.number,
    anchorColumn: selection.anchor - anchor.from + 1,
    headLine: head.number,
    headColumn: selection.head - head.from + 1,
  };
}

export function createOrynvaeEditorGateway(
  view: EditorView,
  controls: GatewayReadOnlyControls,
): OrynvaeEditorGateway {
  function isReadOnly() {
    return view.state.facet(EditorState.readOnly);
  }

  function metadataAnnotations(metadata: EditorAgentMetadata | undefined) {
    return metadata ? [agentTransactionAnnotation.of(metadata)] : [];
  }

  function safeRange(from: number, to: number) {
    const length = view.state.doc.length;
    return {
      from: Math.max(0, Math.min(from, length)),
      to: Math.max(0, Math.min(to, length)),
    };
  }

  return {
    getMarkdown: () => view.state.doc.toString(),
    getSelection: () => selectionSnapshot(view.state),
    replaceRange: ({ from, to, text, metadata }) => {
      if (isReadOnly()) {
        return;
      }
      const range = safeRange(from, to);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: text },
        selection: EditorSelection.cursor(range.from + text.length),
        annotations: metadataAnnotations(metadata),
      });
    },
    insertAtCursor: ({ text, metadata }) => {
      if (isReadOnly()) {
        return;
      }
      view.dispatch({
        ...view.state.replaceSelection(text),
        annotations: metadataAnnotations(metadata),
      });
    },
    applyAgentSuggestion: ({ from, to, text, metadata, suggestionId }) => {
      if (isReadOnly()) {
        return;
      }
      const range = safeRange(from, to);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: text },
        selection: EditorSelection.cursor(range.from + text.length),
        annotations: metadataAnnotations(metadata),
        effects: [setEditorSuggestionEffect.of({ type: "clear", id: suggestionId })],
      });
    },
    showInlineSuggestion: (suggestion) => {
      const range = safeRange(suggestion.from, suggestion.to);
      view.dispatch({
        effects: [
          setEditorSuggestionEffect.of({
            type: "show",
            suggestion: { ...suggestion, from: range.from, to: range.to },
          }),
        ],
      });
    },
    clearInlineSuggestion: (id) => {
      view.dispatch({ effects: [setEditorSuggestionEffect.of({ type: "clear", id })] });
    },
    decorateRange: (decoration) => {
      const range = safeRange(decoration.from, decoration.to);
      view.dispatch({
        effects: [
          setEditorSuggestionEffect.of({
            type: "decorate",
            decoration: { ...decoration, from: range.from, to: range.to },
          }),
        ],
      });
    },
    setReadOnly: ({ readOnly }) => {
      view.dispatch({
        effects: [
          controls.readonlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
          controls.editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
        ],
      });
    },
  };
}
