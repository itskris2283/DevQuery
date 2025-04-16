import UserModel from './models/user.model';
import QuestionModel from './models/question.model';
import TagModel from './models/tag.model';
import QuestionTagModel from './models/question-tag.model';
import AnswerModel from './models/answer.model';
import { User, Question, Tag, Answer } from '@shared/schema';

// In-memory mock storage for all entities
const mockUsers = new Map<number, any>();
const mockQuestions = new Map<number, any>();
const mockTags = new Map<number, any>();
const mockQuestionTags = new Map<string, any>(); // key is `${questionId}-${tagId}`
const mockAnswers = new Map<number, any>();

/**
 * Check if we're in mock mode
 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_DB === 'true';
}

// ------------------------
// USER OPERATIONS
// ------------------------

/**
 * Safely gets a user by ID, with special handling for mock DB mode
 */
export async function safeGetUserById(
  id: number, 
  documentToUser: (doc: any) => User
): Promise<User | undefined> {
  try {
    // Special case for mock DB mode to prevent buffering timeouts
    if (isMockMode()) {
      console.log(`Using mock user lookup by ID: ${id}`);
      
      // Check if we have this user in our mock storage
      if (mockUsers.has(id)) {
        const mockUser = mockUsers.get(id);
        return documentToUser(mockUser);
      }
      
      // For mock mode with no existing user, return undefined
      return undefined;
    }
    
    // Normal operation - look up the user in MongoDB
    const user = await UserModel.findOne({ id });
    return user ? documentToUser(user) : undefined;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return undefined;
  }
}

/**
 * Safely gets a user by username, with special handling for mock DB mode
 */
export async function safeGetUserByUsername(
  username: string, 
  documentToUser: (doc: any) => User
): Promise<User | undefined> {
  try {
    // Special case for mock DB mode to prevent buffering timeouts
    if (isMockMode()) {
      console.log('Using mock user lookup by username');
      
      // For mock mode, check our in-memory storage - convert to array first for iteration
      const userArray = Array.from(mockUsers.values());
      for (const user of userArray) {
        if (user.username === username) {
          return documentToUser(user);
        }
      }
      
      // User not found
      return undefined;
    }
    
    // Normal operation - look up the user in MongoDB
    const user = await UserModel.findOne({ username });
    return user ? documentToUser(user) : undefined;
  } catch (error) {
    console.error('Error getting user by username:', error);
    return undefined;
  }
}

/**
 * Safely creates a user with special handling for mock DB mode
 */
