// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { createHash } from 'node:crypto';
// Small contracts used by the legacy AGPL research request/response adapter.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const objects=v=>Array.isArray(v)?v.map(object):[];
const str=v=>typeof v==='string'?v.trim():'';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
class VisibilityError extends Error{constructor(code,status=400){super(code);this.status=status;this.code=code;}}
export { object, objects, str, hash, VisibilityError };