import { Schema, model, Document, Model, Types } from 'mongoose';
import fs from 'fs';
import path from 'path';

// ImageFile interface
export interface IImageFile extends Document {
  id: number;
  filename: string;
  originalname: string;
  contentType: string;
  size: number;
  data: Buffer;
  uploadDate: Date;
  metadata: {
    uploadedBy?: number; // User ID who uploaded the file
    questionId?: number; // Question ID if associated with a question
    answerId?: number;   // Answer ID if associated with an answer
    migratedFromFilesystem?: boolean;
  };
}

// Mock storage for when MongoDB is not available
const mockImageStorage = new Map<number, {
  id: number;
  filename: string;
  originalname: string;
  contentType: string;
  size: number;
  data: Buffer;
  uploadDate: Date;
  metadata: any;
}>();

// Counter for mock storage IDs
let mockImageCounter = 1;

// Schema for MongoDB
const imageFileSchema = new Schema<IImageFile>({
  id: { type: Number, required: false }, // Not required initially, will be set in pre-save hook
  filename: { type: String, required: true },
  originalname: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadDate: { type: Date, default: Date.now },
  metadata: {
    uploadedBy: { type: Number, ref: 'User' },
    questionId: { type: Number, ref: 'Question' },
    answerId: { type: Number, ref: 'Answer' },
    migratedFromFilesystem: { type: Boolean, default: false }
  }
});

// Index for faster queries
imageFileSchema.index({ id: 1 }, { unique: true });
imageFileSchema.index({ 'metadata.uploadedBy': 1 });
imageFileSchema.index({ 'metadata.questionId': 1 });
imageFileSchema.index({ 'metadata.answerId': 1 });
imageFileSchema.index({ filename: 1 });

// Counter for auto-increment ID
let imageFileCounter = 1;

// Auto-increment ID handling
imageFileSchema.pre('save', async function(next) {
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
      const maxImageFile = await ImageFile.findOne({}, {}, { sort: { id: -1 } });
      this.id = maxImageFile ? maxImageFile.id + 1 : imageFileCounter++;
    } catch (error) {
      console.error('Error generating image file ID:', error);
      // In case of error, assign a random ID to avoid validation failures
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  
  next();
});

// Events
export const imageFileEvents = {
  saved: 'image-file:saved',
  removed: 'image-file:removed'
};

// Create and export the model
const ImageFile: Model<IImageFile> = model<IImageFile>('ImageFile', imageFileSchema);

// Mock implementation for when MongoDB is not available
class MockImageFile {
  static async findOne(query: any): Promise<any> {
    if (query.id) {
      return mockImageStorage.get(query.id) || null;
    }
    // No support for other query types in mock mode
    return null;
  }

  static async findById(id: number): Promise<any> {
    return mockImageStorage.get(id) || null;
  }

  id: number;
  filename: string;
  originalname: string;
  contentType: string;
  size: number;
  data: Buffer;
  uploadDate: Date;
  metadata: any;

  constructor(data: any) {
    this.id = data.id;
    this.filename = data.filename;
    this.originalname = data.originalname;
    this.contentType = data.contentType;
    this.size = data.size;
    this.data = data.data;
    this.uploadDate = data.uploadDate || new Date();
    this.metadata = data.metadata || {};
  }

  async save(): Promise<any> {
    // Generate ID if not present
    if (!this.id) {
      this.id = mockImageCounter++;
    }
    
    // Store in mock storage
    mockImageStorage.set(this.id, this);
    
    return this;
  }
}

// Helper to decide which implementation to use
export function getImageFileModel(): any {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log('Using mock ImageFile model');
    return MockImageFile;
  }
  return ImageFile;
}

export default process.env.USE_MOCK_DB === 'true' ? MockImageFile : ImageFile; 