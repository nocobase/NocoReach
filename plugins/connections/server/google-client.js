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
var google_client_exports = {};
__export(google_client_exports, {
  GOOGLE_ENDPOINTS: () => GOOGLE_ENDPOINTS,
  GOOGLE_SCOPES: () => GOOGLE_SCOPES,
  GoogleConnectorError: () => GoogleConnectorError,
  buildAuthorizationUrl: () => buildAuthorizationUrl,
  createOAuthState: () => createOAuthState,
  googleJson: () => googleJson,
  jsonRequest: () => jsonRequest,
  normalizeBaseUrl: () => normalizeBaseUrl,
  normalizePropertyId: () => normalizePropertyId,
  normalizeReturnTo: () => normalizeReturnTo,
  normalizeSiteUrl: () => normalizeSiteUrl,
  sanitizeGa4Request: () => sanitizeGa4Request,
  sanitizeGscRequest: () => sanitizeGscRequest,
  stateCacheKey: () => stateCacheKey
});
module.exports = __toCommonJS(google_client_exports);
var import_node_crypto = require("node:crypto");
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly"
];
const GOOGLE_ENDPOINTS = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  userInfo: "https://openidconnect.googleapis.com/v1/userinfo",
  analyticsAdmin: "https://analyticsadmin.googleapis.com/v1beta",
  analyticsData: "https://analyticsdata.googleapis.com/v1beta",
  searchConsole: "https://www.googleapis.com/webmasters/v3"
};
class GoogleConnectorError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.name = "GoogleConnectorError";
  }
}
function normalizeBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleConnectorError("Public base URL is required", 400);
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new GoogleConnectorError("Public base URL must be a valid HTTP(S) URL", 400);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new GoogleConnectorError("Public base URL must use HTTP or HTTPS", 400);
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
function normalizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/v/admin/";
  }
  return value;
}
function normalizePropertyId(value) {
  if (typeof value !== "string") {
    throw new GoogleConnectorError("GA4 property ID is required", 400);
  }
  const propertyId = value.trim().replace(/^properties\//, "");
  if (!/^\d+$/.test(propertyId)) {
    throw new GoogleConnectorError("GA4 property ID must be numeric", 400);
  }
  return propertyId;
}
function normalizeSiteUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleConnectorError("Search Console site URL is required", 400);
  }
  const siteUrl = value.trim();
  if (siteUrl.startsWith("sc-domain:")) {
    if (!siteUrl.slice("sc-domain:".length).trim()) {
      throw new GoogleConnectorError("Invalid Search Console domain property", 400);
    }
    return siteUrl;
  }
  try {
    const url = new URL(siteUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new GoogleConnectorError("Search Console site URL must be an HTTP(S) URL or sc-domain property", 400);
  }
  return siteUrl;
}
function createOAuthState() {
  return (0, import_node_crypto.randomBytes)(32).toString("base64url");
}
function stateCacheKey(state) {
  return `growth-google:oauth:${(0, import_node_crypto.createHash)("sha256").update(state).digest("hex")}`;
}
function buildAuthorizationUrl(options) {
  const query = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: (options.scopes ?? GOOGLE_SCOPES).join(" "),
    state: options.state
  });
  return `${GOOGLE_ENDPOINTS.authorize}?${query.toString()}`;
}
function googleErrorMessage(payload, fallback) {
  if (typeof payload.error === "object" && typeof payload.error.message === "string") return payload.error.message;
  if (typeof payload.error_description === "string") return payload.error_description;
  if (typeof payload.error === "string") return payload.error;
  return fallback;
}
async function googleJson(url, options = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
  } catch (cause) {
    const error = new GoogleConnectorError("Google API is currently unreachable");
    error.code = ["TimeoutError", "AbortError"].includes(cause?.name) || cause?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ? "network_timeout" : "network_unreachable";
    throw error;
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new GoogleConnectorError(`Google API request failed (${response.status})`, response.status);
  }
  if (!response.ok) {
    const error = new GoogleConnectorError(
      googleErrorMessage(payload, `Google API request failed (${response.status})`),
      response.status
    );
    error.code = typeof payload.error === "string" && ["invalid_grant", "invalid_client", "access_denied"].includes(payload.error) ? payload.error : "google_api_error";
    throw error;
  }
  return payload;
}
function jsonRequest(accessToken, body) {
  return {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...body ? { "Content-Type": "application/json" } : {}
    },
    ...body ? { body: JSON.stringify(body) } : {}
  };
}
function sanitizeGa4Request(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleConnectorError("GA4 request must be an object", 400);
  }
  const request = { ...value };
  const limit = Number(request.limit ?? 1e4);
  request.limit = String(Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 1e4, 1), 1e5));
  return request;
}
function sanitizeGscRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleConnectorError("Search Console request must be an object", 400);
  }
  const request = { ...value };
  if (typeof request.startDate !== "string" || typeof request.endDate !== "string") {
    throw new GoogleConnectorError("Search Console startDate and endDate are required", 400);
  }
  const rowLimit = Number(request.rowLimit ?? 25e3);
  request.rowLimit = Math.min(Math.max(Number.isFinite(rowLimit) ? Math.trunc(rowLimit) : 25e3, 1), 25e3);
  const startRow = Number(request.startRow ?? 0);
  request.startRow = Math.max(Number.isFinite(startRow) ? Math.trunc(startRow) : 0, 0);
  return request;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GOOGLE_ENDPOINTS,
  GOOGLE_SCOPES,
  GoogleConnectorError,
  buildAuthorizationUrl,
  createOAuthState,
  googleJson,
  jsonRequest,
  normalizeBaseUrl,
  normalizePropertyId,
  normalizeReturnTo,
  normalizeSiteUrl,
  sanitizeGa4Request,
  sanitizeGscRequest,
  stateCacheKey
});
