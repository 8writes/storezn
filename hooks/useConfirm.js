"use client";
import { useCallback, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal.js";

// Promise-based confirmation dialog, for any "serious" action (reject,
// disable, delete, ...) that shouldn't fire on a single accidental click.
//
//   const { confirm, confirmDialog } = useConfirm();
//   const ok = await confirm({ title: "Disable this school?", variant: "danger" });
//   if (!ok) return;
//   ...perform the action, with your own loading state (e.g. a per-row id)...
//   ...render {confirmDialog} once, anywhere in the page's JSX...
//
// With `requireReason: true`, `confirm()` resolves to the trimmed reason
// string (or null if cancelled) instead of a boolean - for actions like
// "reject" that need a reason attached. The dialog itself closes as soon
// as the user picks an option; the actual async call's loading state is
// the caller's existing button/row spinner, not this modal.
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    setOptions(opts);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const handleConfirm = useCallback(
    (reason) => settle(options?.requireReason ? reason || null : true),
    [options, settle],
  );

  const handleCancel = useCallback(
    () => settle(options?.requireReason ? null : false),
    [options, settle],
  );

  const confirmDialog = (
    <ConfirmModal
      open={!!options}
      title={options?.title}
      description={options?.description}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      requireReason={options?.requireReason}
      reasonLabel={options?.reasonLabel}
      storefront={options?.storefront}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, confirmDialog };
}
