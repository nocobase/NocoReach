// The connections UI lives in the Portal. The admin shell still loads every
// enabled plugin, so expose a valid, deliberately empty client plugin.
define('@nocoreach/plugin-connections', ['@nocobase/client'], function (client) {
  'use strict';
  class ConnectionsClientPlugin extends client.Plugin {}
  return { __esModule: true, default: ConnectionsClientPlugin };
});
