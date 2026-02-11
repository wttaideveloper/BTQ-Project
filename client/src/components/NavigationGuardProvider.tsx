import React, { useEffect, useRef } from "react";
import {
  findActiveProtection,
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
      if (!active || isExitingRef.current) {
        // allow navigation
        return;
      }

      try {
        const result = await active.confirmLeave();
        if (result) {
          // user confirmed; let the protected component handle cleanup/navigation
          isExitingRef.current = true;
          // Do not call any extra cleanup here to avoid duplication
        } else {
          // user canceled — re-push state to remain on page
          pushPreventState();
        }
      } catch (err) {
        // On error, re-push to be safe
        pushPreventState();
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const active = findActiveProtection();
      if (active && !isExitingRef.current) {
        // Ask browser to show native confirmation
        event.preventDefault();
        event.returnValue = ""; // legacy for some browsers
      }
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


