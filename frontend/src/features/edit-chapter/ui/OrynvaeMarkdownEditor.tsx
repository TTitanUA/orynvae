import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

import {
  createOrynvaeEditorGateway,
  editorSuggestionField,
  selectionSnapshot,
  type EditorSelectionSnapshot,
  type OrynvaeEditorGateway,
} from "../model/editor-gateway";
import "./OrynvaeMarkdownEditor.css";

type OrynvaeMarkdownEditorProps = {
  ariaLabel?: string;
  className?: string;
  documentKey: string;
  markdown: string;
  onChange?: (markdown: string) => void;
  onGatewayReady?: (gateway: OrynvaeEditorGateway | null) => void;
  onSelectionChange?: (selection: EditorSelectionSnapshot) => void;
  readOnly?: boolean;
};

export function OrynvaeMarkdownEditor({
  ariaLabel = "Markdown editor",
  className,
  documentKey,
  markdown: initialMarkdown,
  onChange,
  onGatewayReady,
  onSelectionChange,
  readOnly = false,
}: OrynvaeMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const gatewayRef = useRef<OrynvaeEditorGateway | null>(null);
  const onChangeRef = useRef(onChange);
  const onGatewayReadyRef = useRef(onGatewayReady);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const initialMarkdownRef = useRef(initialMarkdown);
  const latestExternalMarkdownRef = useRef(initialMarkdown);
  const readOnlyRef = useRef(readOnly);

  useEffect(() => {
    onChangeRef.current = onChange;
    onGatewayReadyRef.current = onGatewayReady;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onChange, onGatewayReady, onSelectionChange]);

  useEffect(() => {
    initialMarkdownRef.current = initialMarkdown;
  }, [initialMarkdown]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    const readonlyCompartment = new Compartment();
    const editableCompartment = new Compartment();
    const initialDocument = initialMarkdownRef.current;
    latestExternalMarkdownRef.current = initialDocument;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialDocument,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          editorSuggestionField,
          readonlyCompartment.of(EditorState.readOnly.of(readOnlyRef.current)),
          editableCompartment.of(EditorView.editable.of(!readOnlyRef.current)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const markdown = update.state.doc.toString();
              latestExternalMarkdownRef.current = markdown;
              onChangeRef.current?.(markdown);
            }
            if (update.selectionSet || update.docChanged) {
              onSelectionChangeRef.current?.(selectionSnapshot(update.state));
            }
          }),
          EditorView.theme({
            "&": {
              minHeight: "100%",
            },
            ".cm-scroller": {
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
              lineHeight: "1.55",
            },
            ".cm-content": {
              minHeight: "520px",
              padding: "16px",
            },
            ".cm-line": {
              padding: "0 2px",
            },
          }),
        ],
      }),
    });
    view.dom.setAttribute("aria-label", ariaLabel);
    viewRef.current = view;
    const gateway = createOrynvaeEditorGateway(view, {
      readonlyCompartment,
      editableCompartment,
    });
    gatewayRef.current = gateway;
    onGatewayReadyRef.current?.(gateway);
    onSelectionChangeRef.current?.(selectionSnapshot(view.state));

    return () => {
      onGatewayReadyRef.current?.(null);
      gatewayRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, documentKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || initialMarkdown === latestExternalMarkdownRef.current) {
      return;
    }
    latestExternalMarkdownRef.current = initialMarkdown;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialMarkdown },
    });
  }, [initialMarkdown]);

  useEffect(() => {
    gatewayRef.current?.setReadOnly({ readOnly });
  }, [readOnly]);

  const rootClassName = ["orynvae-markdown-editor", className].filter(Boolean).join(" ");
  return <div className={rootClassName} ref={hostRef} />;
}
