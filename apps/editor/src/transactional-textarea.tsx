import {
  useEffect,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes
} from "react";

export const DEFAULT_INPUT_BATCH_DELAY_MS = 350;

export type TextCommitReason = "idle" | "blur" | "shortcut";

export interface TransactionalTextareaProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    | "value"
    | "defaultValue"
    | "onChange"
    | "onBlur"
    | "onKeyDown"
    | "onCompositionStart"
    | "onCompositionEnd"
  > {
  readonly value: string;
  readonly onCommit: (value: string, reason: TextCommitReason) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onEscapeWhenClean?: (() => void) | undefined;
  readonly commitDelayMs?: number;
}

export function TransactionalTextarea({
  value,
  onCommit,
  onDirtyChange,
  onEscapeWhenClean,
  commitDelayMs = DEFAULT_INPUT_BATCH_DELAY_MS,
  ...textareaProps
}: TransactionalTextareaProps) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const pendingCommitRef = useRef<string | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const updateDirty = (nextDirty: boolean) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };

  const commit = (nextValue: string, reason: TextCommitReason) => {
    clearTimer();
    if (nextValue === value) {
      pendingCommitRef.current = null;
      updateDirty(false);
      return;
    }
    pendingCommitRef.current = nextValue;
    onCommit(nextValue, reason);
  };

  const scheduleCommit = (nextValue: string) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!composingRef.current) {
        commit(nextValue, "idle");
      }
    }, commitDelayMs);
  };

  useEffect(() => {
    if (pendingCommitRef.current === value) {
      pendingCommitRef.current = null;
      setDraft(value);
      updateDirty(false);
      return;
    }
    if (!dirty && pendingCommitRef.current === null) {
      setDraft(value);
    }
  }, [value, dirty]);

  useEffect(
    () => () => {
      clearTimer();
      onDirtyChange?.(false);
    },
    []
  );

  const handleCompositionStart = () => {
    composingRef.current = true;
    clearTimer();
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    const nextValue = event.currentTarget.value;
    setDraft(nextValue);
    updateDirty(nextValue !== value);
    scheduleCommit(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!composingRef.current) {
        commit(draft, "shortcut");
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearTimer();
      if (dirty) {
        pendingCommitRef.current = null;
        setDraft(value);
        updateDirty(false);
      } else {
        onEscapeWhenClean?.();
      }
    }
  };

  return (
    <textarea
      {...textareaProps}
      value={draft}
      data-input-state={composingRef.current ? "composing" : dirty ? "buffered" : "committed"}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        updateDirty(nextValue !== value);
        if (!composingRef.current) {
          scheduleCommit(nextValue);
        }
      }}
      onBlur={(event) => {
        if (!composingRef.current) {
          commit(event.currentTarget.value, "blur");
        }
      }}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
    />
  );
}
