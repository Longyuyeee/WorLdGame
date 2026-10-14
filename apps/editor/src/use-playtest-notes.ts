import { useEffect, useRef, useState } from "react";
import { readPlaytestNotes, writePlaytestNotes, type PlaytestNote } from "./playtest-notes";

/** Personal review data, separate from executable story and player saves. */
export function usePlaytestNotes(projectId: string) {
  const key = `world-studio:playtest-notes:${projectId}`;
  const baseline = useRef<string | null>(null), readable = useRef(true);
  const [notes, setNotes] = useState<readonly PlaytestNote[]>([]), [error, setError] = useState("");
  useEffect(() => {
    const load = () => { try { const raw = localStorage.getItem(key); const next = raw === null ? [] : readPlaytestNotes(raw, projectId); baseline.current = raw; readable.current = true; setNotes(next); setError(""); } catch { readable.current = false; setError("本地校订记录无法读取。现有记录不会被覆盖，请检查浏览器存储或备份文件。"); } };
    load(); const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) load(); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [key, projectId]);
  const commit = (next: readonly PlaytestNote[]): boolean => {
    try {
      if (!readable.current) throw Error("当前本地记录不可读，保存已停止，输入内容仍保留。");
      if (localStorage.getItem(key) !== baseline.current) throw Error("记录已在其他窗口更新，请刷新后对照保存；当前输入仍保留。");
      const raw = writePlaytestNotes(projectId, next); localStorage.setItem(key, raw); baseline.current = raw; setNotes(next); setError(""); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "校订记录保存失败，当前输入仍保留。"); return false; }
  };
  return { notes, error, commit };
}
