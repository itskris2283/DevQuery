declare module 'connect-mysql' {
  import { SessionOptions, Store } from 'express-session';
  
  interface MySQLStoreOptions {
    config: {
      user?: string;
      password?: string;
      database?: string;
      host?: string;
      port?: number;
      connectionLimit?: number;
      connectTimeout?: number;
      waitForConnections?: boolean;
      queueLimit?: number;
      [key: string]: any;
    };
    table?: string;
    ttl?: number;
    [key: string]: any;
  }
  
  // Factory function that returns the MySQLStore class constructor
  export default function(session: { Store: typeof Store }): {
    new(options: MySQLStoreOptions): Store;
  };
}