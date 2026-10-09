// `pnpm nocobase app import-classic`: the one-time import of the classic NocoReach (docs/PORT-PLAN.md, step 5). It runs
// on the computer that has the classic installation, reads that Postgres read-only, and sends the rows to a NocoReach on
// NocoBase 3 over HTTP (`--to`), which may be this checkout's dev server or a deployed app such as Studio's: a Studio
// app's database is reachable only through the app. The classic secrets are decrypted here with the classic key file
// and sealed by the target with its own keys; no value is printed or written anywhere else.
import { AppCommand, CommandError, appPath } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import type { UserMatch } from '../../server/nocoreach/classic-import.js';
import type {
  ClassicSource as Source,
  ClassicVariable,
} from './lib/classic-source.js';

export interface ImportClassicResult {
  readonly source: {
    readonly tables: Record<string, number>;
    readonly users: number;
    readonly variables: {
      readonly plain: number;
      readonly secret: number;
      readonly unreadable: readonly string[];
    };
  };
  readonly target?: {
    readonly url: string;
    readonly tables: Record<string, number>;
    readonly users: readonly UserMatch[];
  };
  readonly imported?: {
    readonly tables: Record<string, number>;
    readonly variables: number;
  };
}

const PAGE = 200;
const MAX_BATCH_ROWS = 500;

export default class ImportClassic extends AppCommand {
  static override summary =
    '把旧版 NocoReach（经典 NocoBase 插件）的数据导入 NocoBase 3 上的 NocoReach。';
  static override description = [
    '读本机旧系统的 Postgres（只读），把项目、任务、已同步数据和设置发到 --to 指定的新应用。',
    '旧库连接用环境变量：CLASSIC_DB_HOST（默认 127.0.0.1）、CLASSIC_DB_PORT（默认 5432）、CLASSIC_DB_DATABASE、',
    'CLASSIC_DB_USER（默认都是 nocobase）、CLASSIC_DB_PASSWORD、CLASSIC_DB_SCHEMA（默认 public）。',
    '新应用用 NOCOREACH_API_KEY：在新应用“设置 → API 密钥”里由超级管理员创建。',
    '旧系统保存的密钥（Google、DataForSEO、GitHub、X、Discord/Slack）要 --classic-aes-key 指向旧运行目录的',
    'storage/apps/main/aes_key.dat 才能解开；解开的值只在内存里，由新应用用自己的密钥加密保存。',
    '先加 --dry-run 看数量和用户对应；新应用里已有 NocoReach 数据时要加 --replace 才会替换。',
  ].join('\n');
  static override examples = [
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --to https://studio.example.com/nocoreach --classic-aes-key ~/noreach/storage/apps/main/aes_key.dat --dry-run',
    '<%= config.bin %> <%= command.id %> --to https://studio.example.com/nocoreach --classic-aes-key ~/noreach/storage/apps/main/aes_key.dat',
  ];
  static override flags: {
    to: Interfaces.OptionFlag<string | undefined>;
    'classic-aes-key': Interfaces.OptionFlag<string | undefined>;
    replace: Interfaces.BooleanFlag<boolean>;
    'dry-run': Interfaces.BooleanFlag<boolean>;
    'batch-bytes': Interfaces.OptionFlag<number>;
  } = {
    to: Flags.string({
      description:
        '要导入的新应用地址，带路径前缀，例如 https://studio.v2.test.nocobase.com/nocoreach 或 http://127.0.0.1:13100/main。',
    }),
    'classic-aes-key': appPath({
      description:
        '旧系统的密钥文件（旧运行目录的 storage/apps/main/aes_key.dat），用来解开旧系统保存的密钥。',
    }),
    replace: Flags.boolean({
      default: false,
      description: '新应用里已有 NocoReach 数据时，先清空再导入。',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description:
        '只统计和检查（数量、用户对应、密钥能否解开、新应用是否可写），不导入。',
    }),
    'batch-bytes': Flags.integer({
      default: 1_000_000,
      min: 50_000,
      description:
        '每次请求最多发送的字节数；新应用前面的代理拒绝大请求（413）时调小。',
    }),
  };

