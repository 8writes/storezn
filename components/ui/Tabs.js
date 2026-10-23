"use client";
import { useCallback, useEffect, useState } from "react";

// Tabs for the long vendor pages (settings, shipping, product form): one
// section on screen at a time instead of one long scroll.
//
//   const tabs = useTabs(["general", "branding"]);   // remembers #branding
//   <Tabs tabs={[{ id: "general", label: "General" }, ...]} {...tabs} />
//   <TabPanel id="branding" active={tabs.active}>...</TabPanel>
//
// Panels stay mounted (just hidden), so a form spanning several tabs keeps
// everything typed and submits every field. Pass tabs.onInvalid to the
// form as onInvalidCapture: if the browser blocks a submit because of an
// empty required field on a hidden tab, that tab opens so it can be seen.

export function useTabs(ids) {
  const [active, setActive] = useState(ids[0]);

  // Open the tab named in the URL (#contact), e.g. after a refresh or a link.
  // Also follows a link to another #tab while the page is already open.
  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.slice(1);
      if (ids.includes(fromHash)) setActive(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback((id) => {
    setActive(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {}
  }, []);

  const onInvalid = useCallback(
    (event) => {
      const panel = event.target?.closest?.("[data-tab-panel]");
      const id = panel?.getAttribute("data-tab-panel");
      if (id && id !== active) onChange(id);
    },
    [active, onChange],
  );

  return { active, onChange, onInvalid };
}

export function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div className={`sticky top-16 sm:top-0 z-20 -mx-4 sm:mx-0 bg-canvas/95 backdrop-blur-sm ${className}`}>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:px-0 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium cursor-pointer transition-colors ${
                selected ? "text-brand-700" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
              {tab.badge ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{tab.badge}</span> : null}
              <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${selected ? "bg-brand-600" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({ id, active, children, className = "" }) {
  return (
    <div role="tabpanel" data-tab-panel={id} hidden={id !== active} className={className}>
      {children}
    </div>
  );
}
