// ?lang=en shows a fixture in English (2026-10-07). Loaded before the page module, synchronously, so the page loads
// exactly as it does in Chinese.
import en from "../../src/i18n/en.json";
import { setDictionary } from "../../src/i18n";
if (new URLSearchParams(location.search).get("lang") === "en") setDictionary(en as Record<string, string>);
