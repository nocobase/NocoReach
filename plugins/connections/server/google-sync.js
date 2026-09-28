/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var google_sync_exports = {};
__export(google_sync_exports, {
  GSC_REPORTING_TIME_ZONE: () => GSC_REPORTING_TIME_ZONE,
  GoogleDailySync: () => GoogleDailySync,
  calendarDateInTimeZone: () => calendarDateInTimeZone,
  dailySyncWindows: () => dailySyncWindows,
  resolveGa4SyncRange: () => resolveGa4SyncRange,
  resolveGscSyncRange: () => resolveGscSyncRange
});
module.exports = __toCommonJS(google_sync_exports);
var import_google_client = require("./google-client");
const GSC_REPORTING_TIME_ZONE = "America/Los_Angeles";
const WRITE_BATCH = 1e3;
const commonMetrics = [
  "activeUsers",
  "totalUsers",
  "newUsers",
  "sessions",
  "engagedSessions",
  "keyEvents",
  "eventCount",
  "averageSessionDuration",
  "userEngagementDuration",
  "screenPageViews"
];
const aiProviders = [
  ["ChatGPT", /chatgpt|openai/i],
  ["Perplexity", /perplexity/i],
  ["Claude", /claude|anthropic/i],
  ["Gemini", /gemini|bard\.google/i],
  ["Microsoft Copilot", /copilot|bing\.com\/chat/i],
  ["DeepSeek", /deepseek/i],
  ["Kimi", /kimi|moonshot/i],
  ["Qwen", /qwen|tongyi/i],
  ["Doubao", /doubao/i],
  ["Grok", /grok|x\.ai/i],
  ["Mistral", /mistral/i],
  ["Poe", /poe\.com/i],
  ["You.com", /you\.com/i],
  ["Phind", /phind/i]
];
function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}
function calendarDateInTimeZone(timeZone, now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addCalendarDays(value, days) {
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}
function resolveRange(range, defaultWindowDays, timeZone, now) {
  const latestCompleteDate = addCalendarDays(calendarDateInTimeZone(timeZone, now), -1);
  const targetEnd = range.endDate || latestCompleteDate;
  const targetStart = range.startDate || addCalendarDays(targetEnd, -(defaultWindowDays - 1));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetStart) || !/^\d{4}-\d{2}-\d{2}$/.test(targetEnd)) {
    throw new Error("Sync dates must use YYYY-MM-DD");
  }
  if (targetStart > targetEnd) throw new Error("Sync start date cannot be after end date");
  return { targetStart, targetEnd };
}
function resolveGa4SyncRange(range = {}, propertyTimeZone = "UTC", now = /* @__PURE__ */ new Date()) {
  return resolveRange(range, 3, propertyTimeZone, now);
}
function resolveGscSyncRange(range = {}, now = /* @__PURE__ */ new Date()) {
  return resolveRange(range, 7, GSC_REPORTING_TIME_ZONE, now);
}
function eachDate(start, end) {
  const dates = [];
  const cursor = /* @__PURE__ */ new Date(`${start}T00:00:00.000Z`);
  const last = /* @__PURE__ */ new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    dates.push(dateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
function dailySyncWindows(start, end) {
  return eachDate(start, end).map((date) => [date, date]);
}
function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function integer(value) {
  return Math.round(numberValue(value));
}
function normalizeGaDate(value) {
  const text = String(value ?? "");
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}
function shortHash(value) {
  let left = 2166136261;
  let right = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 16777619);
    right = Math.imul(right, 33) ^ code;
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}
function stringValue(value) {
  return typeof value === "string" ? value : "";
}
function referrerDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
function classifySource(source, medium, channel, referrer) {
  const text = [source, medium, channel, referrer].filter(Boolean).join(" ");
  const ai = aiProviders.find(([, pattern]) => pattern.test(text));
  if (ai) return { sourceCategory: "ai", aiProvider: ai[0] };
  const normalized = channel.toLowerCase();
  if (normalized.includes("organic search")) return { sourceCategory: "organic_search" };
  if (normalized.includes("paid search")) return { sourceCategory: "paid_search" };
  if (normalized.includes("social")) return { sourceCategory: "social" };
  if (normalized.includes("email")) return { sourceCategory: "email" };
  if (normalized.includes("referral")) return { sourceCategory: "referral" };
  if (normalized.includes("direct") || source === "(direct)") return { sourceCategory: "direct" };
  return { sourceCategory: "other" };
}
function metricFields(values) {
  const sessions = integer(values.sessions);
  const engagedSessions = integer(values.engagedSessions);
  const engagementRate = sessions ? engagedSessions / sessions : 0;
  return {
    users: integer(values.activeUsers),
    totalUsers: integer(values.totalUsers),
    newUsers: integer(values.newUsers),
    sessions,
    engagedSessions,
    keyEvents: integer(values.keyEvents),
    eventCount: integer(values.eventCount),
    engagementRate,
    bounceRate: Math.max(0, 1 - engagementRate),
    avgSessionDuration: numberValue(values.averageSessionDuration),
    userEngagementDuration: numberValue(values.userEngagementDuration),
    views: integer(values.screenPageViews)
  };
}
function contentMeta(page) {
  if (!page) return { contentArea: "", locale: "" };
  let pathname = page;
  try {
    pathname = new URL(page).pathname;
  } catch {
  }
  const segments = pathname.split("/").filter(Boolean);
  const knownLocales = /* @__PURE__ */ new Set(["en", "cn", "zh-CN", "ja", "ru", "fr", "de", "es", "pt", "tr", "ko", "id"]);
  const locale = knownLocales.has(segments[0]) ? segments[0] : "default";
  const normalized = pathname.toLowerCase();
  let contentArea = "website";
  if (normalized.includes("/docs") || /docs\.nocobase\./i.test(page)) contentArea = "docs";
  else if (normalized.includes("/blog")) contentArea = "blog";
  else if (normalized.includes("/solutions")) contentArea = "solutions";
  else if (normalized.includes("/customer")) contentArea = "customer_story";
  else if (normalized.includes("/plugins") || normalized.includes("/plugin")) contentArea = "plugins";
  return { contentArea, locale };
}
function errorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 2e3) : String(error).slice(0, 2e3);
}
class GoogleDailySync {
  constructor(options) {
    this.options = options;
  }
  repository(name) {
    return this.options.db.getRepository(name);
  }
  async createRun(source, targetStart, targetEnd, requestMeta) {
    const record = await this.repository("growthSyncRuns").create({
      values: {
        source,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        windowStart: targetStart,
        windowEnd: targetEnd,
        status: "running",
        recordsRead: 0,
        recordsWritten: 0,
        requestMeta
      }
    });
    return record.get("id");
  }
  async finishRun(runId, values) {
    await this.repository("growthSyncRuns").update({
      filterByTk: runId,
      values: { ...values, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }
    });
  }
  async writeRows(resource, rows, transaction) {
    let written = 0;
    const repository = this.repository(resource);
    for (let index = 0; index < rows.length; index += WRITE_BATCH) {
      const chunk = rows.slice(index, index + WRITE_BATCH);
      repository.collection.validate({ values: chunk, operation: "create" });
      await repository.model.bulkCreate(chunk, { hooks: true, returning: false, transaction });
      written += chunk.length;
    }
    return written;
  }
  async replaceWindow(resource, filter, transaction) {
    const repository = this.repository(resource);
    const { where } = repository.buildQueryOptions({ filter });
    await repository.model.destroy({ where, individualHooks: false, hooks: false, transaction });
  }
  async syncGa4(range = {}) {
    const { targetStart, targetEnd } = resolveGa4SyncRange(range, this.options.propertyTimeZone);
    const propertyId = this.options.propertyId;
    if (!propertyId) throw new Error("GA4 property ID is not configured");
    const reportSpecs = [
      { type: "overview", dimensions: ["date"], metrics: commonMetrics },
      {
        type: "source",
        dimensions: [
          "date",
          "sessionDefaultChannelGroup",
          "sessionSource",
          "sessionMedium",
          "sessionCampaignName",
          "country",
          "deviceCategory"
        ],
        metrics: commonMetrics
      },
      {
        type: "landing_page",
        dimensions: [
          "date",
          "landingPagePlusQueryString",
          "sessionDefaultChannelGroup",
          "sessionSource",
          "sessionMedium",
          "country",
          "deviceCategory"
        ],
        metrics: commonMetrics
      },
      {
        type: "geo_device",
        dimensions: ["date", "country", "city", "deviceCategory", "browser", "operatingSystem", "language"],
        metrics: commonMetrics
      },
      {
        type: "page",
        dimensions: ["date", "hostName", "pagePath", "pageTitle"],
        metrics: [
          "activeUsers",
          "totalUsers",
          "newUsers",
          "keyEvents",
          "eventCount",
          "userEngagementDuration",
          "screenPageViews"
        ]
      },
      {
        type: "referrer",
        dimensions: ["date", "pageReferrer"],
        metrics: [
          "activeUsers",
          "totalUsers",
          "newUsers",
          "keyEvents",
          "eventCount",
          "userEngagementDuration",
          "screenPageViews"
        ]
      }
    ];
    const runId = await this.createRun("ga4", targetStart, targetEnd, {
      propertyId,
      reportTypes: reportSpecs.map((item) => item.type)
    });
    let recordsRead = 0;
    let recordsWritten = 0;
    const reportMeta = [];
    try {
      const accessToken = await this.options.getAccessToken();
      for (const spec of reportSpecs.filter(s => !this.options.reportTypes || this.options.reportTypes.includes(s.type))) {
        const rows = [];
        let offset = 0;
        let rowCount = 0;
        do {
          const response = await (0, import_google_client.googleJson)(
            `${import_google_client.GOOGLE_ENDPOINTS.analyticsData}/properties/${propertyId}:runReport`,
            (0, import_google_client.jsonRequest)(accessToken, {
              dateRanges: [{ startDate: targetStart, endDate: targetEnd }],
              dimensions: spec.dimensions.map((name) => ({ name })),
              metrics: spec.metrics.map((name) => ({ name })),
              limit: "100000",
              offset: String(offset),
              orderBys: [{ dimension: { dimensionName: "date" } }]
            })
          );
          const page = Array.isArray(response.rows) ? response.rows : [];
          rows.push(...page);
          rowCount = numberValue(response.rowCount || page.length);
          offset += page.length;
          if (!page.length) break;
        } while (offset < rowCount);
        reportMeta.push({ grainType: spec.type, rowCount });
        recordsRead += rows.length;
        const records = rows.map((row) => {
          const values = {};
          spec.dimensions.forEach((name, index) => {
            var _a, _b;
            values[name] = ((_b = (_a = row.dimensionValues) == null ? void 0 : _a[index]) == null ? void 0 : _b.value) || "";
          });
          spec.metrics.forEach((name, index) => {
            var _a, _b;
            values[name] = numberValue((_b = (_a = row.metricValues) == null ? void 0 : _a[index]) == null ? void 0 : _b.value);
          });
          const periodDate = normalizeGaDate(values.date);
          const channelGroup = stringValue(values.sessionDefaultChannelGroup);
          const source = stringValue(values.sessionSource);
          const medium = stringValue(values.sessionMedium);
          const referrer = stringValue(values.pageReferrer);
          const identity = {
            grainType: spec.type,
            periodDate,
            channelGroup,
            source,
            medium,
            campaign: stringValue(values.sessionCampaignName),
            landingPage: stringValue(values.landingPagePlusQueryString),
            hostname: stringValue(values.hostName),
            pagePath: stringValue(values.pagePath),
            pageTitle: stringValue(values.pageTitle),
            country: stringValue(values.country),
            city: stringValue(values.city),
            language: stringValue(values.language),
            deviceCategory: stringValue(values.deviceCategory),
            browser: stringValue(values.browser),
            operatingSystem: stringValue(values.operatingSystem),
            referrerDomain: referrerDomain(referrer)
          };
          return {
            ...identity,
            grainKey: `ga4:${propertyId}:${spec.type}:${periodDate}:${shortHash(JSON.stringify(identity))}`,
            property: propertyId,
            ...classifySource(source, medium, channelGroup, referrer),
            ...metricFields(values),
            raw: { dimensionValues: row.dimensionValues, metricValues: row.metricValues },
            syncedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        });
        await this.replaceWindow("growthWebDaily", {
          $and: [
            { periodDate: { $dateBetween: [targetStart, targetEnd] } },
            { grainType: { $eq: spec.type } },
            { property: { $eq: propertyId } }
          ]
        });
        recordsWritten += await this.writeRows("growthWebDaily", records);
      }
      await this.finishRun(runId, {
        status: "succeeded",
        recordsRead,
        recordsWritten,
        responseMeta: { reports: reportMeta }
      });
      return { source: "ga4", targetStart, targetEnd, recordsRead, recordsWritten, reports: reportMeta };
    } catch (error) {
      await this.finishRun(runId, {
        status: "failed",
        recordsRead,
        recordsWritten,
        errorMessage: errorMessage(error),
        responseMeta: { reports: reportMeta }
      });
      throw error;
    }
  }
  async syncGsc(range = {}) {
    const { targetStart, targetEnd } = resolveGscSyncRange(range);
    const siteUrl = this.options.siteUrl;
    if (!siteUrl) throw new Error("Search Console site URL is not configured");
    const reportSpecs = [
      {
        type: "overview",
        dimensions: ["date"],
        searchTypes: ["web", "image", "video", "news", "discover", "googleNews"]
      },
      {
        type: "query_page",
        dimensions: ["date", "query", "page", "country", "device"],
        searchTypes: ["web", "image", "video", "news"],
        daily: true
      },
      {
        type: "country_device",
        dimensions: ["date", "country", "device"],
        searchTypes: ["web", "image", "video", "news"]
      },
      {
        type: "country_device",
        dimensions: ["date", "country"],
        searchTypes: ["discover", "googleNews"]
      },
      { type: "appearance", dimensions: ["searchAppearance"], searchTypes: ["web"], daily: true }
    ];
    const runId = await this.createRun("gsc", targetStart, targetEnd, {
      siteUrl,
      reportTypes: reportSpecs.map((item) => item.type)
    });
    let recordsRead = 0;
    let recordsWritten = 0;
    const reportMeta = [];
    try {
      const accessToken = await this.options.getAccessToken();
      for (const spec of reportSpecs.filter(s => !this.options.reportTypes || this.options.reportTypes.includes(s.type))) {
        for (const searchType of spec.searchTypes.filter(t => !this.options.searchTypes || this.options.searchTypes.includes(t))) {
          const windows = spec.daily ? dailySyncWindows(targetStart, targetEnd) : [[targetStart, targetEnd]];
          for (const [requestStart, requestEnd] of windows) {
            const rows = [];
            let startRow = 0;
            let hasMoreRows = true;
            while (hasMoreRows) {
              const response = await (0, import_google_client.googleJson)(
                `${import_google_client.GOOGLE_ENDPOINTS.searchConsole}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
                (0, import_google_client.jsonRequest)(accessToken, {
                  startDate: requestStart,
                  endDate: requestEnd,
                  dimensions: spec.dimensions,
                  type: searchType,
                  dataState: this.options.dataState || "all",
                  aggregationType: "auto",
                  rowLimit: 25e3,
                  startRow
                })
              );
              const page = Array.isArray(response.rows) ? response.rows : [];
              rows.push(...page);
              startRow += page.length;
              hasMoreRows = page.length === 25e3;
            }
            reportMeta.push({
              grainType: spec.type,
              searchType,
              startDate: requestStart,
              endDate: requestEnd,
              rowCount: rows.length
            });
            recordsRead += rows.length;
            const records = rows.map((row) => {
              const values = {};
              spec.dimensions.forEach((name, index) => {
                var _a;
                values[name] = ((_a = row.keys) == null ? void 0 : _a[index]) || "";
              });
              const page = values.page || "";
              const queryFull = values.query || "";
              const identity = {
                grainType: spec.type,
                searchType,
                periodDate: values.date || requestEnd,
                query: queryFull.slice(0, 255),
                queryFull,
                page,
                country: values.country || "",
                device: (values.device || "").toLowerCase(),
                searchAppearance: values.searchAppearance || ""
              };
              return {
                ...identity,
                grainKey: `gsc:${searchType}:${spec.type}:${identity.periodDate}:${shortHash(
                  JSON.stringify(identity)
                )}`,
                property: siteUrl,
                ...contentMeta(page),
                clicks: integer(row.clicks),
                impressions: integer(row.impressions),
                ctr: numberValue(row.ctr),
                avgPosition: numberValue(row.position),
                raw: row,
                syncedAt: (/* @__PURE__ */ new Date()).toISOString()
              };
            });
            const written = await this.options.db.sequelize.transaction(async (transaction) => {
              await this.replaceWindow(
                "growthSearchDaily",
                {
                  $and: [
                    { periodDate: { $dateBetween: [requestStart, requestEnd] } },
                    { grainType: { $eq: spec.type } },
                    { searchType: { $eq: searchType } },
                    { property: { $eq: siteUrl } }
                  ]
                },
                transaction
              );
              return this.writeRows("growthSearchDaily", records, transaction);
            });
            recordsWritten += written;
          }
        }
      }
      await this.finishRun(runId, {
        status: "succeeded",
        recordsRead,
        recordsWritten,
        responseMeta: { reports: reportMeta }
      });
      return { source: "gsc", targetStart, targetEnd, recordsRead, recordsWritten, reports: reportMeta };
    } catch (error) {
      await this.finishRun(runId, {
        status: "failed",
        recordsRead,
        recordsWritten,
        errorMessage: errorMessage(error),
        responseMeta: { reports: reportMeta }
      });
      throw error;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GSC_REPORTING_TIME_ZONE,
  GoogleDailySync,
  calendarDateInTimeZone,
  dailySyncWindows,
  resolveGa4SyncRange,
  resolveGscSyncRange
});