  public async run(): Promise<ImportClassicResult> {
    const { flags } = await this.parse(ImportClassic);
    const dryRun = flags['dry-run'];
    if (!flags.to && !dryRun)
      throw new CommandError('要用 --to 指定导入到哪个新应用。', {
        code: 'TARGET_REQUIRED',
        exit: 2,
        suggestions: ['先加 --dry-run 只看旧库里的数量'],
      });
    const apiKey = process.env.NOCOREACH_API_KEY;
    if (flags.to && !apiKey)
      throw new CommandError(
        '没有 NOCOREACH_API_KEY：在新应用“设置 → API 密钥”里创建一个，再用环境变量传入。',
        {
          code: 'API_KEY_REQUIRED',
          exit: 2,
        },
      );

    const { IMPORT_TABLES } =
      await import('../../server/nocoreach/classic-import.js');
    const { ClassicSource, classicConnection, readClassicKey } =
      await import('./lib/classic-source.js');
    const { ImportTarget, ImportTargetError } =
      await import('./lib/import-target.js');

    const target = flags.to ? new ImportTarget(flags.to, apiKey!) : null;
    const targetFailure = (error: unknown): never => {
      if (!(error instanceof ImportTargetError)) throw error;
      const hint =
        error.status === 401
          ? 'API 密钥不对或已过期'
          : error.status === 403
            ? '这个 API 密钥的主人不是新应用的超级管理员'
            : error.status === 404
              ? '新应用里没有导入接口：先部署包含导入功能的版本'
              : error.status === 413
                ? '请求太大：加 --batch-bytes 200000 再试'
                : null;
      throw new CommandError(
        `新应用拒绝了导入：${error.message}${hint ? `（${hint}）` : ''}`,
        {
          code: 'TARGET_FAILED',
          details: { status: error.status },
        },
      );
    };

    let key: Buffer | null = null;
    if (flags['classic-aes-key']) {
      try {
        key = await readClassicKey(flags['classic-aes-key']);
      } catch (error) {
        throw new CommandError(
          `读不了旧系统的密钥文件：${(error as Error).message}`,
          {
            code: 'CLASSIC_KEY_UNREADABLE',
            exit: 2,
          },
        );
      }
    }

    const connection = classicConnection(process.env);
    let source: Source;
    try {
      source = await ClassicSource.open(connection);
    } catch (error) {
      throw new CommandError(
        `连不上旧系统的数据库 ${connection.host}:${connection.port}/${connection.database}：${(error as Error).message}`,
        {
          code: 'CLASSIC_DB_UNREACHABLE',
          suggestions: [
            '检查 CLASSIC_DB_HOST、CLASSIC_DB_PORT、CLASSIC_DB_USER、CLASSIC_DB_PASSWORD',
          ],
        },
      );
    }

    try {
      // What the classic installation has.
      const tables: Record<string, number> = {};
      const columns: Record<string, string[]> = {};
      for (const table of Object.keys(IMPORT_TABLES)) {
        const found = await source.importColumns(table);
        if (!found) {
          this.warn(`旧库里没有 ${table} 表，跳过。`);
          tables[table] = 0;
          continue;
        }
        if (!found.includes('id'))
          throw new CommandError(`旧库的 ${table} 没有 id 列。`, {
            code: 'CLASSIC_SCHEMA',
          });
        columns[table] = found;
        tables[table] = await source.count(table);
      }
      const { users, rolesKnown } = await source.users();
      if (!rolesKnown)
        this.warn('旧库里没有 rolesUsers 表：认不出旧系统的管理员。');
      const variables = await source.variables(key);
      if (variables.secret && !key)
        this.warn(
          `旧系统保存了 ${variables.secret} 个密钥；没有 --classic-aes-key，这些不会导入（之后要在新应用里重新接入）。`,
        );
      else if (variables.unreadable.length)
        this.warn(
          `有 ${variables.unreadable.length} 个密钥解不开（${variables.unreadable.join('、')}）：密钥文件可能不是这个旧系统的。`,
        );

      const result: {
        source: ImportClassicResult['source'];
        target?: ImportClassicResult['target'];
        imported?: ImportClassicResult['imported'];
      } = {
        source: {
          tables,
          users: users.length,
          variables: {
            plain: variables.plain,
            secret: variables.secret,
            unreadable: variables.unreadable,
          },
        },
      };
      this.log('旧系统：');
      for (const [table, n] of Object.entries(tables))
        this.log(`  ${table.padEnd(20)} ${n}`);
      this.log(
        `  用户 ${users.length} 个；设置 ${variables.plain} 个，密钥 ${variables.secret} 个（能解开 ${variables.secret - variables.unreadable.length} 个）`,
      );

      // What the target has, and who the classic users become there.
      let matches: UserMatch[] = [];
      if (target) {
        const plan = await target
          .call<{ tables: Record<string, number>; users: UserMatch[] }>(
            'plan',
            { users },
          )
          .catch(targetFailure);
        matches = plan.users;
        result.target = {
          url: target.base,
          tables: plan.tables,
          users: plan.users,
        };
        const existing = Object.values(plan.tables).reduce((a, b) => a + b, 0);
        this.log(
          `新应用 ${target.base}：现有 NocoReach 数据 ${existing} 行${existing ? (flags.replace ? '（会先清空）' : '（要加 --replace 才会替换）') : ''}`,
        );
        this.log('用户对应：');
        for (const m of plan.users)
          this.log(
            `  ${m.name}${m.admin ? '（旧管理员）' : ''} → ${
              m.to
                ? `${m.toName ?? m.to}（${m.by === 'email' ? '邮箱相同' : m.by === 'username' ? '用户名相同' : '运行导入的管理员'}）`
                : '新应用里没有这个人：他负责的任务会显示为未知用户，成员角色不导入'
            }`,
          );
        if (existing && !flags.replace && !dryRun)
          throw new CommandError(
            '新应用里已经有 NocoReach 数据；确认用旧数据替换时加 --replace。',
            {
              code: 'TARGET_NOT_EMPTY',
              exit: 2,
              details: { tables: plan.tables },
            },
          );
      }

      if (dryRun) {
        this.setStatus('success-noop');
        this.log('这是 --dry-run：没有导入任何东西。');
        return result;
      }

      // Import: clear (with --replace), then the tables in batches, then the settings.
      const t = target!;
      const userMap = Object.fromEntries(
        matches.filter((m) => m.to).map((m) => [m.classicId, m.to]),
      );
      const admins = matches.filter((m) => m.admin).map((m) => m.classicId);
      await t.call('begin', { replace: flags.replace }).catch(targetFailure);
      const sent: Record<string, number> = {};
      for (const [table, cols] of Object.entries(columns)) {
        sent[table] = 0;
        let after: string | null = null;
        let batch: Record<string, unknown>[] = [];
        let bytes = 0;
        const flush = async () => {
          if (!batch.length) return;
          await t
            .call('rows', { table, rows: batch, users: userMap, admins })
            .catch(targetFailure);
          sent[table]! += batch.length;
          this.logToStderr(`${table}: ${sent[table]}/${tables[table]}`);
          batch = [];
          bytes = 0;
        };
        for (;;) {
          const page: Record<string, unknown>[] = await source.page(
            table,
            cols,
            after,
            PAGE,
          );
          if (!page.length) break;
          for (const row of page) {
            const size = Buffer.byteLength(JSON.stringify(row));
            if (
              batch.length &&
              (bytes + size > flags['batch-bytes'] ||
                batch.length >= MAX_BATCH_ROWS)
            )
              await flush();
            batch.push(row);
            bytes += size;
          }
          after = String(page[page.length - 1]!.id);
        }
        await flush();
      }
      // Google sends the browser back to the application it was authorized from: now the target.
      const settings: ClassicVariable[] = variables.variables.map(
        (v: ClassicVariable) =>
          v.name === 'NOREACH_GOOGLE_BASE_URL' ? { ...v, value: t.origin } : v,
      );
      if (
        settings.some((v) => v.name.startsWith('NOREACH_GOOGLE_CLIENT_')) &&
        !settings.some((v) => v.name === 'NOREACH_GOOGLE_BASE_URL')
      )
        settings.push({
          name: 'NOREACH_GOOGLE_BASE_URL',
          value: t.origin,
          secret: false,
        });
      const saved = settings.length
        ? (
            await t
              .call<{ saved: number }>('variables', { variables: settings })
              .catch(targetFailure)
          ).saved
        : 0;
      const finished = await t
        .call<{ tables: Record<string, number> }>('finish', {})
        .catch(targetFailure);
      result.imported = { tables: finished.tables, variables: saved };

      this.log('导入完成：');
      for (const [table, n] of Object.entries(tables)) {
        const now = finished.tables[table] ?? 0;
        this.log(
          `  ${table.padEnd(20)} ${now}${now === n ? '' : `（旧库 ${n}，导入时旧系统可能还在写）`}`,
        );
      }
      this.log(`  设置和密钥 ${saved} 个`);
      if (settings.some((v) => v.name === 'NOREACH_GOOGLE_BASE_URL'))
        this.log(
          `Google 回调改成了 ${t.origin}：要在 Google Cloud 后台的 OAuth 客户端里加上新的回调地址（数据接入 → Google 里能看到）。`,
        );
      this.log('建议重启新应用，让页面缓存和定时任务读到导入的数据。');
      return result;
    } finally {
      await source.close().catch(() => undefined);
    }
  }
}
