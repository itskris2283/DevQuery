import { Schema, model, Document, Model } from 'mongoose';

// Tag interface
export interface ITag extends Document {
  id: number;
  name: string;
}

// Schema for MongoDB
const tagSchema = new Schema<ITag>({
  id: { type: Number, required: true },
  name: { type: String, required: true }
});

// Index for faster queries
tagSchema.index({ id: 1 }, { unique: true });
tagSchema.index({ name: 1 }, { unique: true });

// Counter for auto-increment ID
let tagCounter = 1;

// Auto-increment ID handling
tagSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxTag = await Tag.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxTag ? maxTag.id + 1 : tagCounter++;
  }
  next();
});

// Create and export the model
const Tag: Model<ITag> = model<ITag>('Tag', tagSchema);

export default Tag;