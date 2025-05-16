import { Kysely, sql } from "kysely";

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable("User")
    .ifNotExists()

    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("name", "text")
    .addColumn("email", "text", (col) => col.unique().notNull())
    .addColumn("emailVerified", "timestamptz")
    .addColumn("password", "text")
    .addColumn("image", "text")
    .addColumn("created_at", sql`timestamp with time zone`, (cb) =>
      cb.defaultTo(sql`current_timestamp`)
    )
    .execute();

  await db.schema
    .createTable("Account")
    .ifNotExists()

    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("userId", "uuid", (col) =>
      col.references("User.id").onDelete("cascade").notNull()
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("providerAccountId", "text", (col) => col.notNull())
    .addColumn("refresh_token", "text")
    .addColumn("access_token", "text")
    .addColumn("expires_at", "bigint")
    .addColumn("token_type", "text")
    .addColumn("scope", "text")
    .addColumn("id_token", "text")
    .addColumn("session_state", "text")
    .execute();

  await db.schema
    .createIndex("Account_userId_index")
    .ifNotExists()

    .on("Account")
    .column("userId")
    .execute();

  await db.schema
    .createTable("tasks")
    .ifNotExists()
    .addColumn("id", "serial", (cb) => cb.primaryKey())
    .addColumn("test-github-action", "varchar(255)", (cb) => cb.notNull())
    .addColumn("uuid", "uuid", (col) =>
      col
        .defaultTo(sql`gen_random_uuid()`)
        .unique()
        .notNull()
    )
    .addColumn("name", "varchar(255)", (cb) => cb.notNull())
    .addColumn("description", "text") //TODO change to jsonb for structured data
    .addColumn("status", "varchar(255)", (cb) =>
      cb.notNull().defaultTo(sql`'backlog'`)
    )
    .addColumn("userId", "uuid", (col) =>
      col.references("User.id").onDelete("cascade").notNull()
    )
    .addColumn("priority", "text", (cb) =>
      cb.notNull().defaultTo(sql`'medium'`)
    )
    .addColumn("dueDate", sql`timestamptz`)
    .addColumn("labels", sql`text[]`, (cb) => cb.notNull().defaultTo(sql`'{}'`))
    .addColumn("parentTaskId", "integer", (col) =>
      col.references("tasks.id").onDelete("cascade")
    )
    .addColumn("archived", "boolean", (cb) =>
      cb.notNull().defaultTo(sql`FALSE`)
    )
    .addColumn("estimatedTime", "integer")

    .addColumn("createdAt", sql`timestamp with time zone`, (cb) =>
      cb.notNull().defaultTo(sql`current_timestamp`)
    )
    .execute();

  await db.schema
    .createTable("tasks_order")
    .ifNotExists()
    .addColumn("id", "serial", (cb) => cb.primaryKey())
    .addColumn("userId", "uuid", (col) =>
      col.references("User.id").onDelete("cascade").notNull()
    )
    .addColumn("order", sql`jsonb`, (cb) =>
      cb.notNull().defaultTo(sql`'{}'::jsonb`)
    )
    .execute();

  await sql`
    CREATE OR REPLACE FUNCTION add_task_order()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM tasks_order
        WHERE "userId" = NEW."userId"
      ) THEN
        INSERT INTO tasks_order ("userId", "order")
        VALUES (
          NEW."userId",
          jsonb_build_object(NEW."status", jsonb_build_array(NEW."uuid"))
        );
      ELSE
        UPDATE tasks_order
        SET "order" = CASE
          WHEN "order" ? NEW."status" THEN
            jsonb_set(
              "order",
              ARRAY[NEW."status"],
              ("order"->NEW."status") || jsonb_build_array(NEW."uuid")
            )
          ELSE
            jsonb_set(
              "order",
              ARRAY[NEW."status"],
              jsonb_build_array(NEW."uuid")
            )
        END
        WHERE "userId" = NEW."userId";
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER add_task_order_trigger
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION add_task_order();
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION remove_task_order()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Update the tasks_order table to remove the task's UUID from all arrays in the "order" column
UPDATE tasks_order
      SET "order" = (
 SELECT 
jsonb_object_agg(key, CASE 
             WHEN jsonb_typeof(value) = 'array' AND value ? OLD."uuid"::text THEN
                 value - OLD."uuid"::text
             ELSE value
           END)
FROM jsonb_each("order") AS je(key, value) 
)
      WHERE "userId" = OLD."userId";
     RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER remove_task_order_trigger
    AFTER DELETE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION remove_task_order();
  `.execute(db);
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable("tasks").execute();
  await db.schema.dropIndex("Account_userId_index").execute();
  await db.schema.dropTable("Account").execute();
  await db.schema.dropTable("tasks_order").execute();
  await db.schema.dropTable("User").execute();

  await sql`DROP TRIGGER IF EXISTS remove_task_order_trigger ON tasks;`.execute(
    db
  );
  await sql`DROP TRIGGER IF EXISTS add_task_order_trigger ON tasks;`.execute(
    db
  );

  await sql`DROP FUNCTION IF EXISTS remove_task_order;`.execute(db);
  await sql`DROP FUNCTION IF EXISTS add_task_order;`.execute(db);
}
