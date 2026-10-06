/** Temel çevrimdışı tolerans: ağ hatasında cevap değişikliklerini localStorage'da sıraya alır; bağlantı gelince yeniden dener. */
import { ApiError } from "@/lib/api";

export interface AnswerPatch {
  score?: number | null;
  comment?: string | null;
  isFinding?: boolean;
}
export type AnswerQueue = Record<string, AnswerPatch>;

const key = (auditId: string) => `lean.audit.queue.${auditId}`;

export function readQueue(auditId: string): AnswerQueue {
  try {
    const raw = window.localStorage.getItem(key(auditId));
    return raw ? (JSON.parse(raw) as AnswerQueue) : {};
  } catch {
    return {};
  }
}

export function writeQueue(auditId: string, queue: AnswerQueue) {
  try {
    if (Object.keys(queue).length === 0) window.localStorage.removeItem(key(auditId));
    else window.localStorage.setItem(key(auditId), JSON.stringify(queue));
  } catch {
    /* depolama kullanılamıyor: yok say */
  }
}

/** Aynı cevap için sıradaki değişikliklerle birleştirir. */
export function enqueue(auditId: string, answerId: string, patch: AnswerPatch): AnswerQueue {
  const queue = readQueue(auditId);
  queue[answerId] = { ...queue[answerId], ...patch };
  writeQueue(auditId, queue);
  return queue;
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}
