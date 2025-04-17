import { 
  User, InsertUser,
  Question, InsertQuestion,
  Tag, InsertTag,
  QuestionTag, InsertQuestionTag,
  Answer, InsertAnswer,
  Vote, InsertVote,
  Follow, InsertFollow,
  Message, InsertMessage,
  QuestionWithUser, AnswerWithUser
} from "@shared/schema";

import session from 'express-session';
import createMemoryStore from 'memorystore';
import { DatabaseStorage } from './database';
import mongoose from "mongoose";

// Setup memory store for sessions when no database is available
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // Session store
  sessionStore: session.Store;

  // Error severity level
  severity: string;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsersByIds(ids: number[]): Promise<User[]>;
  searchUsers(query: string): Promise<User[]>;
  
  // Question operations
  getQuestion(id: number): Promise<Question | undefined>;
  getQuestionWithDetails(id: number): Promise<QuestionWithUser | undefined>;
  getQuestions(options: { limit: number, offset: number, sortBy: string, filter?: string }): Promise<QuestionWithUser[]>;
  getQuestionsByUserId(userId: number): Promise<QuestionWithUser[]>;
  createQuestion(userId: number, question: InsertQuestion, tagNames: string[]): Promise<Question>;
  updateQuestion(id: number, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: number): Promise<boolean>;
  markQuestionAsSolved(id: number, answerId: number): Promise<boolean>;
  incrementQuestionViews(id: number): Promise<boolean>;
  
  // Tag operations
  getTag(id: number): Promise<Tag | undefined>;
  getTagByName(name: string): Promise<Tag | undefined>;
  createTag(tag: InsertTag): Promise<Tag>;
  getAllTags(): Promise<Tag[]>;
  getTagsForQuestion(questionId: number): Promise<Tag[]>;
  
  // Answer operations
  getAnswer(id: number): Promise<Answer | undefined>;
  getAnswerWithDetails(id: number): Promise<AnswerWithUser | undefined>;
  getAnswersByQuestionId(questionId: number): Promise<AnswerWithUser[]>;
  getAnswersByUserId(userId: number): Promise<AnswerWithUser[]>;
  createAnswer(userId: number, answer: InsertAnswer): Promise<Answer>;
  updateAnswer(id: number, answer: Partial<InsertAnswer>): Promise<Answer | undefined>;
  deleteAnswer(id: number): Promise<boolean>;
  acceptAnswer(id: number): Promise<boolean>;
  
  // Vote operations
  getVotesByQuestionId(questionId: number): Promise<Vote[]>;
  getVotesByAnswerId(answerId: number): Promise<Vote[]>;
  getVoteByUserAndQuestion(userId: number, questionId: number): Promise<Vote | undefined>;
  getVoteByUserAndAnswer(userId: number, answerId: number): Promise<Vote | undefined>;
  createOrUpdateVote(vote: InsertVote): Promise<Vote>;
  getVotesCount(questionId?: number, answerId?: number): Promise<number>;
  
  // Follow operations
  getFollowsByFollowerId(followerId: number): Promise<Follow[]>;
  getFollowsByFollowingId(followingId: number): Promise<Follow[]>;
  getFollowByUserIds(followerId: number, followingId: number): Promise<Follow | undefined>;
  createFollow(follow: InsertFollow): Promise<Follow>;
  deleteFollow(followerId: number, followingId: number): Promise<boolean>;
  getFollowerCount(userId: number): Promise<number>;
  getFollowingCount(userId: number): Promise<number>;
  
  // Message operations
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByUserId(userId: number): Promise<Message[]>;
  getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<boolean>;
  getUnreadMessageCount(userId: number): Promise<number>;
  getRecentChats(userId: number): Promise<Array<{user: User, lastMessage: Message, unreadCount: number}>>;
}

// Export the database storage instance
export const storage = new DatabaseStorage();

// This is used for initialization in index.ts
export async function initStorage(): Promise<void> {
  console.log('Initializing storage...');
  try {
    // MongoDB initialization is handled by the DatabaseStorage constructor
    console.log('MongoDB storage initialized');
  } catch (error) {
    console.error('Error initializing storage:', error);
    throw error;
  }
}