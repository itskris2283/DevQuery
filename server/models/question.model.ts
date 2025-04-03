import { Schema, model, Document, Model, Types } from 'mongoose';

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
  id: { type: Number, required: true, unique: true },
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
questionSchema.index({ userId: 1 });
questionSchema.index({ solved: 1 });
questionSchema.index({ createdAt: -1 });

// Counter for auto-increment ID
let questionCounter = 1;

// Auto-increment ID handling
questionSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxQuestion = await Question.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxQuestion ? maxQuestion.id + 1 : questionCounter++;
  }
  
  // Always update the 'updatedAt' field on save
  this.updatedAt = new Date();
  
  next();
});

// Create and export the model
const Question: Model<IQuestion> = model<IQuestion>('Question', questionSchema);

export default Question;