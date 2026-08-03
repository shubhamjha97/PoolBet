import { useEffect, useRef } from "react";
import { getToken } from "./api";
import type { TimelineEvent } from "./types";

// Subscribe to a group's live activity via SSE. EventSource auto-reconnects.
export function useGroupStream(groupId: string | undefined, onEvent: (e: TimelineEvent) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!groupId) return;
    const token = getToken();
    if (!token) return;

    const es = new EventSource(`/groups/${groupId}/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (m) => {
      try {
        cb.current(JSON.parse(m.data) as TimelineEvent);
      } catch {
        /* ignore malformed frames / heartbeats */
      }
    };
    // onerror: EventSource reconnects on its own using the server's retry hint.
    return () => es.close();
  }, [groupId]);
}
