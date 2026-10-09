// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

const allowed=new Set(['state_expired','authorization_denied','missing_token','missing_permissions','save_failed','network_timeout','network_unreachable','invalid_grant','invalid_client','google_api_error','callback_failed']);
function callbackReason(error,stage){if(allowed.has(error?.code))return error.code;return stage==='save'?'save_failed':'callback_failed';}
export { callbackReason };