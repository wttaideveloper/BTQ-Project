import React, { useEffect, useRef } from "react";
import {
  applyNativeBeforeUnload,
  findActiveProtection,
  isIntentionalExit,
} from "@/lib/navigationGuard";

export default function NavigationGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isExitingRef = useRef(false);

  useEffect(() => {
    const pushPreventState = () => {
      try {
        history.pushState({ navGuardPrevent: true }, "");
      } catch (_) {
        // ignore
      }
    };

    pushPreventState();

    const handlePopState = async () => {
      const active = findActiveProtection();
      if (!active || isExitingRef.current || isIntentionalExit()) {
        // allow navigation
        return;
      }

      // Immediately re-push a prevent-state to synchronously cancel the back navigation.
      // This avoids a race where a quick second back press would navigate away before
      // the confirmation dialog is shown or handled.
      pushPreventState();

      try {
        const result = await active.confirmLeave();
        if (result) {
          // user confirmed; let the protected component handle cleanup/navigation
          isExitingRef.current = true;
          // Do not call any extra cleanup here to avoid duplication
        } else {
          // user canceled — nothing else to do because we already re-pushed state
        }
      } catch (err) {
        // On error, we've already re-pushed state; nothing else to do
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isExitingRef.current) return;
      applyNativeBeforeUnload(event);
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return <>{children}</>;
}
