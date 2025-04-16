// Type declarations for connect-mongo module

declare module 'connect-mongo' {
  import { Store, SessionData } from 'express-session';
  import { EventEmitter } from 'events';
  
  interface MongoStoreOptions {
    mongoUrl?: string;
    clientPromise?: Promise<any>;
    client?: any;
    dbName?: string;
    collectionName?: string;
    ttl?: number;
    autoRemove?: string;
    autoRemoveInterval?: number;
    touchAfter?: number;
    stringify?: boolean;
    crypto?: {
      secret: string;
    };
    fallbackMemory?: boolean;
    serialize?: (session: any) => any;
    unserialize?: (session: any) => any;
  }
  
  class MongoStore extends EventEmitter implements Store {
    constructor(options: MongoStoreOptions);
    
    get(sid: string, callback: (err: any, session?: SessionData | null) => void): void;
    set(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    destroy(sid: string, callback?: (err?: any) => void): void;
    touch(sid: string, session: SessionData, callback?: (err?: any) => void): void;
    length(callback: (err: any, length: number) => void): void;
    clear(callback?: (err?: any) => void): void;
    close(): Promise<void>;
    
    static create(options: MongoStoreOptions): MongoStore;
  }
  
  export = MongoStore;
} 