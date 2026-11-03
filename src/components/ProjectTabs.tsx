import { useEffect, useRef } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { usePreferences } from "../lib/preferences";
import type { FilterTab } from "../lib/workspace";

export function ProjectTabs({
  tabs,
  activeId,
  onSelect,
  onNew,
  onClose,
}: {
  tabs: FilterTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
}) {
  const { t } = usePreferences();
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    activeRef.current?.focus({ preventScroll: true });
  }, [activeId]);

  return (
    <div className="project-tabs-bar">
      <div
        className="project-tabs"
        role="tablist"
        aria-label={t("Filterentwürfe", "Filter designs")}
      >
        {tabs.map((tab, index) => {
          const name =
            tab.name.trim() || t("Unbenannter Filter", "Untitled filter");
          const active = tab.id === activeId;
          return (
            <div
              className={`project-tab ${active ? "active" : ""}`}
              key={tab.id}
              role="presentation"
            >
              <button
                ref={active ? activeRef : undefined}
                className="project-tab-select"
                role="tab"
                id={`filter-tab-${tab.id}`}
                aria-controls={`filter-panel-${tab.id}`}
                aria-selected={active}
                aria-label={
                  tab.dirty
                    ? `${name} · ${t("Ungesicherte Änderungen", "Unsaved changes")}`
                    : name
                }
                tabIndex={active ? 0 : -1}
                title={name}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => {
                  let next: number;
                  switch (event.key) {
                    case "ArrowRight":
                      next = (index + 1) % tabs.length;
                      break;
                    case "ArrowLeft":
                      next = (index - 1 + tabs.length) % tabs.length;
                      break;
                    case "Home":
                      next = 0;
                      break;
                    case "End":
                      next = tabs.length - 1;
                      break;
                    case "Delete":
                      event.preventDefault();
                      event.stopPropagation();
                      onClose(tab.id);
                      return;
                    default:
                      return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(tabs[next].id);
                }}
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span className="project-tab-name">{name}</span>
                {tab.dirty && (
                  <span className="project-tab-dot" aria-hidden="true" />
                )}
              </button>
              <button
                className="project-tab-close"
                aria-label={t(`Tab „${name}“ schließen`, `Close tab “${name}”`)}
                title={t("Tab schließen", "Close tab")}
                tabIndex={active ? 0 : -1}
                onClick={() => onClose(tab.id)}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="project-tab-new"
        onClick={onNew}
        title={t("Neuer Filter", "New filter")}
        aria-label={t("Neuer Filter", "New filter")}
      >
        <Plus size={17} />
        <span>{t("Neuer Filter", "New filter")}</span>
      </button>
    </div>
  );
}
