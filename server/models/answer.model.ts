import { Schema, model, Document, Model } from 'mongoose';
import { EventEmitter } from 'events';

// Answer interface
export interface IAnswer extends Document {
  id: number;
  userId: number;
  questionId: number;
  content: string;
  imageUrl: string | null;
  accepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for MongoDB
const answerSchema = new Schema<IAnswer>({
  id: { type: Number, required: false }, // Not required initially, will be set in pre-save hook
  userId: { type: Number, required: true, ref: 'User' },
  questionId: { type: Number, required: true, ref: 'Question' },
  content: { type: String, required: true },
  imageUrl: { type: String, default: null },
  accepted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for faster queries
answerSchema.index({ id: 1 }, { unique: true });
answerSchema.index({ userId: 1 });
answerSchema.index({ questionId: 1 });
answerSchema.index({ content: 'text' });

// Counter for auto-increment ID
let answerCounter = 1;

// Auto-increment ID handling
answerSchema.pre('save', async function(next) {
  // Always update the 'updatedAt' field on save
  this.updatedAt = new Date();
  
  // Only assign ID if not already set
  if (!this.id) {
    try {
      // In mock mode, don't try to query the database
      if (process.env.USE_MOCK_DB === 'true') {
        // Just generate a random ID for mock mode
        this.id = Math.floor(Math.random() * 100000) + 1;
        return next();
      }
      
      // Get the maximum ID or start from 1
      const maxAnswer = await AnswerModel.findOne({}, {}, { sort: { id: -1 } });
      this.id = maxAnswer ? maxAnswer.id + 1 : answerCounter++;
    } catch (error) {
      console.error('Error generating answer ID:', error);
      // In case of error, assign a random ID to avoid validation failures
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  
  next();
});

// Mock storage for when MongoDB is not available
const mockAnswerStorage = new Map<number, {
  id: number;
  userId: number;
  questionId: number;
  content: string;
  imageUrl: string | null;
  accepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}>();

// Mock counter for IDs
let mockAnswerCounter = 1;

// Mock implementation for when MongoDB is not available
class MockAnswerModel {
  static async findOne(query: any, projection?: any, options?: any): Promise<any> {
    if (query.id !== undefined) {
      return mockAnswerStorage.get(query.id) || null;
    }
    
    // Special case for max ID query
    if (options?.sort?.id === -1) {
      if (mockAnswerStorage.size === 0) return null;
      
      let maxId = 0;
      mockAnswerStorage.forEach((a) => {
        if (a.id > maxId) maxId = a.id;
      });
      
      return mockAnswerStorage.get(maxId) || null;
    }
    
    // No support for other query types in mock mode
    return null;
  }
  
  static async find(query: any): Promise<any[]> {
    const results: any[] = [];
    
    if (query.userId !== undefined) {
      mockAnswerStorage.forEach((a) => {
        if (a.userId === query.userId) results.push(a);
      });
      return results;
    }
    
    if (query.questionId !== undefined) {
      mockAnswerStorage.forEach((a) => {
        if (a.questionId === query.questionId) results.push(a);
      });
      return results;
    }
    
    // Return all answers for simple queries
    return Array.from(mockAnswerStorage.values());
  }
  
  static async updateMany(query: any, update: any): Promise<any> {
    // Simple mock implementation
    let count = 0;
    
    mockAnswerStorage.forEach((a, id) => {
      let match = false;
      
      // Check if this document matches the query
      if (query.imageUrl && a.imageUrl === query.imageUrl) {
        match = true;
      }
      
      if (match) {
        // Apply the update
        if (update.$set) {
          Object.entries(update.$set).forEach(([key, value]) => {
            (a as any)[key] = value;
          });
        }
        
        mockAnswerStorage.set(id, a);
        count++;
      }
    });
    
    return { matchedCount: count, modifiedCount: count };
  }
  
  id: number;
  userId: number;
  questionId: number;
  content: string;
  imageUrl: string | null;
  accepted: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  constructor(data: any) {
    // Required validations
    if (!data.userId) throw new Error('Answer validation failed: userId: Path `userId` is required.');
    if (!data.questionId) throw new Error('Answer validation failed: questionId: Path `questionId` is required.');
    if (!data.content) throw new Error('Answer validation failed: content: Path `content` is required.');
    
    this.id = data.id;
    this.userId = data.userId;
    this.questionId = data.questionId;
    this.content = data.content;
    this.imageUrl = data.imageUrl || null;
    this.accepted = data.accepted || false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }
  
  async save(): Promise<any> {
    // Generate ID if not present
    if (!this.id) {
      this.id = mockAnswerCounter++;
    }
    
    // Store in mock storage
    mockAnswerStorage.set(this.id, this);
    
    return this;
  }
}

// Create the model
const AnswerModel: Model<IAnswer> = model<IAnswer>('Answer', answerSchema);

// Export the appropriate model based on mode
export default process.env.USE_MOCK_DB === 'true' ? (MockAnswerModel as any) : AnswerModel;

// Add events support
export const messageEvents = new EventEmitter();