import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { Db } from './types/types';

declare global {
  // eslint-disable-next-line no-var
  var __medagenda_mysql_pool: mysql.Pool | undefined;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown, Db {
  private pool!: mysql.Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    if (globalThis.__medagenda_mysql_pool) {
      this.pool = globalThis.__medagenda_mysql_pool;
      return;
    }

    const connectionLimit = Number(this.config.get<string | number>('DB_CONNECTION_LIMIT')) || 2;
    const isAiven = this.config.get<string>('DB_HOST')?.includes('aivencloud.com');
    const sslConfig =
      this.config.get<string>('DB_SSL') === 'true' || isAiven
        ? { rejectUnauthorized: false }
        : undefined;

    this.pool = mysql.createPool({
      host: this.config.get<string>('DB_HOST'),
      port: this.config.get<number>('DB_PORT'),
      user: this.config.get<string>('DB_USER'),
      password: this.config.get<string>('DB_PASS'),
      database: this.config.get<string>('DB_NAME'),
      // Return DATETIME/TIMESTAMP columns as strings to avoid implicit timezone shifts
      dateStrings: true,
      waitForConnections: true,
      connectionLimit,
      queueLimit: 0,
      maxIdle: connectionLimit,
      idleTimeout: 30000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      ...(sslConfig ? { ssl: sslConfig } : {}),
    });

    globalThis.__medagenda_mysql_pool = this.pool;
  }

  async onApplicationShutdown() {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch {
        // Ignored on shutdown
      }
      globalThis.__medagenda_mysql_pool = undefined;
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader>(sql, params);
    return result;
  }

  async inTx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const txDb: Db = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const [rows] = await conn.query(sql, params);
          return rows as R[];
        },
        execute: async (sql: string, params?: any[]) => {
          const [res] = await conn.execute(sql, params);
          return res;
        },
        inTx: async <U>(inner: (tx: Db) => Promise<U>): Promise<U> => inner(txDb),
      };

      const out = await fn(txDb);
      await conn.commit();
      return out;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  async getConnection(): Promise<mysql.PoolConnection> {
    return this.pool.getConnection();
  }
}
