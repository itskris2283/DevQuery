import { Schema, model, Document, Model } from 'mongoose';

// Question interface
export interface IQuestion extends Document {
  id: number;
  userId: number;
  title: string;
  content: string;
  imageUrl: string | null;
  solved: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for MongoDB
const questionSchema = new Schema<IQuestion>({
  id: { type: Number, required: false }, // Not required initially, will be set in pre-save hook
  userId: { type: Number, required: true, ref: 'User' },
  title: { type: String, required: true },
  content: { type: String, required: true },
  imageUrl: { type: String, default: null },
  solved: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for faster queries
questionSchema.index({ id: 1 }, { unique: true });
questionSchema.index({ userId: 1 });
questionSchema.index({ title: 'text', content: 'text' });

// Counter for auto-increment ID
let questionCounter = 1;

// Auto-increment ID handling
questionSchema.pre('save', async function(next) {
  // Only handle ID assignment if not already set
  if (!this.id) {
    try {
      // In mock mode, don't try to query the database
      if (process.env.USE_MOCK_DB === 'true') {
        // Just generate a random ID for mock mode
        this.id = Math.floor(Math.random() * 100000) + 1;
        return next();
      }
      
    // Get the maximum ID or start from 1
      const maxQuestion = await QuestionModel.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxQuestion ? maxQuestion.id + 1 : questionCounter++;
    } catch (error) {
      console.error('Error generating question ID:', error);
      // In case of error, assign a random ID to avoid validation failures
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  
  next();
});

// Mock storage for when MongoDB is not available
const mockQuestionStorage = new Map<number, {
  id: number;
  userId: number;
  title: string;
  content: string;
  imageUrl: string | null;
  solved: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}>();

// Mock counter for IDs
let mockQuestionCounter = 1;

// Mock implementation for when MongoDB is not available
class MockQuestionModel {
  static async findOne(query: any, projection?: any, options?: any): Promise<any> {
    if (query.id !== undefined) {
      return mockQuestionStorage.get(query.id) || null;
    }
    
    // Special case for max ID query
    if (options?.sort?.id === -1) {
      if (mockQuestionStorage.size === 0) return null;
      
      let maxId = 0;
      mockQuestionStorage.forEach((q) => {
        if (q.id > maxId) maxId = q.id;
      });
      
      return mockQuestionStorage.get(maxId) || null;
    }
    
    // No support for other query types in mock mode
    return null;
  }
  
  static async find(query: any): Promise<any[]> {
    if (query.userId !== undefined) {
      const results: any[] = [];
      mockQuestionStorage.forEach((q) => {
        if (q.userId === query.userId) results.push(q);
      });
      return results;
    }
    
    // Return all questions for simple queries
    return Array.from(mockQuestionStorage.values());
  }
  
  static async updateMany(query: any, update: any): Promise<any> {
    // Simple mock implementation
    let count = 0;
    
    mockQuestionStorage.forEach((q, id) => {
      let match = false;
      
      // Check if this document matches the query
      if (query.imageUrl && q.imageUrl === query.imageUrl) {
        match = true;
      }
      
      if (match) {
        // Apply the update
        if (update.$set) {
          Object.entries(update.$set).forEach(([key, value]) => {
            (q as any)[key] = value;
          });
        }
        
        mockQuestionStorage.set(id, q);
        count++;
      }
    });
    
    return { matchedCount: count, modifiedCount: count };
  }
  
  id: number;
  userId: number;
  title: string;
  content: string;
  imageUrl: string | null;
  solved: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  
  constructor(data: any) {
    // Required validations
    if (!data.userId) throw new Error('Question validation failed: userId: Path `userId` is required.');
    if (!data.title) throw new Error('Question validation failed: title: Path `title` is required.');
    if (!data.content) throw new Error('Question validation failed: content: Path `content` is required.');
    
    this.id = data.id;
    this.userId = data.userId;
    this.title = data.title;
    this.content = data.content;
    this.imageUrl = data.imageUrl || null;
    this.solved = data.solved || false;
    this.views = data.views || 0;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }
  
  async save(): Promise<any> {
    // Generate ID if not present
    if (!this.id) {
      this.id = mockQuestionCounter++;
    }
    
    // Store in mock storage
    mockQuestionStorage.set(this.id, this);
    
    return this;
  }
}

// Create the model
const QuestionModel: Model<IQuestion> = model<IQuestion>('Question', questionSchema);

// Export the appropriate model based on mode
export default process.env.USE_MOCK_DB === 'true' ? (MockQuestionModel as any) : QuestionModel;