import { Schema, model, Document, Model } from 'mongoose';

// Message interface
export interface IMessage extends Document {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  read: boolean;
  createdAt: Date;
}

// Schema for MongoDB
const messageSchema = new Schema<IMessage>({
  id: { type: Number, required: true, unique: true },
  senderId: { type: Number, required: true, ref: 'User' },
  receiverId: { type: Number, required: true, ref: 'User' },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for faster queries
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, read: 1 });
messageSchema.index({ createdAt: -1 });

// Counter for auto-increment ID
let messageCounter = 1;

// Auto-increment ID handling
messageSchema.pre('save', async function(next) {
  if (!this.id) {
    // Get the maximum ID or start from 1
    const maxMessage = await Message.findOne({}, {}, { sort: { id: -1 } });
    this.id = maxMessage ? maxMessage.id + 1 : messageCounter++;
  }
  next();
});

// Create and export the model
const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);

export default Message;