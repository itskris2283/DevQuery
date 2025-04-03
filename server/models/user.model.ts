import { Schema, model, Document, Model } from 'mongoose';

// User interface
export interface IUser extends Document {
  id: number;
  username: string;
  email: string;
  password: string;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: 'student' | 'teacher';
  createdAt: Date;
  updatedAt: Date;
}

// Schema for MongoDB
const userSchema = new Schema<IUser>({
  id: { type: Number, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  bio: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  role: { type: String, enum: ['student', 'teacher'], default: 'student' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Optimize indexes for faster queries
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ id: 1 }, { unique: true });
userSchema.index({ username: 'text', fullName: 'text' }); // Text search index

// Auto-increment ID handling with better reliability
userSchema.pre('save', async function(next) {
  // Skip if ID is already set
  if (!this.id) {
    try {
      // Find the maximum ID in the collection
      const maxUser = await User.findOne({}, {}, { sort: { id: -1 } });
      
      // Set the ID to the maximum + 1, or 1 if collection is empty
      this.id = maxUser ? maxUser.id + 1 : 1;
      
      // Double-check that this ID isn't already taken
      // This is an extra safety measure for race conditions
      const existingWithId = await User.findOne({ id: this.id });
      if (existingWithId) {
        // In the rare case of a race condition, find the true max again
        const trueMax = await User.find().sort({ id: -1 }).limit(1);
        this.id = trueMax.length > 0 ? trueMax[0].id + 1 : 1;
      }
    } catch (error) {
      console.error('Error generating user ID:', error);
      // In case of error, assign a random large ID (last resort)
      // This should never happen in normal operation
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  
  // Always update the 'updatedAt' field on save
  this.updatedAt = new Date();
  
  next();
});

// Create and export the model
const User: Model<IUser> = model<IUser>('User', userSchema);

export default User;