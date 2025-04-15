import { IStorage } from './storage';
import session from 'express-session';
import mongoose from 'mongoose';
import { connectToDatabase } from './mongo-db';
import UserModel, { IUser } from './models/user.model';
import QuestionModel, { IQuestion } from './models/question.model';
import AnswerModel, { IAnswer } from './models/answer.model';
import TagModel, { ITag } from './models/tag.model';
import QuestionTagModel, { IQuestionTag } from './models/question-tag.model';
import VoteModel, { IVote } from './models/vote.model';
import FollowModel, { IFollow } from './models/follow.model';
import MessageModel, { IMessage, messageEvents } from './models/message.model';
import { 
  safeGetUserById, 
  safeGetUserByUsername, 
  safeCreateUser, 
  safeCreateQuestion, 
  safeGetQuestions, 
  safeCreateAnswer, 
  safeGetQuestionWithDetails, 
  safeIncrementQuestionViews, 
  safeGetAnswersByQuestionId, 
  safeGetAllTags,
  safeGetRecentChats,
  isMockMode
} from './safeMockMode';
import { 
  User, 
  Question, 
  Tag, 
  Answer, 
  Vote, 
  Follow, 
  Message,
  QuestionWithUser,
  AnswerWithUser,
  InsertUser,
  InsertQuestion,
  InsertTag,
  InsertAnswer,
  InsertVote,
  InsertFollow,
  InsertMessage
} from '@shared/schema';
import MongoStore from 'connect-mongo';
// Setup memory store for sessions when no database is available
import createMemoryStore from 'memorystore';
import express from 'express';

