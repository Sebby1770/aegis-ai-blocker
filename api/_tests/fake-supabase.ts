import { randomUUID } from 'node:crypto'

// In-memory stand-in for the subset of the supabase-js client the API uses:
// from().select/insert/upsert/update + eq/neq/order/limit/maybeSingle, rpc(),
// and auth.getUser(). It mirrors PostgREST semantics that matter for security
// tests — unique-key conflicts, upsert with ignoreDuplicates returning only
// inserted rows, maybeSingle erroring on >1 row — and yields to the event loop
// on every query so concurrent handler invocations genuinely interleave.
// Lives under api/_tests/ (underscore) so Vercel never deploys it.

type Row = Record<string, unknown>
type DbError = { message: string; code?: string }
type Result = { data: unknown; error: DbError | null }

const UNIQUE_KEYS: Record<string, string[][]> = {
  profiles: [['id']],
  lifetime_licenses: [['id'], ['provider', 'provider_reference']],
  payment_events: [['event_id']],
  audit_logs: [['id']],
}

const DEFAULTS: Record<string, () => Row> = {
  profiles: () => ({ email: null, display_name: null, stripe_customer_id: null }),
  lifetime_licenses: () => ({
    id: randomUUID(),
    status: 'active',
    stripe_customer_id: null,
    payment_intent: null,
    revoked_at: null,
    purchased_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }),
  audit_logs: () => ({ id: randomUUID(), actor: 'system', metadata: {}, created_at: new Date().toISOString() }),
  payment_events: () => ({ processed_at: new Date().toISOString() }),
}

type Op = 'select' | 'insert' | 'upsert' | 'update'

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  users = new Map<string, { id: string; email: string | null }>()
  rateLimitAllowed = true
  private failures: Array<{ table: string; op: Op; message: string }> = []

  rows(table: string) {
    return (this.tables[table] ??= [])
  }

  addUser(token: string, id: string, email: string | null = `${id}@example.com`) {
    this.users.set(token, { id, email })
    this.rows('profiles').push({ ...DEFAULTS.profiles(), id, email })
  }

  // The next `op` on `table` fails once with `message` (e.g. a transient
  // outage or an error string that must never reach a response body).
  failOnce(table: string, op: Op, message: string) {
    this.failures.push({ table, op, message })
  }

  takeFailure(table: string, op: Op) {
    const index = this.failures.findIndex((entry) => entry.table === table && entry.op === op)
    return index === -1 ? null : this.failures.splice(index, 1)[0]
  }

  client() {
    return {
      from: (table: string) => new FakeQuery(this, table),
      rpc: async (name: string) => {
        await tick()
        return name === 'consume_rate_limit'
          ? { data: this.rateLimitAllowed, error: null }
          : { data: null, error: { message: `unknown rpc ${name}` } }
      },
      auth: {
        getUser: async (token: string) => {
          await tick()
          const user = this.users.get(token)
          return user
            ? { data: { user: { id: user.id, email: user.email } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } }
        },
      },
    }
  }
}

function tick() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

function project(row: Row, columns: string | undefined) {
  if (!columns || columns.trim() === '*') {
    return { ...row }
  }

  return Object.fromEntries(columns.split(',').map((column) => [column.trim(), row[column.trim()] ?? null]))
}

class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select'
  private columns: string | undefined
  private returning = false
  private single = false
  private limitCount: number | undefined
  private orderBy: { column: string; ascending: boolean } | undefined
  private filters: Array<(row: Row) => boolean> = []
  private payload: Row[] = []
  private values: Row = {}
  private conflictColumns: string[] = []
  private ignoreDuplicates = false

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(columns?: string) {
    if (this.op === 'select') {
      this.columns = columns
    } else {
      this.returning = true
      this.columns = columns
    }
    return this
  }

  insert(values: Row | Row[]) {
    this.op = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }

  upsert(values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    this.conflictColumns = (options.onConflict ?? 'id').split(',').map((column) => column.trim())
    this.ignoreDuplicates = options.ignoreDuplicates ?? false
    return this
  }

  update(values: Row) {
    this.op = 'update'
    this.values = values
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  // SQL semantics: `col <> value` is never true for NULL.
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && row[column] !== value)
    return this
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending ?? true }
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  maybeSingle() {
    this.single = true
    return this
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<Result> {
    await tick()

    const failure = this.db.takeFailure(this.table, this.op)
    if (failure) {
      return { data: null, error: { message: failure.message } }
    }

    const rows = this.db.rows(this.table)

    switch (this.op) {
      case 'select': {
        let matched = rows.filter((row) => this.filters.every((filter) => filter(row)))
        if (this.orderBy) {
          const { column, ascending } = this.orderBy
          matched = [...matched].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
        }
        if (this.limitCount !== undefined) {
          matched = matched.slice(0, this.limitCount)
        }
        const projected = matched.map((row) => project(row, this.columns))
        return this.finish(projected)
      }
      case 'insert': {
        const inserted: Row[] = []
        for (const value of this.payload) {
          const row = { ...(DEFAULTS[this.table]?.() ?? {}), ...value }
          if (this.conflicts(row)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
          rows.push(row)
          inserted.push(row)
        }
        return this.finish(inserted.map((row) => project(row, this.columns)))
      }
      case 'upsert': {
        const written: Row[] = []
        for (const value of this.payload) {
          const existing = rows.find((row) => this.conflictColumns.every((column) => row[column] === value[column]))
          if (existing) {
            if (!this.ignoreDuplicates) {
              Object.assign(existing, value)
              written.push(existing)
            }
            continue
          }
          const row = { ...(DEFAULTS[this.table]?.() ?? {}), ...value }
          rows.push(row)
          written.push(row)
        }
        return this.finish(written.map((row) => project(row, this.columns)))
      }
      case 'update': {
        const matched = rows.filter((row) => this.filters.every((filter) => filter(row)))
        for (const row of matched) {
          Object.assign(row, this.values)
        }
        return this.finish(matched.map((row) => project(row, this.columns)))
      }
    }
  }

  private conflicts(candidate: Row) {
    return (UNIQUE_KEYS[this.table] ?? []).some((key) =>
      this.db.rows(this.table).some((row) => key.every((column) => row[column] === candidate[column])),
    )
  }

  private finish(rows: Row[]): Result {
    if (this.single) {
      if (rows.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } }
      }
      return { data: rows[0] ?? null, error: null }
    }

    if (this.op !== 'select' && !this.returning) {
      return { data: null, error: null }
    }

    return { data: rows, error: null }
  }
}
