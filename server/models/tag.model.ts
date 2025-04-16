import { Schema, model, Document, Model } from 'mongoose';

// Tag interface
export interface ITag extends Document {
  id: number;
  name: string;
}

// Schema for MongoDB
const tagSchema = new Schema<ITag>({
  id: { type: Number, required: false }, // Not required initially, will be set in pre-save hook
  name: { type: String, required: true, unique: true }
});

// Index for faster queries - use only one unique index for name
tagSchema.index({ id: 1 }, { unique: true });

// Counter for auto-increment ID
let tagCounter = 1;

// Auto-increment ID handling
tagSchema.pre('save', async function(next) {
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
      const maxTag = await Tag.findOne({}, {}, { sort: { id: -1 } });
      this.id = maxTag ? maxTag.id + 1 : tagCounter++;
    } catch (error) {
      console.error('Error generating tag ID:', error);
      // In case of error, assign a random ID to avoid validation failures
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  
  next();
});

// Create and export the model
const Tag: Model<ITag> = model<ITag>('Tag', tagSchema);

export default Tag;