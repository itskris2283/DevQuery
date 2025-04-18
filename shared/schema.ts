import { mysqlTable, varchar, int, tinyint, boolean, timestamp, text, serial } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("student"), // "student" or "teacher"
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Define relationships for users
export const usersRelations = relations(users, ({ many }) => ({
  questions: many(questions),
  answers: many(answers),
  votes: many(votes),
  sentMessages: many(messages, { relationName: 'sender' }),
  receivedMessages: many(messages, { relationName: 'receiver' }),
  following: many(follows, { relationName: 'follower' }),
  followers: many(follows, { relationName: 'following' }),
}));

// Questions table
export const questions = mysqlTable("questions", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("image_url", { length: 255 }),
  solved: boolean("solved").default(false).notNull(),
  views: int("views").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
  userId: true,
  solved: true,
  createdAt: true,
  updatedAt: true,
});

// Define relationships for questions
export const questionsRelations = relations(questions, ({ one, many }) => ({
  user: one(users, {
    fields: [questions.userId],
    references: [users.id],
  }),
  answers: many(answers),
  questionTags: many(questionTags),
  votes: many(votes),
}));

// Tags table
export const tags = mysqlTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
});

// Define relationships for tags
export const tagsRelations = relations(tags, ({ many }) => ({
  questionTags: many(questionTags),
}));

// Question Tags join table
export const questionTags = mysqlTable("question_tags", {
  id: serial("id").primaryKey(),
  questionId: int("question_id").notNull().references(() => questions.id),
  tagId: int("tag_id").notNull().references(() => tags.id),
});

export const insertQuestionTagSchema = createInsertSchema(questionTags).omit({
  id: true,
});

// Define relationships for question tags join table
export const questionTagsRelations = relations(questionTags, ({ one }) => ({
  question: one(questions, {
    fields: [questionTags.questionId],
    references: [questions.id],
  }),
  tag: one(tags, {
    fields: [questionTags.tagId],
    references: [tags.id],
  }),
}));

// Answers table
export const answers = mysqlTable("answers", {
  id: serial("id").primaryKey(),
  questionId: int("question_id").notNull().references(() => questions.id),
  userId: int("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  imageUrl: varchar("image_url", { length: 255 }),
  accepted: boolean("accepted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAnswerSchema = createInsertSchema(answers).omit({
  id: true,
  userId: true,
  accepted: true,
  createdAt: true,
  updatedAt: true,
});

// Define relationships for answers
export const answersRelations = relations(answers, ({ one, many }) => ({
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
  user: one(users, {
    fields: [answers.userId],
    references: [users.id],
  }),
  votes: many(votes),
}));

// Votes table - for both questions and answers
export const votes = mysqlTable("votes", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  questionId: int("question_id").references(() => questions.id),
  answerId: int("answer_id").references(() => answers.id),
  value: int("value").notNull(), // 1 for upvote, -1 for downvote
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoteSchema = createInsertSchema(votes).omit({
  id: true,
  createdAt: true,
});

// Define relationships for votes
export const votesRelations = relations(votes, ({ one }) => ({
  user: one(users, {
    fields: [votes.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [votes.questionId],
    references: [questions.id],
  }),
  answer: one(answers, {
    fields: [votes.answerId],
    references: [answers.id],
  }),
}));

// Follows table
export const follows = mysqlTable("follows", {
  id: serial("id").primaryKey(),
  followerId: int("follower_id").notNull().references(() => users.id),
  followingId: int("following_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFollowSchema = createInsertSchema(follows).omit({
  id: true,
  createdAt: true,
});

// Define relationships for follows
export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}));

// Messages table
export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  senderId: int("sender_id").notNull().references(() => users.id),
  receiverId: int("receiver_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  read: true,
  createdAt: true,
});

// Define relationships for messages
export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: 'sender',
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id],
    relationName: 'receiver',
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type QuestionTag = typeof questionTags.$inferSelect;
export type InsertQuestionTag = z.infer<typeof insertQuestionTagSchema>;

export type Answer = typeof answers.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;

export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = z.infer<typeof insertFollowSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Extensions for schema validations
export const loginSchema = insertUserSchema.pick({
  username: true,
  password: true,
});

export type LoginCredentials = z.infer<typeof loginSchema>;

export const questionWithTagsSchema = insertQuestionSchema.extend({
  tags: z.array(z.string()),
});

export type QuestionWithTags = z.infer<typeof questionWithTagsSchema>;

// Extended schemas for query responses
export type QuestionWithUser = Question & {
  user: User;
  tags: Tag[];
  votesCount: number;
  answersCount: number;
  views: number;
};

export type AnswerWithUser = Answer & {
  user: User;
  votesCount: number;
};
