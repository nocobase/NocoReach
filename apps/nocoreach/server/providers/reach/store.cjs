'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
// Application domain records. Persistence is exclusively the new framework's Repository API.
const record = (value) =>
  value == null
    ? null
    : Object.assign({}, value, {
        get(key) {
          return value[key];
        },
        set(key, next) {
          value[key] = next;
          this[key] = next;
        },
        toJSON() {
          return { ...value };
        },
      });
// Boolean fields use truth predicates in the native Repository filter AST.
function condition(key, operator, value) {
  if (
    typeof value === 'boolean' &&
    (operator === '$eq' || operator === '$ne')
  ) {
    const truth = operator === '$eq' ? value : !value;
    return {
      kind: 'condition',
      path: [key],
      operator: truth ? '$isTruly' : '$isFalsy',
    };
  }
  return { kind: 'condition', path: [key], operator, value };
}
function filterNode(input) {
  const items = [];
  for (const [key, value] of Object.entries(input || {})) {
    if (key === '$and' || key === '$or') {
      items.push({
        kind: 'group',
        logic: key === '$or' ? 'or' : 'and',
        items: value.map(filterNode),
      });
      continue;
    }
    const terms =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value)
        : [['$eq', value]];
    for (let [operator, operand] of terms) {
      if (key === 'id') {
        const numeric = (v) =>
          typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
        operand = Array.isArray(operand)
          ? operand.map(numeric)
          : numeric(operand);
      }
      if (operator === '$in' || operator === '$notIn') {
        items.push({
          kind: 'group',
          logic: operator === '$in' ? 'or' : 'and',
          items: operand.map((v) =>
            condition(key, operator === '$in' ? '$eq' : '$ne', v),
          ),
        });
        continue;
      }
      if (operator === '$like') {
        const pattern = String(operand);
        if (pattern.endsWith('%') && !pattern.startsWith('%')) {
          operator = '$startsWith';
          operand = pattern.slice(0, -1);
        } else if (pattern.startsWith('%') && pattern.endsWith('%')) {
          operator = '$includes';
          operand = pattern.slice(1, -1);
        } else throw new Error('Unsupported domain pattern');
      }
      items.push(condition(key, operator, operand));
    }
  }
  return { kind: 'group', logic: 'and', items };
}
const filter = (input) => ({
  kind: 'filter',
  version: 1,
  root: filterNode(input),
});
function sort(input) {
  if (!input) return undefined;
  return {
    kind: 'sort',
    version: 1,
    items: (Array.isArray(input) ? input : [input]).map((key) => ({
      kind: 'field',
      path: [key.replace(/^[-+]/, '')],
      direction: key.startsWith('-') ? 'desc' : 'asc',
    })),
  };
}
class ReachStore {
  constructor(database, users, authorization) {
    this.database = database;
    this.users = users;
    this.authorization = authorization;
    this.context = new AsyncLocalStorage();
    this.hooks = new Map();
    this.pending = Promise.resolve();
  }
  async isAdministrator(id) {
    const principal = { type: 'user', id: String(id) };
    const subjects = [
      { type: 'authenticated', id: '*' },
      ...(await this.authorization.subjects.resolveFor(principal)),
    ];
    return (await this.authorization.for({ principal, subjects }).snapshot())
      .unrestricted;
  }
  async roleOf(id) {
    if (!id) return null;
    if (await this.isAdministrator(id)) return 'admin';
    const row = await this.repository('nrSnapshots').findOne({
      filter: { key: 'nr-members' },
    });
    return ['admin', 'member'].includes(
      row?.get('payload')?.users?.[String(id)],
    )
      ? row.get('payload').users[String(id)]
      : null;
  }
  on(event, fn) {
    this.hooks.set(event, fn);
  }
  async transaction(fn) {
    const current = this.context.getStore();
    if (current) return fn(current);
    // One SQLite write transaction at a time; all nested reads use its connection as well.
    let release;
    const previous = this.pending;
    this.pending = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const after = [];
    try {
      const value = await this.database.transaction((connection) => {
        const tx = { connection, afterCommit: (fn) => after.push(fn) };
        return this.context.run(tx, () => fn(tx));
      });
      for (const callback of after) await callback();
      return value;
    } finally {
      release();
    }
  }
  repository(name) {
    if (name === 'users') {
      const users = () =>
        this.context.getStore()?.connection
          ? this.users.withConnection(this.context.getStore().connection)
          : this.users;
      return {
        find: async () =>
          (await users().list({ page: 1, pageSize: 200 })).items.map((u) =>
            record({ ...u, nickname: u.name }),
          ),
        findOne: async (o) => {
          const service = o.transaction?.connection
            ? this.users.withConnection(o.transaction.connection)
            : users();
          const u = await service.get(String(o.filterByTk || o.filter?.id));
          return record(u ? { ...u, nickname: u.name } : null);
        },
      };
    }
    const store = this;
    const repo = (o) =>
      (
        o?.transaction?.connection ||
        store.context.getStore()?.connection ||
        store.database
      ).repository(name);
    const selector = (o) =>
      filter(o.filterByTk != null ? { id: o.filterByTk } : o.filter || {});
    const api = {
      async find(o = {}) {
        return (
          await repo(o).findMany({
            filter: selector(o),
            sort: sort(o.sort),
            limit: o.limit,
            offset: o.offset,
          })
        ).map(record);
      },
      async findOne(o = {}) {
        return record(
          await repo(o).findOne({ filter: selector(o), sort: sort(o.sort) }),
        );
      },
      async count(o = {}) {
        return repo(o).count({ filter: selector(o) });
      },
      async create(o) {
        const values = {
          ...o.values,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const model = record(values);
        await store.hooks.get(`${name}.beforeCreate`)?.(model, {
          transaction: o.transaction || store.context.getStore(),
        });
        return record(
          (await repo(o).createOne({ values: model.toJSON() })).record,
        );
      },
      async update(o) {
        const values = { ...o.values, updatedAt: new Date().toISOString() };
        await repo(o).updateMany({ filter: selector(o), values });
        return api.find(o);
      },
      async destroy(o) {
        return repo(o).deleteMany({ filter: selector(o) });
      },
    };
    return api;
  }
}
module.exports = { ReachStore, filter, sort };
