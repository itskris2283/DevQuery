import { Schema, model, Document, Model } from 'mongoose';

// Vote interface
export interface IVote extends Document {
  id: number;
  userId: number;
  questionId: number | null;
  answerId: number | null;
  value: number;
  createdAt: Date;
}

// Schema for MongoDB
const voteSchema = new Schema<IVote>({
  id: { type: Number, required: true, unique: true },
  userId: { type: Number, required: true, ref: 'User' },
  questionId: { type: Number, default: null, ref: 'Question' },
  answerId: { type: Number, default: null, ref: 'Answer' },
  value: { type: Number, required: true }, // +1 for upvote, -1 for downvote
  createdAt: { type: Date, default: Date.now }
});

// Indexes for faster queries and to enforce uniqueness
voteSchema.index({ userId: 1, questionId: 1 }, { unique: true, sparse: true });
voteSchema.index({ userId: 1, answerId: 1 }, { unique: true, sparse: true });

// Validation to ensure either questionId or answerId is provided but not both
voteSchema.pre('validate', function(next) {
  if ((this.questionId === null && this.answerId === null) || 
      (this.questionId !== null && this.answerId !== null)) {
    next(new Error('Either questionId or answerId must be provided, but not both'));
  } else {
    next();
  }
});

// Counter for auto-increment ID
let voteCounter = 1;

// Auto-increment ID handling
voteSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxVote = await Vote.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxVote ? maxVote.id + 1 : voteCounter++;
  }
  next();
});

// Create and export the model
const Vote: Model<IVote> = model<IVote>('Vote', voteSchema);

export default Vote;