export async function safeCreateUser(
  insertUser: any,
  documentToUser: (doc: any) => User
): Promise<User> {
  try {
    // Make sure we have the fullName field
    if (!insertUser.fullName) {
      throw new Error('Full name is required');
    }

    // Special handling for mock DB mode to prevent MongoDB operations
    if (isMockMode()) {
      console.log('Creating user in mock DB mode');
      
      // Generate ID
      const mockId = Math.floor(Math.random() * 100000) + 1;
      
      // Create a mock user
      const mockUser = {
        id: mockId,
        username: insertUser.username,
        email: insertUser.email,
        password: insertUser.password,
        fullName: insertUser.fullName,
        bio: insertUser.bio || null,
        avatarUrl: insertUser.avatarUrl || null,
        role: insertUser.role || 'student',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store in our mock database
      mockUsers.set(mockId, mockUser);
      
      // Convert to a user model format
      const user = new UserModel(mockUser);
      return documentToUser(user);
    }
    
    // Create a new user instance without saving yet
    const user = new UserModel({
      ...insertUser,
      // Ensure these fields exist (set defaults)
      bio: insertUser.bio || null,
      avatarUrl: insertUser.avatarUrl || null,
      role: insertUser.role || 'student'
    });
    
    // Save the user - let the model's pre-save hook handle the ID auto-increment
    await user.save();
    
    // Verify the user was saved properly
    if (!user.id) {
      throw new Error('Failed to generate user ID');
    }
    
    return documentToUser(user);
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// ------------------------
// QUESTION OPERATIONS
// ------------------------

/**
 * Safely creates a question with special handling for mock DB mode
 */
export async function safeCreateQuestion(
  userId: number,
  questionData: any, 
  tagNames: string[],
  documentToQuestion: (doc: any) => Question,
  documentToTag: (doc: any) => Tag
): Promise<Question> {
  try {
    // Special handling for mock DB mode to prevent MongoDB operations
    if (isMockMode()) {
      console.log('Creating question in mock DB mode');
      
      // Content is required
      if (!questionData.content) {
        throw new Error('Question content is required');
      }
      
      // Generate ID
      const mockId = Math.floor(Math.random() * 100000) + 1;
      
      // Create a mock question
      const mockQuestion = {
        id: mockId,
        userId: userId,
        title: questionData.title || 'Untitled Question',
        content: questionData.content,
        imageUrl: questionData.imageUrl || null,
        solved: false,
        views: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store in our mock database
      mockQuestions.set(mockId, mockQuestion);
      
      // Process tags
      const createdTags: Tag[] = [];
      if (tagNames && tagNames.length > 0) {
        for (const tagName of tagNames) {
          // Find or create tag
          let tag = mockCreateOrFindTag(tagName, documentToTag);
          createdTags.push(tag);
          
          // Create question-tag relationship with an ID to prevent validation errors
          const relationKey = `${mockId}-${tag.id}`;
          const relationId = Math.floor(Math.random() * 100000) + 1;
          mockQuestionTags.set(relationKey, {
            id: relationId,
            questionId: mockId,
            tagId: tag.id
          });
        }
      }
      
      // Convert to a question model format
      const question = new QuestionModel(mockQuestion);
      return documentToQuestion(question);
    }
    
    // Create a new question instance
    const newQuestion = new QuestionModel({
      ...questionData,
      userId,
      views: 0,
      solved: false
    });
    
    // Save the question - let the model's pre-save hook handle the ID auto-increment
    await newQuestion.save();

    // Process tags
    if (tagNames && tagNames.length > 0) {
      for (const tagName of tagNames) {
        // Find or create tag
        let tag = await TagModel.findOne({ name: tagName });
        if (!tag) {
          tag = new TagModel({ name: tagName });
          await tag.save();
        }

        // Create question-tag relationship
        const questionTag = new QuestionTagModel({ 
          questionId: newQuestion.id, 
          tagId: tag.id 
        });
        await questionTag.save();
      }
    }

    return documentToQuestion(newQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    throw error;
  }
}

/**
 * Helper to create or find a tag in mock mode
 */
function mockCreateOrFindTag(
  tagName: string,
  documentToTag: (doc: any) => Tag
): Tag {
  // Check if tag already exists by name
  const tagsArray = Array.from(mockTags.values());
  for (const existingTag of tagsArray) {
    if (existingTag.name === tagName) {
      return documentToTag(existingTag);
    }
  }
  
  // Create new tag
  const mockId = Math.floor(Math.random() * 100000) + 1;
  const mockTag = {
    id: mockId,
    name: tagName
  };
  
  // Save to mock storage
  mockTags.set(mockId, mockTag);
  
  // Return as Tag
  return documentToTag(new TagModel(mockTag));
}

/**
 * Safely gets questions with special handling for mock DB mode
 */
export async function safeGetQuestions(
  options: { limit: number; offset: number; sortBy: string; filter?: string; },
  documentToQuestion: (doc: any) => Question,
  documentToUser: (doc: any) => User,
  documentToTag: (doc: any) => Tag
): Promise<any[]> {
  try {
    // Special handling for mock DB mode
    if (isMockMode()) {
      console.log('Getting questions in mock DB mode');
      
      // Convert our maps to arrays
      const questionsArray = Array.from(mockQuestions.values());
      
      // Apply filter
      let filteredQuestions = [...questionsArray];
      if (options.filter === 'solved') {
        filteredQuestions = filteredQuestions.filter(q => q.solved);
      } else if (options.filter === 'unsolved') {
        filteredQuestions = filteredQuestions.filter(q => !q.solved);
      }
      
      // Apply sort
      if (options.sortBy === 'newest') {
        filteredQuestions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (options.sortBy === 'oldest') {
        filteredQuestions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      } else if (options.sortBy === 'mostViews') {
        filteredQuestions.sort((a, b) => b.views - a.views);
      }
      
      // Apply pagination
      const paginatedQuestions = filteredQuestions
        .slice(options.offset, options.offset + options.limit);
      
      // Add user and tag data
      return paginatedQuestions.map(question => {
        // Find user who created the question
        const user = mockUsers.get(question.userId) || {
          id: question.userId,
          username: `user_${question.userId}`,
          email: `user_${question.userId}@example.com`,
          password: 'password',
          fullName: `User ${question.userId}`,
          bio: null,
          avatarUrl: null,
          role: 'student',
          createdAt: new Date()
        };
        
        // Get tags for this question
        const tags: Tag[] = [];
        mockQuestionTags.forEach((relation, key) => {
          if (relation.questionId === question.id) {
            const tag = mockTags.get(relation.tagId);
            if (tag) {
              tags.push(documentToTag(new TagModel(tag)));
            }
          }
        });
        
        // Get answer count
        let answersCount = 0;
        mockAnswers.forEach(answer => {
          if (answer.questionId === question.id) {
            answersCount++;
          }
        });
        
        // Return formatted question with details
        return {
          ...documentToQuestion(new QuestionModel(question)),
          user: documentToUser(new UserModel(user)),
          tags,
          votesCount: 0, // Mock vote count
          answersCount,
          views: question.views
        };
      });
    }
    
    // Normal MongoDB operation for non-mock mode
    // This will be implemented in the database.ts file
    return [];
  } catch (error) {
    console.error('Error getting questions:', error);
    return [];
  }
}

// ------------------------
// MESSAGE OPERATIONS
// ------------------------

/**
 * Safely gets recent chat information in mock mode
 */
export async function safeGetRecentChats(
  userId: number,
  documentToUser: (doc: any) => User
): Promise<Array<{user: User, lastMessage: any, unreadCount: number}>> {
  // In mock mode, return an empty array
  if (isMockMode()) {
    console.log('Getting recent chats in mock mode - returning empty array');
    return [];
  }
  
  // For non-mock mode, let the database handle it
  return [];
}

/**
 * Safely gets a question with details in mock mode
 */
export async function safeGetQuestionWithDetails(
  id: number,
  documentToQuestion: (doc: any) => Question,
  documentToUser: (doc: any) => User,
  documentToTag: (doc: any) => Tag
): Promise<any | undefined> {
  try {
    // Special handling for mock DB mode
    if (isMockMode()) {
      console.log(`Getting question details in mock mode for ID: ${id}`);
      
      // Check if question exists in mock storage
      if (!mockQuestions.has(id)) {
        return undefined;
      }
      
      const question = mockQuestions.get(id);
      
      // Get user who created the question
      const userId = question.userId;
      const user = mockUsers.get(userId) || {
        id: userId,
        username: `user_${userId}`,
        email: `user_${userId}@example.com`,
        password: 'password-hash',
        fullName: `User ${userId}`,
        bio: null,
        avatarUrl: null,
        role: 'student',
        createdAt: new Date()
      };
      
      // Get tags for this question
      const tags: Tag[] = [];
      mockQuestionTags.forEach((relation, key) => {
        if (relation.questionId === id) {
          const tag = mockTags.get(relation.tagId);
          if (tag) {
            tags.push(documentToTag(new TagModel(tag)));
          }
        }
      });
      
      // Get answer count
      let answersCount = 0;
      mockAnswers.forEach(answer => {
        if (answer.questionId === id) {
          answersCount++;
        }
      });
      
      // Increment views for the question
      mockQuestions.get(id).views = (mockQuestions.get(id).views || 0) + 1;
      
      // Return formatted question with details
      return {
        ...documentToQuestion(new QuestionModel(question)),
        user: documentToUser(new UserModel(user)),
        tags,
        votesCount: 0, // Mock vote count
        answersCount,
        views: question.views
      };
    }
    
    // Normal MongoDB operation will be handled by database.ts
    return undefined;
  } catch (error) {
    console.error('Error getting question details:', error);
    return undefined;
  }
}

/**
 * Safely increases the view count for a question in mock mode
 */
export async function safeIncrementQuestionViews(
  id: number
): Promise<boolean> {
  // In mock mode, increment view count in our mock storage
  if (isMockMode()) {
    console.log(`Incrementing views for question ${id} in mock mode`);
    
    if (mockQuestions.has(id)) {
      const question = mockQuestions.get(id);
      question.views = (question.views || 0) + 1;
      return true;
    }
    
    return false;
  }
  
  // For non-mock mode, let the database handle it
  return false;
}

/**
 * Safely gets answers for a question ID in mock mode
 */
export async function safeGetAnswersByQuestionId(
  questionId: number,
  documentToAnswer: (doc: any) => Answer,
  documentToUser: (doc: any) => User
): Promise<any[]> {
  try {
    // In mock mode, return answers from our mock storage
    if (isMockMode()) {
      console.log(`Getting answers for question ${questionId} in mock mode`);
      
      // Find all answers for this question
      const answers: any[] = [];
      mockAnswers.forEach((answer, id) => {
        if (answer.questionId === questionId) {
          answers.push(answer);
        }
      });
      
      // Sort by accepted first, then by votes (mock)
      answers.sort((a, b) => {
        if (a.accepted && !b.accepted) return -1;
        if (!a.accepted && b.accepted) return 1;
        return 0; // All votes are 0 in mock mode
      });
      
      // Convert to answer with user format
      return answers.map(answer => {
        // Get the user who created the answer
        const userId = answer.userId;
        const user = mockUsers.get(userId) || {
          id: userId,
          username: `user_${userId}`,
          email: `user_${userId}@example.com`,
          password: 'password-hash',
          fullName: `User ${userId}`,
          bio: null,
          avatarUrl: null,
          role: 'student',
          createdAt: new Date()
        };
        
        return {
          ...documentToAnswer(new AnswerModel(answer)),
          user: documentToUser(new UserModel(user)),
          votesCount: 0 // Mock vote count
        };
      });
    }
    
    // For non-mock mode, let the database handle it
    return [];
  } catch (error) {
    console.error('Error getting answers for question:', error);
    return [];
  }
}

/**
 * Safely creates an answer with special handling for mock DB mode
 */
export async function safeCreateAnswer(
  userId: number,
  answerData: any,
  documentToAnswer: (doc: any) => Answer
): Promise<Answer> {
  try {
    // Special handling for mock DB mode to prevent MongoDB operations
    if (isMockMode()) {
      console.log('Creating answer in mock DB mode');
      
      // Content is required
      if (!answerData.content) {
        throw new Error('Answer content is required');
      }
      
      const questionId = answerData.questionId;
      
      // Check if question exists
      if (!mockQuestions.has(questionId)) {
        throw new Error(`Question with ID ${questionId} not found`);
      }
      
      // Generate ID
      const mockId = Math.floor(Math.random() * 100000) + 1;
      
      // Create a mock answer
      const mockAnswer = {
        id: mockId,
        userId: userId,
        questionId: questionId,
        content: answerData.content,
        imageUrl: answerData.imageUrl || null,
        accepted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store in our mock database
      mockAnswers.set(mockId, mockAnswer);
      
      // Convert to an answer model format
      const answer = new AnswerModel(mockAnswer);
      return documentToAnswer(answer);
    }
    
    // Create a new answer instance
    const newAnswer = new AnswerModel({
      ...answerData,
      userId,
      accepted: false
    });
    
    // Save the answer - let the model's pre-save hook handle the ID auto-increment
    await newAnswer.save();

    return documentToAnswer(newAnswer);
  } catch (error) {
    console.error('Error creating answer:', error);
    throw error;
  }
}

/**
 * Safely gets all tags with special handling for mock DB mode
 */
export async function safeGetAllTags(
  documentToTag: (doc: any) => Tag
): Promise<Tag[]> {
  try {
    // Special handling for mock DB mode
    if (isMockMode()) {
      console.log('Getting all tags in mock mode');
      
      // Convert our map to an array
      const tagsArray = Array.from(mockTags.values());
      
      // Convert to tag format
      return tagsArray.map(tag => documentToTag(new TagModel(tag)));
    }
    
    // For non-mock mode, let the database handle it
    return [];
  } catch (error) {
    console.error('Error getting all tags in mock mode:', error);
    return [];
  }
} 