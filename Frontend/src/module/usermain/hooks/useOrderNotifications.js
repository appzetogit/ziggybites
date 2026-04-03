import { useEffect, useRef } from "react";
import io from "socket.io-client";
import { API_BASE_URL } from "@/lib/api/config.js";
import { toast } from "sonner";

const backendUrl =
  API_BASE_URL?.replace("/api", "") || "http://localhost:5000";

/**
 * Connects to the default Socket.IO namespace, joins the user room,
 * and shows a toast on every `order_status_update` event.
 *
 * Call this once in a top-level user component.
 */
export function useOrderNotifications() {
  const socketRef = useRef(null);

  useEffect(() => {
    let userId = null;
    try {
      const raw = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : null;
      userId = user?._id || user?.id || null;
    } catch {
      /* ignore */
    }
    if (!userId) return;

    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      path: "/socket.io/",
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-user", userId);
    });

    socket.on("order_status_update", (payload) => {
      const { message, orderId, status } = payload || {};
      const text = message || `Order #${orderId} status: ${status}`;
      toast.info(text, { duration: 5000 });

      try {
        const stored = JSON.parse(
          localStorage.getItem("orderNotifications") || "[]"
        );
        stored.unshift({ ...payload, readAt: null });
        localStorage.setItem(
          "orderNotifications",
          JSON.stringify(stored.slice(0, 50))
        );
      } catch {
        /* ignore */
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
}
