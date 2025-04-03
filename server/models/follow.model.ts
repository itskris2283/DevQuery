import { Schema, model, Document, Model } from 'mongoose';

// Follow interface
export interface IFollow extends Document {
  id: number;
  followerId: number;
  followingId: number;
  createdAt: Date;
}

// Schema for MongoDB
const followSchema = new Schema<IFollow>({
  id: { type: Number, required: true, unique: true },
  followerId: { type: Number, required: true, ref: 'User' },
  followingId: { type: Number, required: true, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for uniqueness and faster queries
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

// Additional indexes for user followers/following lists
followSchema.index({ followerId: 1 });
followSchema.index({ followingId: 1 });

// Validation to prevent self-following
followSchema.pre('validate', function(next) {
  if (this.followerId === this.followingId) {
    next(new Error('Users cannot follow themselves'));
  } else {
    next();
  }
});

// Counter for auto-increment ID
let followCounter = 1;

// Auto-increment ID handling
followSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxFollow = await Follow.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxFollow ? maxFollow.id + 1 : followCounter++;
  }
  next();
});

// Create and export the model
const Follow: Model<IFollow> = model<IFollow>('Follow', followSchema);

export default Follow;