const MemoryStore = createMemoryStore(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    // Determine if we should use mock storage
    const useMockDB = process.env.USE_MOCK_DB === 'true';
    
    if (useMockDB) {
      // Use in-memory session store for mock mode
      console.log('Using in-memory session store for mock database mode');
      this.sessionStore = new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
    } else {
      // Create MongoDB-based session store
      this.sessionStore = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/devquery',
        collectionName: 'sessions',
        ttl: 60 * 60 * 24, // 1 day
        autoRemove: 'native',
        crypto: {
          secret: process.env.SESSION_SECRET || 'devquery-secret-key'
        }
      }) as session.Store;
    }

    // Initialize database connection
    this.initDatabase().catch(err => console.error('Failed to initialize MongoDB storage:', err));
  }

  // Connect to MongoDB
  private async initDatabase(): Promise<void> {
    try {
      await connectToDatabase();
      console.log('MongoDB database initialized successfully');
    } catch (error) {
      console.error('MongoDB initialization error:', error);
      throw error;
    }
  }

  // Helper method to convert MongoDB document to our schema type
  private documentToUser(doc: IUser): User {
    return {
      id: doc.id,
      username: doc.username,
      email: doc.email,
      password: doc.password,
      fullName: doc.fullName,
      bio: doc.bio,
      avatarUrl: doc.avatarUrl,
      role: doc.role,
      createdAt: doc.createdAt
    };
  }

  private documentToQuestion(doc: IQuestion): Question {
    return {
      id: doc.id,
      userId: doc.userId,
      title: doc.title,
      content: doc.content,
      imageUrl: doc.imageUrl,
      solved: doc.solved,
      views: doc.views,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  private documentToTag(doc: ITag): Tag {
    return {
      id: doc.id,
      name: doc.name
    };
  }

  private documentToAnswer(doc: IAnswer): Answer {
    return {
      id: doc.id,
      userId: doc.userId,
      questionId: doc.questionId,
      content: doc.content,
      imageUrl: doc.imageUrl,
      accepted: doc.accepted,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  private documentToVote(doc: IVote): Vote {
    return {
      id: doc.id,
      userId: doc.userId,
      questionId: doc.questionId,
      answerId: doc.answerId,
      value: doc.value,
      createdAt: doc.createdAt
    };
  }

  private documentToFollow(doc: IFollow): Follow {
    return {
      id: doc.id,
      followerId: doc.followerId,
      followingId: doc.followingId,
      createdAt: doc.createdAt
    };
  }

  private documentToMessage(doc: IMessage): Message {
    return {
      id: doc.id,
      senderId: doc.senderId,
      receiverId: doc.receiverId,
      content: doc.content,
      read: doc.read,
      createdAt: doc.createdAt
    };
  }

  // Implement the IStorage interface methods

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return safeGetUserById(id, this.documentToUser.bind(this));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return safeGetUserByUsername(username, this.documentToUser.bind(this));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return safeCreateUser(insertUser, this.documentToUser.bind(this));
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    try {
      const users = await UserModel.find({ id: { $in: ids } });
      return users.map(user => this.documentToUser(user));
    } catch (error) {
      console.error('Error getting users by ids:', error);
      return [];
    }
  }

  async searchUsers(query: string): Promise<User[]> {
    try {
      const regex = new RegExp(query, 'i');
      const users = await UserModel.find({
        $or: [
          { username: regex },
          { email: regex }
        ]
      });
      return users.map(user => this.documentToUser(user));
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }

  // Question operations
  async getQuestion(id: number): Promise<Question | undefined> {
    try {
      const question = await QuestionModel.findOne({ id });
      return question ? this.documentToQuestion(question) : undefined;
    } catch (error) {
      console.error('Error getting question:', error);
      return undefined;
    }
  }

  async getQuestionWithDetails(id: number): Promise<QuestionWithUser | undefined> {
    // Use the safe implementation when in mock mode
    if (isMockMode()) {
      return safeGetQuestionWithDetails(
        id,
        this.documentToQuestion.bind(this),
        this.documentToUser.bind(this),
        this.documentToTag.bind(this)
      );
    }

    try {
      const question = await QuestionModel.findOne({ id });
      if (!question) return undefined;

      // Get the user who created the question
      const user = await UserModel.findOne({ id: question.userId });
      if (!user) return undefined;

      // Get tags for the question
      const questionTags = await QuestionTagModel.find({ questionId: id });
      const tagIds = questionTags.map(qt => qt.tagId);
      const tags = await TagModel.find({ id: { $in: tagIds } });

      // Count votes and answers
      const votesCount = await this.getVotesCount(id);
      const answers = await AnswerModel.find({ questionId: id });
      const answersCount = answers.length;

      return {
        ...this.documentToQuestion(question),
        user: this.documentToUser(user),
        tags: tags.map(tag => this.documentToTag(tag)),
        votesCount,
        answersCount,
        views: question.views
      };
    } catch (error) {
      console.error('Error getting question with details:', error);
      return undefined;
    }
  }

  async getQuestions(options: { limit: number; offset: number; sortBy: string; filter?: string; }): Promise<QuestionWithUser[]> {
    // Use the safe mock implementation when in mock mode
    if (isMockMode()) {
      return safeGetQuestions(
        options, 
        this.documentToQuestion.bind(this),
        this.documentToUser.bind(this),
        this.documentToTag.bind(this)
      );
    }

    try {
      const { limit, offset, sortBy, filter } = options;
      
      // Build the query based on filter
      let query: any = {};
      if (filter === 'solved') {
        query.solved = true;
      } else if (filter === 'unsolved') {
        query.solved = false;
      }

      // Determine sort order
      let sort: any = {};
      if (sortBy === 'newest') {
        sort = { createdAt: -1 };
      } else if (sortBy === 'oldest') {
        sort = { createdAt: 1 };
      } else if (sortBy === 'mostViews') {
        sort = { views: -1 };
      }

      // Execute the query with pagination
      const questions = await QuestionModel.find(query)
        .sort(sort)
        .skip(offset)
        .limit(limit);

      // Get additional data for each question
      const questionsWithDetails = await Promise.all(questions.map(async (question: IQuestion) => {
        const user = await UserModel.findOne({ id: question.userId });
        if (!user) throw new Error(`User not found for question ${question.id}`);

        const questionTags = await QuestionTagModel.find({ questionId: question.id });
        const tagIds = questionTags.map(qt => qt.tagId);
        const tags = await TagModel.find({ id: { $in: tagIds } });

        const votesCount = await this.getVotesCount(question.id);
        const answersCount = await AnswerModel.countDocuments({ questionId: question.id });

        return {
          ...this.documentToQuestion(question),
          user: this.documentToUser(user),
          tags: tags.map(tag => this.documentToTag(tag)),
          votesCount,
          answersCount,
          views: question.views
        };
      }));

      return questionsWithDetails;
    } catch (error) {
      console.error('Error getting questions:', error);
      return [];
    }
  }

  async getQuestionsByUserId(userId: number): Promise<QuestionWithUser[]> {
    try {
      const questions = await QuestionModel.find({ userId });
      
      // Convert to QuestionWithUser format
      const userQuestions = await Promise.all(questions.map(async (question: IQuestion) => {
        const user = await this.getUser(question.userId);
        const tags = await this.getTagsForQuestion(question.id);
        
        return {
          ...this.documentToQuestion(question),
          user: user || { id: 0, username: 'Unknown', avatarUrl: null },
          tags
        };
      }));
      
      return userQuestions;
    } catch (error) {
      console.error('Error fetching questions by user ID:', error);
      return [];
    }
  }

  async createQuestion(userId: number, question: InsertQuestion, tagNames: string[]): Promise<Question> {
    // Use safe implementation for mock mode
    return safeCreateQuestion(
      userId,
      question as any,
      tagNames,
      this.documentToQuestion.bind(this),
      this.documentToTag.bind(this)
    );
  }

  async updateQuestion(id: number, questionData: Partial<InsertQuestion>): Promise<Question | undefined> {
    try {
      const question = await QuestionModel.findOne({ id });
      if (!question) return undefined;
      
      // Update fields
      if (questionData.title) question.title = questionData.title;
      if (questionData.content) question.content = questionData.content;
      if (questionData.imageUrl !== undefined) question.imageUrl = questionData.imageUrl;
      
      question.updatedAt = new Date();
      await question.save();
      
      return this.documentToQuestion(question);
    } catch (error) {
      console.error('Error updating question:', error);
      return undefined;
    }
  }

  async deleteQuestion(id: number): Promise<boolean> {
    try {
      if (isMockMode()) {
        // Handle mock mode - would typically use a safe function like other methods
        // For simplicity, we'll just return true in mock mode
        console.log(`Mock mode: Simulating deletion of question ${id}`);
        return true;
      }

      // Delete related data first to maintain referential integrity
      // 1. Delete all answers for this question
      await AnswerModel.deleteMany({ questionId: id });
      
      // 2. Delete all votes for this question
      await VoteModel.deleteMany({ questionId: id });
      
      // 3. Delete all question-tag relationships
      await QuestionTagModel.deleteMany({ questionId: id });
      
      // 4. Finally delete the question itself
      const result = await QuestionModel.deleteOne({ id });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting question:', error);
      return false;
    }
  }

  async markQuestionAsSolved(id: number, answerId: number): Promise<boolean> {
    try {
      // Mark the question as solved
      const question = await QuestionModel.findOne({ id });
      if (!question) return false;

      question.solved = true;
      await question.save();

      // Mark the answer as accepted
      const answer = await AnswerModel.findOne({ id: answerId });
      if (!answer) return false;

      answer.accepted = true;
      await answer.save();

      return true;
    } catch (error) {
      console.error('Error marking question as solved:', error);
      return false;
    }
  }

  async incrementQuestionViews(id: number): Promise<boolean> {
    // Use the safe implementation when in mock mode
    if (isMockMode()) {
      return safeIncrementQuestionViews(id);
    }

    try {
      const result = await QuestionModel.updateOne(
        { id },
        { $inc: { views: 1 } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error incrementing question views:', error);
      return false;
    }
  }

  // Tag operations
  async getTag(id: number): Promise<Tag | undefined> {
    try {
      const tag = await TagModel.findOne({ id });
      return tag ? this.documentToTag(tag) : undefined;
    } catch (error) {
      console.error('Error getting tag:', error);
      return undefined;
    }
  }

  async getTagByName(name: string): Promise<Tag | undefined> {
    try {
      const tag = await TagModel.findOne({ name });
      return tag ? this.documentToTag(tag) : undefined;
    } catch (error) {
      console.error('Error getting tag by name:', error);
      return undefined;
    }
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    try {
      const newTag = new TagModel(tag);
      await newTag.save();
      return this.documentToTag(newTag);
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  async getAllTags(): Promise<Tag[]> {
    // Use the safe implementation when in mock mode
    if (isMockMode()) {
      return safeGetAllTags(this.documentToTag.bind(this));
    }

    try {
      const tags = await TagModel.find();
      return tags.map(tag => this.documentToTag(tag));
    } catch (error) {
      console.error('Error getting all tags:', error);
      return [];
    }
  }

  async getTagsForQuestion(questionId: number): Promise<Tag[]> {
    try {
      const questionTags = await QuestionTagModel.find({ questionId });
      const tagIds = questionTags.map(qt => qt.tagId);
      const tags = await TagModel.find({ id: { $in: tagIds } });
      return tags.map(tag => this.documentToTag(tag));
    } catch (error) {
      console.error('Error getting tags for question:', error);
      return [];
    }
  }

  private async addTagToQuestion(questionId: number, tagId: number): Promise<IQuestionTag> {
    try {
      // Check if relationship already exists
      const existing = await QuestionTagModel.findOne({ questionId, tagId });
      if (existing) return existing;

      // Create new relationship
      const questionTag = new QuestionTagModel({ questionId, tagId });
      await questionTag.save();
      return questionTag;
    } catch (error) {
      console.error('Error adding tag to question:', error);
      throw error;
    }
  }

  // Answer operations
  async getAnswer(id: number): Promise<Answer | undefined> {
    try {
      const answer = await AnswerModel.findOne({ id });
      return answer ? this.documentToAnswer(answer) : undefined;
    } catch (error) {
      console.error('Error getting answer:', error);
      return undefined;
    }
  }

  async getAnswerWithDetails(id: number): Promise<AnswerWithUser | undefined> {
    try {
      const answer = await AnswerModel.findOne({ id });
      if (!answer) return undefined;

      const user = await UserModel.findOne({ id: answer.userId });
      if (!user) return undefined;

      const votesCount = await this.getVotesCount(undefined, id);

      return {
        ...this.documentToAnswer(answer),
        user: this.documentToUser(user),
        votesCount
      };
    } catch (error) {
      console.error('Error getting answer with details:', error);
      return undefined;
    }
  }

  async getAnswersByQuestionId(questionId: number): Promise<AnswerWithUser[]> {
    // Use the safe implementation when in mock mode
    if (isMockMode()) {
      return safeGetAnswersByQuestionId(
        questionId,
        this.documentToAnswer.bind(this),
        this.documentToUser.bind(this)
      );
    }

    try {
      const answers = await AnswerModel.find({ questionId });
      
      const answersWithUsers = await Promise.all(answers.map(async (answer: IAnswer) => {
        const user = await UserModel.findOne({ id: answer.userId });
        if (!user) throw new Error(`User not found for answer ${answer.id}`);

        const votesCount = await this.getVotesCount(undefined, answer.id);

        return {
          ...this.documentToAnswer(answer),
          user: this.documentToUser(user),
          votesCount
        };
      }));

      // Sort by accepted first, then by votes
      return answersWithUsers.sort((a, b) => {
        if (a.accepted && !b.accepted) return -1;
        if (!a.accepted && b.accepted) return 1;
        return b.votesCount - a.votesCount;
      });
    } catch (error) {
      console.error('Error getting answers by question ID:', error);
      return [];
    }
  }

  async getAnswersByUserId(userId: number): Promise<AnswerWithUser[]> {
    try {
      const answers = await AnswerModel.find({ userId });
      
      // Convert to AnswerWithUser format
      const userAnswers = await Promise.all(answers.map(async (answer: IAnswer) => {
        const user = await this.getUser(answer.userId);
        const question = await this.getQuestion(answer.questionId);
        
        return {
          ...this.documentToAnswer(answer),
          user: user || { id: 0, username: 'Unknown', avatarUrl: null },
          question: question ? {
            id: question.id,
            title: question.title
          } : { id: 0, title: 'Unknown Question' }
        };
      }));
      
      return userAnswers;
    } catch (error) {
      console.error('Error fetching answers by user ID:', error);
      return [];
    }
  }

  async createAnswer(userId: number, answer: InsertAnswer): Promise<Answer> {
    // Use safe implementation for mock mode
    return safeCreateAnswer(
      userId,
      answer as any,
      this.documentToAnswer.bind(this)
    );
  }

  async updateAnswer(id: number, answerData: Partial<InsertAnswer>): Promise<Answer | undefined> {
    try {
      const answer = await AnswerModel.findOne({ id });
      if (!answer) return undefined;

      // Update fields
      Object.assign(answer, answerData);
      answer.updatedAt = new Date();
      
      await answer.save();
      return this.documentToAnswer(answer);
    } catch (error) {
      console.error('Error updating answer:', error);
      return undefined;
    }
  }

  async deleteAnswer(id: number): Promise<boolean> {
    try {
      if (isMockMode()) {
        // Handle mock mode
        console.log(`Mock mode: Simulating deletion of answer ${id}`);
        return true;
      }

      // Delete related votes for this answer
      await VoteModel.deleteMany({ answerId: id });
      
      // Delete the answer itself
      const result = await AnswerModel.deleteOne({ id });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting answer:', error);
      return false;
    }
  }

  async acceptAnswer(id: number): Promise<boolean> {
    try {
      const answer = await AnswerModel.findOne({ id });
      if (!answer) return false;

      answer.accepted = true;
      await answer.save();

      // Also mark the question as solved
      const question = await QuestionModel.findOne({ id: answer.questionId });
      if (question) {
        question.solved = true;
        await question.save();
      }

      return true;
    } catch (error) {
      console.error('Error accepting answer:', error);
      return false;
    }
  }

  // Vote operations
  async getVotesByQuestionId(questionId: number): Promise<Vote[]> {
    try {
      const votes = await VoteModel.find({ questionId });
      return votes.map(vote => this.documentToVote(vote));
    } catch (error) {
      console.error('Error getting votes by question ID:', error);
      return [];
    }
  }

  async getVotesByAnswerId(answerId: number): Promise<Vote[]> {
    try {
      const votes = await VoteModel.find({ answerId });
      return votes.map(vote => this.documentToVote(vote));
    } catch (error) {
      console.error('Error getting votes by answer ID:', error);
      return [];
    }
  }

  async getVoteByUserAndQuestion(userId: number, questionId: number): Promise<Vote | undefined> {
    try {
      const vote = await VoteModel.findOne({ userId, questionId });
      return vote ? this.documentToVote(vote) : undefined;
    } catch (error) {
      console.error('Error getting vote by user and question:', error);
      return undefined;
    }
  }

  async getVoteByUserAndAnswer(userId: number, answerId: number): Promise<Vote | undefined> {
    try {
      const vote = await VoteModel.findOne({ userId, answerId });
      return vote ? this.documentToVote(vote) : undefined;
    } catch (error) {
      console.error('Error getting vote by user and answer:', error);
      return undefined;
    }
  }

  async createOrUpdateVote(voteData: InsertVote): Promise<Vote> {
    try {
      let vote;
      
      // Check if vote already exists
      if (voteData.questionId) {
        vote = await VoteModel.findOne({ 
          userId: voteData.userId, 
          questionId: voteData.questionId 
        });
      } else if (voteData.answerId) {
        vote = await VoteModel.findOne({ 
          userId: voteData.userId, 
          answerId: voteData.answerId 
        });
      }

      // Update existing vote or create new one
      if (vote) {
        vote.value = voteData.value;
        await vote.save();
      } else {
        vote = new VoteModel(voteData);
        await vote.save();
      }

      return this.documentToVote(vote);
    } catch (error) {
      console.error('Error creating or updating vote:', error);
      throw error;
    }
  }

  async getVotesCount(questionId?: number, answerId?: number): Promise<number> {
    try {
      let query = {};
      
      if (questionId) {
        query = { questionId };
      } else if (answerId) {
        query = { answerId };
      } else {
        return 0;
      }

      const votes = await VoteModel.find(query);
      return votes.reduce((total, vote) => total + vote.value, 0);
    } catch (error) {
      console.error('Error getting votes count:', error);
      return 0;
    }
  }

  // Follow operations
  async getFollowsByFollowerId(followerId: number): Promise<Follow[]> {
    try {
      const follows = await FollowModel.find({ followerId });
      return follows.map(follow => this.documentToFollow(follow));
    } catch (error) {
      console.error('Error getting follows by follower ID:', error);
      return [];
    }
  }

  async getFollowsByFollowingId(followingId: number): Promise<Follow[]> {
    try {
      const follows = await FollowModel.find({ followingId });
      return follows.map(follow => this.documentToFollow(follow));
    } catch (error) {
      console.error('Error getting follows by following ID:', error);
      return [];
    }
  }

  async getFollowByUserIds(followerId: number, followingId: number): Promise<Follow | undefined> {
    try {
      const follow = await FollowModel.findOne({ followerId, followingId });
      return follow ? this.documentToFollow(follow) : undefined;
    } catch (error) {
      console.error('Error getting follow by user IDs:', error);
      return undefined;
    }
  }

  async createFollow(follow: InsertFollow): Promise<Follow> {
    try {
      // Check if already following
      const existing = await FollowModel.findOne({ 
        followerId: follow.followerId, 
        followingId: follow.followingId 
      });
      
      if (existing) {
        return this.documentToFollow(existing);
      }

      const newFollow = new FollowModel(follow);
      await newFollow.save();
      return this.documentToFollow(newFollow);
    } catch (error) {
      console.error('Error creating follow:', error);
      throw error;
    }
  }

  async deleteFollow(followerId: number, followingId: number): Promise<boolean> {
    try {
      const result = await FollowModel.deleteOne({ followerId, followingId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting follow:', error);
      return false;
    }
  }

  async getFollowerCount(userId: number): Promise<number> {
    try {
      return await FollowModel.countDocuments({ followingId: userId });
    } catch (error) {
      console.error('Error getting follower count:', error);
      return 0;
    }
  }

  async getFollowingCount(userId: number): Promise<number> {
    try {
      return await FollowModel.countDocuments({ followerId: userId });
    } catch (error) {
      console.error('Error getting following count:', error);
      return 0;
    }
  }

  // Message operations
  async getMessage(id: number): Promise<Message | undefined> {
    try {
      const message = await MessageModel.findOne({ id });
      return message ? this.documentToMessage(message) : undefined;
    } catch (error) {
      console.error('Error getting message:', error);
      return undefined;
    }
  }

  async getMessagesByUserId(userId: number): Promise<Message[]> {
    try {
      const messages = await MessageModel.find({
        $or: [{ senderId: userId }, { receiverId: userId }]
      });
      return messages.map(message => this.documentToMessage(message));
    } catch (error) {
      console.error('Error getting messages by user ID:', error);
      return [];
    }
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    try {
      const messages = await MessageModel.find({
        $or: [
          { senderId: user1Id, receiverId: user2Id },
          { senderId: user2Id, receiverId: user1Id }
        ]
      }).sort({ createdAt: 1 });
      
      return messages.map(message => this.documentToMessage(message));
    } catch (error) {
      console.error('Error getting messages between users:', error);
      return [];
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      const newMessage = new MessageModel(message);
      await newMessage.save();
      return this.documentToMessage(newMessage);
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  async markMessageAsRead(id: number): Promise<boolean> {
    try {
      const message = await MessageModel.findOne({ id });
      if (!message) return false;

      message.read = true;
      await message.save();
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    try {
      return await MessageModel.countDocuments({ 
        receiverId: userId,
        read: false
      });
    } catch (error) {
      console.error('Error getting unread message count:', error);
      return 0;
    }
  }

  async getRecentChats(userId: number): Promise<Array<{user: User, lastMessage: Message, unreadCount: number}>> {
    // Use safe implementation for mock mode
    if (isMockMode()) {
      return safeGetRecentChats(userId, this.documentToUser.bind(this));
    }
    
    try {
      // In mock mode, avoid using MongoDB aggregation which requires an active connection
      if (process.env.USE_MOCK_DB === 'true') {
        console.log('Using mock implementation for getRecentChats');
        return safeGetRecentChats(userId, this.documentToUser.bind(this));
      }
      
      // Regular MongoDB implementation for non-mock mode
      // Find all users that have exchanged messages with this user
      const messagePartners = await MessageModel.aggregate([
        {
          $match: {
            $or: [{ senderId: userId }, { receiverId: userId }]
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ['$senderId', userId] },
                '$receiverId',
                '$senderId'
              ]
            },
            lastMessage: { $last: '$$ROOT' },
            messages: { $push: '$$ROOT' }
          }
        }
      ]);

      // Get detailed information for each chat
      const recentChats = await Promise.all(messagePartners.map(async (partner) => {
        const partnerId = partner._id;
        const partnerUser = await UserModel.findOne({ id: partnerId });
        
        if (!partnerUser) {
          throw new Error(`User not found for ID: ${partnerId}`);
        }

        // Count unread messages from this partner
        const unreadCount = await MessageModel.countDocuments({
          senderId: partnerId,
          receiverId: userId,
          read: false
        });

        // Convert the last message to our schema type
        const lastMessage = this.documentToMessage(partner.lastMessage);

        return {
          user: this.documentToUser(partnerUser),
          lastMessage,
          unreadCount
        };
      }));

      // Sort by last message time, newest first
      return recentChats.sort((a, b) => 
        b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
      );
    } catch (error) {
      console.error('Error getting recent chats:', error);
      // Return a safe empty array instead of failing
      return [];
    }
  }
}

// Export an initialized instance
export const storage = new DatabaseStorage();