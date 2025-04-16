// Type declarations for memorystore module

declare module 'memorystore' {
  import { Store } from 'express-session';
  
  // Factory function that creates a MemoryStore constructor
  function memorystore(session: any): {
    new(options?: {
      checkPeriod?: number;
      max?: number;
      ttl?: number;
      stale?: boolean;
      dispose?: (key: string, value: any) => void;
      noDisposeOnSet?: boolean;
    }): Store;
  };
  
  export = memorystore;
} 