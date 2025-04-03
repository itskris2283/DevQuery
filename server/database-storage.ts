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
import { db } from "./db";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { 
  eq, and, or, desc, asc, sql, like, 
  isNull, isNotNull, gt, lt 
} from "drizzle-orm";
import { IStorage } from "./storage";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.SessionStore;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        createdAt: new Date()
      })
      .returning();
    return user;
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return await db
      .select()
      .from(users)
      .where(sql`${users.id} IN ${ids}`);
  }

  async searchUsers(query: string): Promise<User[]> {
    const searchQuery = `%${query}%`;
    return await db
      .select()
      .from(users)
      .where(
        or(
          like(users.username, searchQuery),
          like(users.email, searchQuery)
        )
      );
  }

  // Question operations
  async getQuestion(id: number): Promise<Question | undefined> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    return question;
  }

  async getQuestionWithDetails(id: number): Promise<QuestionWithUser | undefined> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    
    if (!question) return undefined;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, question.userId));
    
    if (!user) return undefined;
    
    const tags = await this.getTagsForQuestion(question.id);
    const votesCount = await this.getVotesCount(question.id);
    const answersResult = await db
      .select()
      .from(answers)
      .where(eq(answers.questionId, question.id));
    
    return {
      ...question,
      user,
      tags,
      votesCount,
      answersCount: answersResult.length
    };
  }

  async getQuestions(options: { limit: number; offset: number; sortBy: string; filter?: string; }): Promise<QuestionWithUser[]> {
    const { limit, offset, sortBy, filter } = options;
    
    // Create a base query
    let query = db.select().from(questions);
    
    // Apply filters
    if (filter === 'unanswered') {
      const subquery = db
        .select({ questionId: answers.questionId })
        .from(answers)
        .groupBy(answers.questionId);
        
      query = query.where(
        sql`${questions.id} NOT IN (SELECT "questionId" FROM (${subquery.toSQL().sql}))`,
      );
    } else if (filter === 'solved') {
      query = query.where(eq(questions.solved, true));
    }
    
    // Apply sorting
    if (sortBy === 'newest') {
      query = query.orderBy(desc(questions.createdAt));
    } else if (sortBy === 'votes') {
      // This requires a more complex query with a join and aggregation
      const questionsWithVotes = db
        .select({
          questionId: votes.questionId,
          voteSum: sql<number>`SUM(${votes.value})`.as('voteSum')
        })
        .from(votes)
        .where(isNotNull(votes.questionId))
        .groupBy(votes.questionId);
      
      // Use a left join to get questions with their vote counts
      query = db
        .select({
          question: questions,
          voteSum: sql<number>`COALESCE(v."voteSum", 0)`.as('voteSum')
        })
        .from(questions)
        .leftJoin(
          questionsWithVotes.as('v'),
          eq(questions.id, sql`v."questionId"`)
        )
        .orderBy(desc(sql`"voteSum"`), desc(questions.createdAt));
    } else if (sortBy === 'active') {
      // Find the latest answer for each question
      const latestAnswers = db
        .select({
          questionId: answers.questionId,
          latestAnswer: sql<Date>`MAX(${answers.createdAt})`.as('latestAnswer')
        })
        .from(answers)
        .groupBy(answers.questionId);
      
      // Use a left join to order by the latest answer time or question time if no answers
      query = db
        .select({
          question: questions,
          latestActivity: sql<Date>`COALESCE(a."latestAnswer", ${questions.createdAt})`.as('latestActivity')
        })
        .from(questions)
        .leftJoin(
          latestAnswers.as('a'),
          eq(questions.id, sql`a."questionId"`)
        )
        .orderBy(desc(sql`"latestActivity"`));
    }
    
    // Apply pagination
    query = query.limit(limit).offset(offset);
    
    // Execute the query
    const results = await query;
    
    // For the 'votes' and 'active' sorts, we need to extract the question from the result
    const questionsList = sortBy === 'votes' || sortBy === 'active'
      ? results.map((r: any) => r.question)
      : results;
    
    // Fetch additional data for each question
    return await Promise.all(
      questionsList.map(async (question) => {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, question.userId));
        
        if (!user) throw new Error(`User not found for question: ${question.id}`);
        
        const tags = await this.getTagsForQuestion(question.id);
        const votesCount = await this.getVotesCount(question.id);
        const answersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(answers)
          .where(eq(answers.questionId, question.id))
          .then(res => Number(res[0].count));
        
        return {
          ...question,
          user,
          tags,
          votesCount,
          answersCount
        };
      })
    );
  }

  async getQuestionsByUserId(userId: number): Promise<QuestionWithUser[]> {
    const userQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.userId, userId));
    
    return await Promise.all(
      userQuestions.map(async (question) => {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, question.userId));
        
        if (!user) throw new Error(`User not found for question: ${question.id}`);
        
        const tags = await this.getTagsForQuestion(question.id);
        const votesCount = await this.getVotesCount(question.id);
        const answersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(answers)
          .where(eq(answers.questionId, question.id))
          .then(res => Number(res[0].count));
        
        return {
          ...question,
          user,
          tags,
          votesCount,
          answersCount
        };
      })
    );
  }

  async createQuestion(userId: number, question: InsertQuestion, tagNames: string[]): Promise<Question> {
    const now = new Date();
    
    // Create the question
    const [newQuestion] = await db
      .insert(questions)
      .values({
        ...question,
        userId,
        solved: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    
    // Add tags
    for (const tagName of tagNames) {
      let tag = await this.getTagByName(tagName);
      
      if (!tag) {
        tag = await this.createTag({ name: tagName });
      }
      
      await this.addTagToQuestion(newQuestion.id, tag.id);
    }
    
    return newQuestion;
  }

  async updateQuestion(id: number, questionData: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    
    if (!question) return undefined;
    
    const [updatedQuestion] = await db
      .update(questions)
      .set({
        ...questionData,
        updatedAt: new Date()
      })
      .where(eq(questions.id, id))
      .returning();
    
    return updatedQuestion;
  }

  async markQuestionAsSolved(id: number, answerId: number): Promise<boolean> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    
    const [answer] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, answerId));
    
    if (!question || !answer || answer.questionId !== id) {
      return false;
    }
    
    // Update the question
    await db
      .update(questions)
      .set({
        solved: true,
        updatedAt: new Date()
      })
      .where(eq(questions.id, id));
    
    // Update the answer
    await db
      .update(answers)
      .set({
        accepted: true,
        updatedAt: new Date()
      })
      .where(eq(answers.id, answerId));
    
    return true;
  }

  async incrementQuestionViews(id: number): Promise<boolean> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    
    if (!question) return false;
    
    // Increment the views count
    await db
      .update(questions)
      .set({ 
        views: (question.views || 0) + 1, 
        updatedAt: new Date() 
      })
      .where(eq(questions.id, id));
    
    return true;
  }

  // Tag operations
  async getTag(id: number): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id));
    return tag;
  }

  async getTagByName(name: string): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(sql`LOWER(${tags.name})`, name.toLowerCase()));
    return tag;
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    const [newTag] = await db
      .insert(tags)
      .values(tag)
      .returning();
    return newTag;
  }

  async getAllTags(): Promise<Tag[]> {
    return await db.select().from(tags);
  }

  async getTagsForQuestion(questionId: number): Promise<Tag[]> {
    return await db
      .select({ tag: tags })
      .from(questionTags)
      .innerJoin(tags, eq(questionTags.tagId, tags.id))
      .where(eq(questionTags.questionId, questionId))
      .then(results => results.map(r => r.tag));
  }

  private async addTagToQuestion(questionId: number, tagId: number): Promise<QuestionTag> {
    const [questionTag] = await db
      .insert(questionTags)
      .values({ questionId, tagId })
      .returning();
    return questionTag;
  }

  // Answer operations
  async getAnswer(id: number): Promise<Answer | undefined> {
    const [answer] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, id));
    return answer;
  }

  async getAnswerWithDetails(id: number): Promise<AnswerWithUser | undefined> {
    const [answer] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, id));
    
    if (!answer) return undefined;
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, answer.userId));
    
    if (!user) return undefined;
    
    const votesCount = await this.getVotesCount(undefined, answer.id);
    
    return {
      ...answer,
      user,
      votesCount
    };
  }

  async getAnswersByQuestionId(questionId: number): Promise<AnswerWithUser[]> {
    const questionAnswers = await db
      .select()
      .from(answers)
      .where(eq(answers.questionId, questionId));
    
    const answersWithDetails = await Promise.all(
      questionAnswers.map(async (answer) => {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, answer.userId));
        
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
    const userAnswers = await db
      .select()
      .from(answers)
      .where(eq(answers.userId, userId));
    
    return await Promise.all(
      userAnswers.map(async (answer) => {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, answer.userId));
        
        if (!user) throw new Error(`User not found for answer: ${answer.id}`);
        
        const votesCount = await this.getVotesCount(undefined, answer.id);
        
        return {
          ...answer,
          user,
          votesCount
        };
      })
    );
  }

  async createAnswer(userId: number, answer: InsertAnswer): Promise<Answer> {
    const now = new Date();
    
    const [newAnswer] = await db
      .insert(answers)
      .values({
        ...answer,
        userId,
        accepted: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    
    return newAnswer;
  }

  async updateAnswer(id: number, answerData: Partial<InsertAnswer>): Promise<Answer | undefined> {
    const [answer] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, id));
    
    if (!answer) return undefined;
    
    const [updatedAnswer] = await db
      .update(answers)
      .set({
        ...answerData,
        updatedAt: new Date()
      })
      .where(eq(answers.id, id))
      .returning();
    
    return updatedAnswer;
  }

  async acceptAnswer(id: number): Promise<boolean> {
    const [answer] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, id));
    
    if (!answer) return false;
    
    await db
      .update(answers)
      .set({
        accepted: true,
        updatedAt: new Date()
      })
      .where(eq(answers.id, id));
    
    await db
      .update(questions)
      .set({
        solved: true,
        updatedAt: new Date()
      })
      .where(eq(questions.id, answer.questionId));
    
    return true;
  }

  // Vote operations
  async getVotesByQuestionId(questionId: number): Promise<Vote[]> {
    return await db
      .select()
      .from(votes)
      .where(eq(votes.questionId, questionId));
  }

  async getVotesByAnswerId(answerId: number): Promise<Vote[]> {
    return await db
      .select()
      .from(votes)
      .where(eq(votes.answerId, answerId));
  }

  async getVoteByUserAndQuestion(userId: number, questionId: number): Promise<Vote | undefined> {
    const [vote] = await db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.userId, userId),
          eq(votes.questionId, questionId)
        )
      );
    return vote;
  }

  async getVoteByUserAndAnswer(userId: number, answerId: number): Promise<Vote | undefined> {
    const [vote] = await db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.userId, userId),
          eq(votes.answerId, answerId)
        )
      );
    return vote;
  }

  async createOrUpdateVote(vote: InsertVote): Promise<Vote> {
    // Check if vote already exists
    let existingVote: Vote | undefined;
    
    if (vote.questionId) {
      existingVote = await this.getVoteByUserAndQuestion(vote.userId, vote.questionId);
    } else if (vote.answerId) {
      existingVote = await this.getVoteByUserAndAnswer(vote.userId, vote.answerId!);
    }
    
    // Update existing vote or create new one
    if (existingVote) {
      const [updatedVote] = await db
        .update(votes)
        .set({
          value: vote.value
        })
        .where(eq(votes.id, existingVote.id))
        .returning();
      
      return updatedVote;
    } else {
      const [newVote] = await db
        .insert(votes)
        .values({
          ...vote,
          createdAt: new Date()
        })
        .returning();
      
      return newVote;
    }
  }

  async getVotesCount(questionId?: number, answerId?: number): Promise<number> {
    let query = db
      .select({
        sum: sql<number>`COALESCE(SUM(${votes.value}), 0)`.as('sum')
      })
      .from(votes);
    
    if (questionId) {
      query = query.where(eq(votes.questionId, questionId));
    } else if (answerId) {
      query = query.where(eq(votes.answerId, answerId));
    }
    
    const result = await query;
    return Number(result[0].sum);
  }

  // Follow operations
  async getFollowsByFollowerId(followerId: number): Promise<Follow[]> {
    return await db
      .select()
      .from(follows)
      .where(eq(follows.followerId, followerId));
  }

  async getFollowsByFollowingId(followingId: number): Promise<Follow[]> {
    return await db
      .select()
      .from(follows)
      .where(eq(follows.followingId, followingId));
  }

  async getFollowByUserIds(followerId: number, followingId: number): Promise<Follow | undefined> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );
    return follow;
  }

  async createFollow(follow: InsertFollow): Promise<Follow> {
    const [newFollow] = await db
      .insert(follows)
      .values({
        ...follow,
        createdAt: new Date()
      })
      .returning();
    
    return newFollow;
  }

  async deleteFollow(followerId: number, followingId: number): Promise<boolean> {
    const result = await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );
    
    return !!result;
  }

  async getFollowerCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    
    return Number(result[0].count);
  }

  async getFollowingCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    
    return Number(result[0].count);
  }

  // Message operations
  async getMessage(id: number): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id));
    return message;
  }

  async getMessagesByUserId(userId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        or(
          eq(messages.senderId, userId),
          eq(messages.receiverId, userId)
        )
      )
      .orderBy(asc(messages.createdAt));
  }

  async getMessagesBetweenUsers(user1Id: number, user2Id: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, user1Id),
            eq(messages.receiverId, user2Id)
          ),
          and(
            eq(messages.senderId, user2Id),
            eq(messages.receiverId, user1Id)
          )
        )
      )
      .orderBy(asc(messages.createdAt));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...message,
        read: false,
        createdAt: new Date()
      })
      .returning();
    
    return newMessage;
  }

  async markMessageAsRead(id: number): Promise<boolean> {
    const result = await db
      .update(messages)
      .set({ read: true })
      .where(eq(messages.id, id));
    
    return !!result;
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.receiverId, userId),
          eq(messages.read, false)
        )
      );
    
    return Number(result[0].count);
  }

  async getRecentChats(userId: number): Promise<Array<{user: User, lastMessage: Message, unreadCount: number}>> {
    // Get all users this user has chatted with
    const sentMessages = db
      .select({
        otherUserId: messages.receiverId,
        lastMessage: sql<Date>`MAX(${messages.createdAt})`.as('lastMessage')
      })
      .from(messages)
      .where(eq(messages.senderId, userId))
      .groupBy(messages.receiverId);
    
    const receivedMessages = db
      .select({
        otherUserId: messages.senderId,
        lastMessage: sql<Date>`MAX(${messages.createdAt})`.as('lastMessage')
      })
      .from(messages)
      .where(eq(messages.receiverId, userId))
      .groupBy(messages.senderId);
    
    // Get all unique user IDs that the current user has messaged or received messages from
    const sentUserIds = await db
      .select({ otherUserId: messages.receiverId })
      .from(messages)
      .where(eq(messages.senderId, userId))
      .groupBy(messages.receiverId);
    
    const receivedUserIds = await db
      .select({ otherUserId: messages.senderId })
      .from(messages)
      .where(eq(messages.receiverId, userId))
      .groupBy(messages.senderId);
    
    // Combine the lists and remove duplicates
    const uniqueUserIds = new Set<number>();
    sentUserIds.forEach(row => uniqueUserIds.add(row.otherUserId));
    receivedUserIds.forEach(row => uniqueUserIds.add(row.otherUserId));
    const allUserIds = Array.from(uniqueUserIds);
    
    // Process the results
    const recentChats = await Promise.all(
      allUserIds.map(async (otherUserId) => {
        try {
          // Get the user
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, otherUserId));
          
          if (!user) {
            console.error(`User not found: ${otherUserId}`);
            return null;
          }
          
          // Get the last message
          const lastMessageResults = await db
            .select()
            .from(messages)
            .where(
              or(
                and(
                  eq(messages.senderId, userId),
                  eq(messages.receiverId, otherUserId)
                ),
                and(
                  eq(messages.senderId, otherUserId),
                  eq(messages.receiverId, userId)
                )
              )
            )
            .orderBy(desc(messages.createdAt))
            .limit(1);
            
          // If no messages exist between these users, skip
          if (!lastMessageResults || lastMessageResults.length === 0) {
            console.error(`No messages found between users ${userId} and ${otherUserId}`);
            return null;
          }
          
          const lastMessage = lastMessageResults[0];
          
          // Get the unread count
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(
              and(
                eq(messages.senderId, otherUserId),
                eq(messages.receiverId, userId),
                eq(messages.read, false)
              )
            );
          
          const unreadCount = Number(result[0].count);
          
          return { user, lastMessage, unreadCount };
        } catch (error) {
          console.error(`Error processing chat for user ${otherUserId}:`, error);
          return null;
        }
      })
    );
    
    // Filter out null entries and sort by most recent message
    const validChats = recentChats.filter(chat => chat !== null) as Array<{
      user: User;
      lastMessage: Message;
      unreadCount: number;
    }>;
    
    return validChats.sort((a, b) => {
      // Convert to Date objects to handle both Date instances and string dates
      const dateA = a.lastMessage.createdAt instanceof Date ? 
        a.lastMessage.createdAt : new Date(a.lastMessage.createdAt);
      const dateB = b.lastMessage.createdAt instanceof Date ? 
        b.lastMessage.createdAt : new Date(b.lastMessage.createdAt);
        
      return dateB.getTime() - dateA.getTime();
    });
  }
}