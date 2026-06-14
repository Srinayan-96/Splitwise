import { pgTable, text, timestamp, numeric, boolean, integer, pgEnum, unique } from "drizzle-orm/pg-core";

export const splitTypeEnum = pgEnum("split_type", ["equal", "unequal", "percentage", "share"]);
export const severityEnum  = pgEnum("log_severity", ["INFO", "WARNING", "ERROR"]);

export const users = pgTable("users", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull().unique(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export const groups = pgTable("groups", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable("group_members", {
  id:       text("id").primaryKey(),
  groupId:  text("group_id").notNull().references(() => groups.id),
  userId:   text("user_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull(),
  leftAt:   timestamp("left_at"),
});

export const expenses = pgTable("expenses", {
  id:               text("id").primaryKey(),
  groupId:          text("group_id").notNull().references(() => groups.id),
  description:      text("description").notNull(),
  date:             timestamp("date").notNull(),
  amount:           numeric("amount", { precision: 12, scale: 2 }).notNull(),
  originalAmount:   numeric("original_amount", { precision: 12, scale: 2 }),
  originalCurrency: text("original_currency"),
  exchangeRate:     numeric("exchange_rate", { precision: 10, scale: 4 }),
  splitType:        splitTypeEnum("split_type").notNull(),
  paidById:         text("paid_by_id").notNull().references(() => users.id),
  notes:            text("notes"),
  isDeleted:        boolean("is_deleted").default(false).notNull(),
  importRowNum:     integer("import_row_num"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

export const expenseSplits = pgTable("expense_splits", {
  id:        text("id").primaryKey(),
  expenseId: text("expense_id").notNull().references(() => expenses.id),
  userId:    text("user_id").notNull().references(() => users.id),
  amount:    numeric("amount", { precision: 12, scale: 2 }).notNull(),
});

export const settlements = pgTable("settlements", {
  id:         text("id").primaryKey(),
  groupId:    text("group_id").notNull().references(() => groups.id),
  payerId:    text("payer_id").notNull().references(() => users.id),
  receiverId: text("receiver_id").notNull().references(() => users.id),
  amount:     numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date:       timestamp("date").notNull(),
  notes:      text("notes"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export const importLogs = pgTable("import_logs", {
  id:          text("id").primaryKey(),
  importedAt:  timestamp("imported_at").defaultNow().notNull(),
  rowNum:      integer("row_num").notNull(),
  field:       text("field"),
  issue:       text("issue").notNull(),
  action:      text("action").notNull(),
  originalVal: text("original_val"),
  resolvedVal: text("resolved_val"),
  severity:    severityEnum("severity").notNull(),
  approved:    boolean("approved").default(true).notNull(),
});
