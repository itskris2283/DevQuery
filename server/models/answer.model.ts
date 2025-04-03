import { Schema, model, Document, Model } from 'mongoose';

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
  id: { type: Number, required: true, unique: true },
  userId: { type: Number, required: true, ref: 'User' },
  questionId: { type: Number, required: true, ref: 'Question' },
  content: { type: String, required: true },
  imageUrl: { type: String, default: null },
  accepted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for faster queries
answerSchema.index({ userId: 1 });
answerSchema.index({ questionId: 1 });
answerSchema.index({ accepted: 1 });

// Counter for auto-increment ID
let answerCounter = 1;

// Auto-increment ID handling
answerSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxAnswer = await Answer.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxAnswer ? maxAnswer.id + 1 : answerCounter++;
  }
  
  // Always update the 'updatedAt' field on save
  this.updatedAt = new Date();
  
  next();
});

// Create and export the model
const Answer: Model<IAnswer> = model<IAnswer>('Answer', answerSchema);

export default Answer;