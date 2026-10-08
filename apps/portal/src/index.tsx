import React from "react";
import { createRoot } from "react-dom/client";
import { captureAuthenticationCallback } from "@nocobase/portal-sdk/auth";
import {
  NocoBaseErrorBoundary,
  NocoBaseErrorFallback,
} from "@/extensions/nocobase-error-boundary";

import "./locales";
import { portalI18nReady } from "./providers/i18n/runtime";
import { applySystemLocale } from "@nocobase/portal-sdk/i18n";
import { loadSystemSettings } from "@nocobase/portal-sdk/system-settings";
import { prepareLocale } from "@/i18n";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { applyDensity } from "@/components/theme/density";

// NocoReach's pages read their text when their modules load, so the language is settled (the user's choice, else the
// system language) and the English text loaded before the app is imported.
async function settleLocale() {
  // The language picked in the avatar menu is also saved to the user's account (users:updateLang), but a new sign-in
  // starts from the system language; the account's choice wins when there is one (2026-10-08).
  try {
    if (nocobaseClient.getToken()) {
      const me = await nocobaseClient.action<{ appLang?: string | null }>("auth", "check", { method: "GET" });
      if (me?.appLang && me.appLang !== nocobaseClient.getStoredLocale()) nocobaseClient.setLocale(me.appLang);
    }
  } catch {
    /* not signed in or offline: keep the browser's choice */
  }
  try {
    await applySystemLocale(await loadSystemSettings());
  } catch {
    await applySystemLocale().catch(() => undefined);
  }
  await prepareLocale();
}

// Density preset before the first paint (NocoSolution frontend standard §4.1).
applyDensity();

async function bootstrap() {
  const container = document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  const errorContext = {
    templateName: __PORTAL_TEMPLATE_NAME__,
    templateVersion: __PORTAL_TEMPLATE_VERSION__,
  };

  try {
    captureAuthenticationCallback();
    try {
      await portalI18nReady;
    } catch (error) {
      console.warn("Unable to initialize Portal translations", error);
    }

    await settleLocale().catch((error) => console.warn("Unable to load NocoReach translations", error));
    const { default: App } = await import("./App");
    root.render(
      <NocoBaseErrorBoundary variant="root" context={errorContext}>
        <App />
      </NocoBaseErrorBoundary>
    );
  } catch (error) {
    console.error("Unable to bootstrap Portal", error);
    root.render(
      <NocoBaseErrorFallback
        variant="root"
        error={error}
        context={errorContext}
        onReload={() => window.location.reload()}
      />
    );
  }
}

void bootstrap();
