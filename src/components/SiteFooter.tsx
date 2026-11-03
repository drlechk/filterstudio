import { ExternalLink } from "lucide-react";
import { usePreferences } from "../lib/preferences";

const deployTime = new Date(__DEPLOY_TIME__);

export function SiteFooter() {
  const { language, t } = usePreferences();
  const formattedTime = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone: "UTC", timeZoneName: "short",
  }).format(deployTime);

  return <footer className="site-footer" aria-label={t("Deployment und Quellcode", "Deployment and source code")}>
    <span>{import.meta.env.DEV ? t("Entwicklungsstand", "Development build") : "Deployment"}: {" "}
      <time dateTime={__DEPLOY_TIME__}>{formattedTime}</time>
    </span>
    <a href="https://github.com/drlechk/filterstudio" target="_blank" rel="noopener noreferrer">
      GitHub · drlechk/filterstudio <ExternalLink size={13} aria-hidden="true" />
    </a>
  </footer>;
}
