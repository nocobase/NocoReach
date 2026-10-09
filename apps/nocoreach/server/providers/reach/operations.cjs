'use strict';
// Application operation catalog. Hono owns HTTP routing and authentication.
class ReachOperations {
  constructor() {
    this.entries = new Map();
  }
  define({ name, actions }) {
    for (const [action, handler] of Object.entries(actions))
      this.entries.set(`${name}/${action}`, {
        resource: name,
        action,
        handler,
        access: 'loggedIn',
      });
  }
  allow(resource, actions, access) {
    for (const action of Array.isArray(actions) ? actions : [actions]) {
      const entry = this.entries.get(`${resource}/${action}`);
      if (!entry) throw new Error(`Missing operation ${resource}/${action}`);
      entry.access = access;
    }
  }
}
module.exports = { ReachOperations };
