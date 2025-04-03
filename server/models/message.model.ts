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

// Auto-increment ID handling with better reliability
messageSchema.pre('save', async function(next) {
  // Skip if ID is already set
  if (!this.id) {
    try {
      // Find the maximum ID in the collection
      const maxMessage = await Message.findOne({}, {}, { sort: { id: -1 } });
      
      // Set the ID to the maximum + 1, or 1 if collection is empty
      this.id = maxMessage ? maxMessage.id + 1 : 1;
      
      // Double-check that this ID isn't already taken (for race conditions)
      const existingWithId = await Message.findOne({ id: this.id });
      if (existingWithId) {
        // In case of a race condition, find the true max again
        const trueMax = await Message.find().sort({ id: -1 }).limit(1);
        this.id = trueMax.length > 0 ? trueMax[0].id + 1 : 1;
      }
    } catch (error) {
      console.error('Error generating message ID:', error);
      // In case of error, assign a timestamp-based ID (last resort)
      this.id = Math.floor(Date.now() / 1000);
    }
  }
  next();
});

// Add hooks for real-time notifications
// This is triggered after a new message is saved
messageSchema.post('save', function(doc) {
  try {
    // Emit an event for WebSocket notifications
    // We'll access this in the storage implementation
    const message = doc.toObject();
    messageSchema.emit('new_message', message);
  } catch (error) {
    console.error('Error in message post-save hook:', error);
  }
});

// Create and export the model
const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);

export default Message;

// Export event emitter for external listeners
export const messageEvents = messageSchema;