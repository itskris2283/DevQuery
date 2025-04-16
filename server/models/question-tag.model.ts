import { Schema, model, Document, Model } from 'mongoose';

// QuestionTag interface for the many-to-many relationship
export interface IQuestionTag extends Document {
  id: number;
  questionId: number;
  tagId: number;
}

// Schema for MongoDB
const questionTagSchema = new Schema<IQuestionTag>({
  id: { type: Number, required: false, unique: true }, // Not required initially, will be set in pre-save hook
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
    try {
      // In mock mode, don't try to query the database
      if (process.env.USE_MOCK_DB === 'true') {
        // Just generate a random ID for mock mode
        this.id = Math.floor(Math.random() * 100000) + 1;
        return next();
      }
      
      // Get the maximum ID or start from 1
      const maxQuestionTag = await QuestionTag.findOne({}, {}, { sort: { id: -1 } });
      this.id = maxQuestionTag ? maxQuestionTag.id + 1 : questionTagCounter++;
    } catch (error) {
      console.error('Error generating question-tag ID:', error);
      // In case of error, assign a random ID to avoid validation failures
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  next();
});

// Create and export the model
const QuestionTag: Model<IQuestionTag> = model<IQuestionTag>('QuestionTag', questionTagSchema);

export default QuestionTag;