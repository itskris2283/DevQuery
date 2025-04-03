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

// Index for faster queries
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

// Counter for auto-increment ID
let userCounter = 1;

// Auto-increment ID handling
userSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxUser = await User.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxUser ? maxUser.id + 1 : userCounter++;
  }
  
  // Always update the 'updatedAt' field on save
  this.updatedAt = new Date();
  
  next();
});

// Create and export the model
const User: Model<IUser> = model<IUser>('User', userSchema);

export default User;