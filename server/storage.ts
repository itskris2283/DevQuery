import { 
  users, type User, type InsertUser,
  questions, type Question, type InsertQuestion,
  tags, type Tag, type InsertTag,
  questionTags, type QuestionTag, type InsertQuestionTag,
  answers, type Answer, type InsertAnswer,
  votes, type Vote, type InsertVote,
  follows, type Follow, type InsertFollow,
  messages, type Message, type InsertMessage,
  type QuestionWithUser, type AnswerWithUser
} from "@shared/schema";

import session from "express-session";
import createMemoryStore from "memorystore";
import { DatabaseStorage } from './database-storage';

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // Session store
  sessionStore: session.Store;

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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private questions: Map<number, Question>;
  private tags: Map<number, Tag>;
  private questionTags: Map<number, QuestionTag>;
  private answers: Map<number, Answer>;
  private votes: Map<number, Vote>;
  private follows: Map<number, Follow>;
  private messages: Map<number, Message>;
  
  sessionStore: session.Store;
  
  private userIdCounter: number;
  private questionIdCounter: number;
  private tagIdCounter: number;
  private questionTagIdCounter: number;
  private answerIdCounter: number;
  private voteIdCounter: number;
  private followIdCounter: number;
  private messageIdCounter: number;

  constructor() {
    this.users = new Map();
    this.questions = new Map();
    this.tags = new Map();
    this.questionTags = new Map();
    this.answers = new Map();
    this.votes = new Map();
    this.follows = new Map();
    this.messages = new Map();
    
    this.userIdCounter = 1;
    this.questionIdCounter = 1;
    this.tagIdCounter = 1;
    this.questionTagIdCounter = 1;
    this.answerIdCounter = 1;
    this.voteIdCounter = 1;
    this.followIdCounter = 1;
    this.messageIdCounter = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }
  
  async getUsersByIds(ids: number[]): Promise<User[]> {
    return ids.map(id => this.users.get(id)).filter(Boolean) as User[];
  }
  
  async searchUsers(query: string): Promise<User[]> {
    const lowercasedQuery = query.toLowerCase();
    return Array.from(this.users.values()).filter(
      user => user.username.toLowerCase().includes(lowercasedQuery) || 
              (user.email && user.email.toLowerCase().includes(lowercasedQuery))
    );
  }

  // Question operations
  async getQuestion(id: number): Promise<Question | undefined> {
    return this.questions.get(id);
  }
  
  async getQuestionWithDetails(id: number): Promise<QuestionWithUser | undefined> {
    const question = this.questions.get(id);
    if (!question) return undefined;
    
    const user = await this.getUser(question.userId);
    if (!user) return undefined;
    
    const tags = await this.getTagsForQuestion(question.id);
    const votesCount = await this.getVotesCount(question.id);
    const answers = await this.getAnswersByQuestionId(question.id);
    
    return {
      ...question,
      user,
      tags,
      votesCount,
      answersCount: answers.length
    };
  }
  
  async getQuestions(options: { limit: number, offset: number, sortBy: string, filter?: string }): Promise<QuestionWithUser[]> {
    const { limit, offset, sortBy, filter } = options;
    
    let questions = Array.from(this.questions.values());
    
    // Apply filters
    if (filter === 'unanswered') {
      const questionIds = new Set(questions.map(q => q.id));
      const answeredQuestionIds = new Set(Array.from(this.answers.values()).map(a => a.questionId));
      const unansweredQuestionIds = [...questionIds].filter(id => !answeredQuestionIds.has(id));
      questions = questions.filter(q => unansweredQuestionIds.includes(q.id));
    } else if (filter === 'solved') {
      questions = questions.filter(q => q.solved);
    }
    
    // Apply sorting
    if (sortBy === 'newest') {
      questions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else if (sortBy === 'votes') {
      const questionVotes = new Map<number, number>();
      
      // Calculate votes for each question
      for (const question of questions) {
        questionVotes.set(question.id, 0);
      }
      
      for (const vote of this.votes.values()) {
        if (vote.questionId) {
          const currentVotes = questionVotes.get(vote.questionId) || 0;
          questionVotes.set(vote.questionId, currentVotes + vote.value);
        }
      }
      
      questions.sort((a, b) => {
        const votesA = questionVotes.get(a.id) || 0;
        const votesB = questionVotes.get(b.id) || 0;
        return votesB - votesA;
      });
    } else if (sortBy === 'active') {
      // Get the latest answer for each question
      const latestAnswerTime = new Map<number, Date>();
      
      for (const answer of this.answers.values()) {
        const current = latestAnswerTime.get(answer.questionId);
        if (!current || answer.createdAt > current) {
          latestAnswerTime.set(answer.questionId, answer.createdAt);
        }
      }
      
      questions.sort((a, b) => {
        const timeA = latestAnswerTime.get(a.id) || a.createdAt;
        const timeB = latestAnswerTime.get(b.id) || b.createdAt;
        return timeB.getTime() - timeA.getTime();
      });
    }
    
    // Apply pagination
    questions = questions.slice(offset, offset + limit);
    
    // Fetch required data for each question
    const questionsWithDetails = await Promise.all(
      questions.map(async question => {
        const user = await this.getUser(question.userId);
        if (!user) throw new Error(`User not found for question: ${question.id}`);
        
        const tags = await this.getTagsForQuestion(question.id);
        const votesCount = await this.getVotesCount(question.id);
        const answersCount = Array.from(this.answers.values())
          .filter(a => a.questionId === question.id).length;
        
        return {
          ...question,
          user,
          tags,
          votesCount,
          answersCount
        };
      })
    );
    
    return questionsWithDetails;
  }
  
  async getQuestionsByUserId(userId: number): Promise<QuestionWithUser[]> {
    const userQuestions = Array.from(this.questions.values())
      .filter(question => question.userId === userId);
    
    const questionsWithDetails = await Promise.all(
      userQuestions.map(async question => {
        const user = await this.getUser(question.userId);
        if (!user) throw new Error(`User not found for question: ${question.id}`);
        
        const tags = await this.getTagsForQuestion(question.id);
        const votesCount = await this.getVotesCount(question.id);
        const answersCount = Array.from(this.answers.values())
          .filter(a => a.questionId === question.id).length;
        
        return {
          ...question,
          user,
          tags,
          votesCount,
          answersCount
        };
      })
    );
    
    return questionsWithDetails;
  }
  
  async createQuestion(userId: number, questionData: InsertQuestion, tagNames: string[]): Promise<Question> {
    const id = this.questionIdCounter++;
    const now = new Date();
    
    const question: Question = {
      ...questionData,
      id,
      userId,
      solved: false,
      createdAt: now,
      updatedAt: now
    };
    
    this.questions.set(id, question);
    
    // Add tags
    for (const tagName of tagNames) {
      let tag = await this.getTagByName(tagName);
      
      if (!tag) {
        tag = await this.createTag({ name: tagName });
      }
      
      await this.addTagToQuestion(question.id, tag.id);
    }
    
    return question;
  }
  
  async updateQuestion(id: number, questionData: Partial<InsertQuestion>): Promise<Question | undefined> {
    const question = this.questions.get(id);
    if (!question) return undefined;
    
    const updatedQuestion: Question = {
      ...question,
      ...questionData,
      updatedAt: new Date()
    };
    
    this.questions.set(id, updatedQuestion);
    return updatedQuestion;
  }
  
  async markQuestionAsSolved(id: number, answerId: number): Promise<boolean> {
    const question = this.questions.get(id);
    const answer = this.answers.get(answerId);
    
    if (!question || !answer || answer.questionId !== id) {
      return false;
    }
    
    // Mark the question as solved
    this.questions.set(id, {
      ...question,
      solved: true,
      updatedAt: new Date()
    });
    
    // Mark the answer as accepted
    this.answers.set(answerId, {
      ...answer,
      accepted: true,
      updatedAt: new Date()
    });
    
    return true;
  }
  
  async incrementQuestionViews(id: number): Promise<boolean> {
    const question = this.questions.get(id);
    if (!question) return false;
    
    this.questions.set(id, {
      ...question,
      views: (question.views || 0) + 1,
      updatedAt: new Date()
    });
    
    return true;
  }

  // Tag operations
  async getTag(id: number): Promise<Tag | undefined> {
    return this.tags.get(id);
  }
  
  async getTagByName(name: string): Promise<Tag | undefined> {
    return Array.from(this.tags.values()).find(
      tag => tag.name.toLowerCase() === name.toLowerCase()
    );
  }
  
  async createTag(tagData: InsertTag): Promise<Tag> {
    const id = this.tagIdCounter++;
    const tag: Tag = { ...tagData, id };
    this.tags.set(id, tag);
    return tag;
  }
  
  async getAllTags(): Promise<Tag[]> {
    return Array.from(this.tags.values());
  }
  
  async getTagsForQuestion(questionId: number): Promise<Tag[]> {
    const questionTagEntries = Array.from(this.questionTags.values())
      .filter(qt => qt.questionId === questionId);
    
    const tags = await Promise.all(
      questionTagEntries.map(async qt => this.getTag(qt.tagId))
    );
    
    return tags.filter(Boolean) as Tag[];
  }
  
  private async addTagToQuestion(questionId: number, tagId: number): Promise<QuestionTag> {
    const id = this.questionTagIdCounter++;
    const questionTag: QuestionTag = { id, questionId, tagId };
    this.questionTags.set(id, questionTag);
    return questionTag;
  }

  // Answer operations
  async getAnswer(id: number): Promise<Answer | undefined> {
    return this.answers.get(id);
  }
  
  async getAnswerWithDetails(id: number): Promise<AnswerWithUser | undefined> {
    const answer = this.answers.get(id);
    if (!answer) return undefined;
    
    const user = await this.getUser(answer.userId);
    if (!user) return undefined;
    
    const votesCount = await this.getVotesCount(undefined, answer.id);
    
    return {
      ...answer,
      user,
      votesCount
    };
  }
  
  async getAnswersByQuestionId(questionId: number): Promise<AnswerWithUser[]> {
    const questionAnswers = Array.from(this.answers.values())
      .filter(answer => answer.questionId === questionId);
    
    const answersWithDetails = await Promise.all(
      questionAnswers.map(async answer => {
        const user = await this.getUser(answer.userId);
        if (!user) throw new Error(`User not found for answer: ${answer.id}`);
        
        const votesCount = await this.getVotesCount(undefined, answer.id);
        
        return {
          ...answer,
          user,
          votesCount
        };
      })
    );
    
    // Sort by accepted first, then by votes
    return answersWithDetails.sort((a, b) => {
      if (a.accepted && !b.accepted) return -1;
      if (!a.accepted && b.accepted) return 1;
      return b.votesCount - a.votesCount;
    });
  }
  
  async getAnswersByUserId(userId: number): Promise<AnswerWithUser[]> {
    const userAnswers = Array.from(this.answers.values())
      .filter(answer => answer.userId === userId);
    
    const answersWithDetails = await Promise.all(
      userAnswers.map(async answer => {
        const user = await this.getUser(answer.userId);
        if (!user) throw new Error(`User not found for answer: ${answer.id}`);
        
        const votesCount = await this.getVotesCount(undefined, answer.id);
        
        return {
          ...answer,
          user,
          votesCount
        };
      })
    );
    
    return answersWithDetails;
  }
  
  async createAnswer(userId: number, answerData: InsertAnswer): Promise<Answer> {
    const id = this.answerIdCounter++;
    const now = new Date();
    
    const answer: Answer = {
      ...answerData,
      id,
      userId,
      accepted: false,
      createdAt: now,
      updatedAt: now
    };
    
    this.answers.set(id, answer);
    return answer;
  }
  
  async updateAnswer(id: number, answerData: Partial<InsertAnswer>): Promise<Answer | undefined> {
    const answer = this.answers.get(id);
    if (!answer) return undefined;
    
    const updatedAnswer: Answer = {
      ...answer,
      ...answerData,
      updatedAt: new Date()
    };
    
    this.answers.set(id, updatedAnswer);
    return updatedAnswer;
  }
  
  async acceptAnswer(id: number): Promise<boolean> {
    const answer = this.answers.get(id);
    if (!answer) return false;
    
    // Mark this answer as accepted
    this.answers.set(id, {
      ...answer,
      accepted: true,
      updatedAt: new Date()
    });
    
    // Mark the question as solved
    const question = this.questions.get(answer.questionId);
    if (question) {
      this.questions.set(question.id, {
        ...question,
        solved: true,
        updatedAt: new Date()
      });
    }
    
    return true;
  }

  // Vote operations
  async getVotesByQuestionId(questionId: number): Promise<Vote[]> {
    return Array.from(this.votes.values())
      .filter(vote => vote.questionId === questionId);
  }
  
  async getVotesByAnswerId(answerId: number): Promise<Vote[]> {
    return Array.from(this.votes.values())
      .filter(vote => vote.answerId === answerId);
  }
  
  async getVoteByUserAndQuestion(userId: number, questionId: number): Promise<Vote | undefined> {
    return Array.from(this.votes.values()).find(
      vote => vote.userId === userId && vote.questionId === questionId
    );
  }
  
  async getVoteByUserAndAnswer(userId: number, answerId: number): Promise<Vote | undefined> {
    return Array.from(this.votes.values()).find(
      vote => vote.userId === userId && vote.answerId === answerId
    );
  }
  
  async createOrUpdateVote(voteData: InsertVote): Promise<Vote> {
    // Check if the vote already exists
    let existingVote: Vote | undefined;
    
    if (voteData.questionId) {
      existingVote = await this.getVoteByUserAndQuestion(voteData.userId, voteData.questionId);
    } else if (voteData.answerId) {
      existingVote = await this.getVoteByUserAndAnswer(voteData.userId, voteData.answerId);
    }
    
    if (existingVote) {
      // Update existing vote
      const updatedVote: Vote = {
        ...existingVote,
        value: voteData.value,
        createdAt: new Date()
      };
      
      this.votes.set(existingVote.id, updatedVote);
      return updatedVote;
    }
    
    // Create new vote
    const id = this.voteIdCounter++;
    const vote: Vote = {
      ...voteData,
      id,
      createdAt: new Date()
    };
    
    this.votes.set(id, vote);
    return vote;
  }
  
  async getVotesCount(questionId?: number, answerId?: number): Promise<number> {
    let relevantVotes: Vote[];
    
    if (questionId) {
      relevantVotes = await this.getVotesByQuestionId(questionId);
    } else if (answerId) {
      relevantVotes = await this.getVotesByAnswerId(answerId);
    } else {
      return 0;
    }
    
    return relevantVotes.reduce((total, vote) => total + vote.value, 0);
  }

  // Follow operations
  async getFollowsByFollowerId(followerId: number): Promise<Follow[]> {
    return Array.from(this.follows.values())
      .filter(follow => follow.followerId === followerId);
  }
  
  async getFollowsByFollowingId(followingId: number): Promise<Follow[]> {
    return Array.from(this.follows.values())
      .filter(follow => follow.followingId === followingId);
  }
  
  async getFollowByUserIds(followerId: number, followingId: number): Promise<Follow | undefined> {
    return Array.from(this.follows.values()).find(
      follow => follow.followerId === followerId && follow.followingId === followingId
    );
  }
  
  async createFollow(followData: InsertFollow): Promise<Follow> {
    const id = this.followIdCounter++;
    const follow: Follow = {
      ...followData,
      id,
      createdAt: new Date()
    };
    
    this.follows.set(id, follow);
    return follow;
  }
  
  async deleteFollow(followerId: number, followingId: number): Promise<boolean> {
    const follow = await this.getFollowByUserIds(followerId, followingId);
    if (!follow) return false;
    
    this.follows.delete(follow.id);
    return true;
  }
  
  async getFollowerCount(userId: number): Promise<number> {
    const followers = await this.getFollowsByFollowingId(userId);
    return followers.length;
  }
  
  async getFollowingCount(userId: number): Promise<number> {
    const following = await this.getFollowsByFollowerId(userId);
    return following.length;
  }

  // Message operations
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }
  
  async getMessagesByUserId(userId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.senderId === userId || message.receiverId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  
  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => 
        (message.senderId === user1Id && message.receiverId === user2Id) ||
        (message.senderId === user2Id && message.receiverId === user1Id)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  
  async createMessage(messageData: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const message: Message = {
      ...messageData,
      id,
      read: false,
      createdAt: new Date()
    };
    
    this.messages.set(id, message);
    return message;
  }
  
  async markMessageAsRead(id: number): Promise<boolean> {
    const message = this.messages.get(id);
    if (!message) return false;
    
    this.messages.set(id, {
      ...message,
      read: true
    });
    
    return true;
  }
  
  async getUnreadMessageCount(userId: number): Promise<number> {
    return Array.from(this.messages.values())
      .filter(message => message.receiverId === userId && !message.read)
      .length;
  }
  
  async getRecentChats(userId: number): Promise<Array<{user: User, lastMessage: Message, unreadCount: number}>> {
    const allUserMessages = Array.from(this.messages.values())
      .filter(message => message.senderId === userId || message.receiverId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Get unique users who have chatted with this user
    const chatUserIds = new Set<number>();
    allUserMessages.forEach(message => {
      const otherId = message.senderId === userId ? message.receiverId : message.senderId;
      chatUserIds.add(otherId);
    });
    
    // For each chatted user, get the most recent message and unread count
    const recentChats = await Promise.all(
      Array.from(chatUserIds).map(async (chatUserId) => {
        const user = await this.getUser(chatUserId);
        if (!user) throw new Error(`User not found: ${chatUserId}`);
        
        const messagesBetween = await this.getMessagesBetweenUsers(userId, chatUserId);
        const lastMessage = messagesBetween[messagesBetween.length - 1];
        
        const unreadCount = messagesBetween.filter(
          msg => msg.receiverId === userId && !msg.read
        ).length;
        
        return { user, lastMessage, unreadCount };
      })
    );
    
    // Sort by most recent message
    return recentChats.sort((a, b) => 
      b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
    );
  }
}

// Check if we have a database connection available
// If not, fallback to in-memory storage for development/testing purposes
import { db } from './db';

let storage: IStorage;

if (db) {
  console.log("Using database storage");
  storage = new DatabaseStorage();
} else {
  console.log("Database not available, using in-memory storage");
  storage = new MemStorage();
}

export { storage };
