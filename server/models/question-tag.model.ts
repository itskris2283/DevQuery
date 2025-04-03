import { Schema, model, Document, Model } from 'mongoose';

// QuestionTag interface for the many-to-many relationship
export interface IQuestionTag extends Document {
  id: number;
  questionId: number;
  tagId: number;
}

// Schema for MongoDB
const questionTagSchema = new Schema<IQuestionTag>({
  id: { type: Number, required: true, unique: true },
  questionId: { type: Number, required: true, ref: 'Question' },
  tagId: { type: Number, required: true, ref: 'Tag' }
});

// Compound index for uniqueness and faster queries
questionTagSchema.index({ questionId: 1, tagId: 1 }, { unique: true });

// Counter for auto-increment ID
let questionTagCounter = 1;

// Auto-increment ID handling
questionTagSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxQuestionTag = await QuestionTag.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxQuestionTag ? maxQuestionTag.id + 1 : questionTagCounter++;
  }
  next();
});

// Create and export the model
const QuestionTag: Model<IQuestionTag> = model<IQuestionTag>('QuestionTag', questionTagSchema);

export default QuestionTag;