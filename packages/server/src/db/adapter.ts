/**
 * Тонкий SQL-драйвер-адаптер для Prisma (engine-less клиент, `engineType=client`).
 *
 * Prisma с `driverAdapters` шлёт готовый SQL через этот контракт; реализация
 * намеренно минимальная (queryRaw/executeRaw/executeScript + транзакции) и
 * работает поверх двух исполнителей:
 *   - прод: `pg.Pool` (node-postgres);
 *   - тесты: pg-mem (in-memory Postgres) — тот же код пути проверяется без
 *     сервера, официальный `@prisma/adapter-pg` не требуется.
 */
import type {
  ColumnType,
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlResultSet,
  Transaction,
} from '@prisma/driver-adapter-utils';

/** Минимальный async-SQL контракт, который удовлетворяют и pg.Pool, и pg-mem. */
export interface SqlExecutor {
  query(sql: string, args: unknown[]): Promise<SqlExecResult>;
  /** Выделенное соединение для транзакций (у pg.Pool есть, у pg-mem — нет). */
  connect?(): Promise<SqlExecutor & { release?(): void }>;
}

export interface SqlExecResult {
  rows: Array<Record<string, unknown>>;
  fields?: Array<{ name: string; dataTypeID?: number }>;
  rowCount?: number | null;
}

/** OID типов Postgres → ColumnType из driver-adapter-utils. */
const OID_TO_COLUMN_TYPE: Record<number, ColumnType> = {
  16: 5, // bool → Boolean
  20: 1, // int8 → Int64
  21: 0, // int2 → Int32
  23: 0, // int4 → Int32
  25: 7, // text → Text
  114: 11, // json → Json
  3802: 11, // jsonb → Json
  700: 2, // float4 → Float
  701: 3, // float8 → Double
  1700: 4, // numeric → Numeric
  1082: 8, // date → Date
  1114: 10, // timestamp → DateTime
  1184: 10, // timestamptz → DateTime
  2950: 15, // uuid → Uuid
};

/** Fallback, когда исполнитель не отдал fields (pg-mem): тип из значения. */
const CT = {
  Boolean: 5,
  Int64: 1,
  Double: 3,
  DateTime: 10,
  Json: 11,
  Text: 7,
} as const satisfies Record<string, ColumnType>;

function columnTypeFromValue(v: unknown): ColumnType {
  if (v === null || v === undefined) return CT.Text; // «неизвестно», null проходит везде
  if (typeof v === 'boolean') return CT.Boolean;
  if (typeof v === 'number') return Number.isInteger(v) ? CT.Int64 : CT.Double;
  if (typeof v === 'bigint') return CT.Int64;
  if (v instanceof Date) return CT.DateTime;
  if (typeof v === 'object') return CT.Json;
  return CT.Text;
}

function toResultSet(res: SqlExecResult): SqlResultSet {
  // pg-mem отдаёт fields=[] — пустой список НЕ признак отсутствия метаданных.
  const fields = res.fields && res.fields.length ? res.fields : null;
  const columnNames = fields ? fields.map((f) => f.name) : res.rows[0] ? Object.keys(res.rows[0]) : [];
  const columnTypes = fields
    ? fields.map((f) => OID_TO_COLUMN_TYPE[f.dataTypeID ?? 0] ?? CT.Text)
    : columnNames.map((n) => columnTypeFromValue(res.rows.map((r) => r[n]).find((v) => v !== null && v !== undefined)));
  // Строки — массивы в порядке columnNames (контракт driver-adapter).
  // Даты → ISO, jsonb-объекты → строка: движок сериализует их сам.
  const rows = res.rows.map((row) =>
    columnNames.map((n) => {
      const v = row[n];
      if (v instanceof Date) return v.toISOString();
      // jsonb приходит объектом (pg и pg-mem); движок ждёт JSON-строку.
      if (v !== null && typeof v === 'object') return JSON.stringify(v);
      return v;
    })
  );
  return { columnNames, columnTypes, rows };
}

/** json-параметры сериализуем сами: и pg, и pg-mem примут JSON-строку в jsonb. */
function prepareArgs(query: SqlQuery): unknown[] {
  return query.args.map((arg, i) => {
    const scalar = query.argTypes[i]?.scalarType;
    if (scalar === 'json' && arg !== null && typeof arg === 'object') return JSON.stringify(arg);
    return arg;
  });
}

class ItsimSqlAdapter implements SqlDriverAdapter {
  readonly provider = 'postgres' as const;
  readonly adapterName = 'itsim-pg';

  constructor(
    private readonly executor: SqlExecutor,
    private readonly onTx?: (exec: SqlExecutor & { release?(): void }) => void
  ) {}

  private async run(query: SqlQuery): Promise<SqlExecResult> {
    return this.executor.query(query.sql, prepareArgs(query));
  }

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    return toResultSet(await this.run(query));
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const res = await this.run(query);
    return res.rowCount ?? 0;
  }

  async executeScript(script: string): Promise<void> {
    // Наши миграции — обычный DDL без функций/DO-блоков; простого разреза по
    // «;» на границе строки достаточно (multi-statement query у pg и pg-mem
    // тоже можно, но поштучно ошибки читаются понятнее).
    const statements = script
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const sql of statements) {
      await this.executor.query(sql, []);
    }
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    // pg.Pool умеет выделять соединение — транзакция живёт на нём; pg-mem
    // одноконтурный, транзакция живёт на нём же (BEGIN/COMMIT-парами).
    const tx: SqlExecutor & { release?(): void } = this.executor.connect
      ? await this.executor.connect()
      : this.executor;
    const wrapped = new ItsimSqlAdapter(tx, this.onTx);
    await wrapped.executor.query('BEGIN', []);
    const options = { isolationLevel: isolationLevel ?? ('ReadCommitted' as IsolationLevel), usePhantomQuery: false };
    return {
      provider: this.provider,
      adapterName: this.adapterName,
      options,
      queryRaw: (q) => wrapped.queryRaw(q),
      executeRaw: (q) => wrapped.executeRaw(q),
      commit: async () => {
        await wrapped.executor.query('COMMIT', []);
        tx.release?.();
      },
      rollback: async () => {
        await wrapped.executor.query('ROLLBACK', []);
        tx.release?.();
      },
    };
  }

  async dispose(): Promise<void> {
    /* пул владеет соединениями; закрытие — на сторону владельца пула */
  }

  getConnectionInfo() {
    return { maxBindValues: 32766, supportsRelationJoins: false };
  }
}

/** Фабрика для `new PrismaClient({ adapter })`. */
export function itsimAdapterFactory(executor: SqlExecutor): SqlDriverAdapterFactory {
  return {
    provider: 'postgres',
    adapterName: 'itsim-pg',
    connect: async () => new ItsimSqlAdapter(executor),
  };
}

export { ItsimSqlAdapter };
