import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DB_SCHEMA } from './constants.js';
import path from 'path';
import fs from 'fs/promises';

class Database {
  constructor() {
    this.db = null;
  }

  async init(dbPath) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Create tables
    await this.db.exec(DB_SCHEMA);
    
    // Enable foreign keys
    await this.db.run('PRAGMA foreign_keys = ON');
    
    console.log('Database initialized at:', dbPath);
  }

  async upsertBlacklistEntry(entry) {
    const {
      address,
      token,
      network,
      is_blacklisted,
      block_number,
      transaction_hash,
      timestamp
    } = entry;

    const now = Date.now();

    await this.db.run(`
      INSERT INTO blacklist (
        address, token, network, is_blacklisted, 
        block_number, transaction_hash, timestamp,
        first_seen, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(address, token, network) DO UPDATE SET
        is_blacklisted = excluded.is_blacklisted,
        block_number = excluded.block_number,
        transaction_hash = excluded.transaction_hash,
        timestamp = excluded.timestamp,
        last_updated = excluded.last_updated
    `, [
      address.toLowerCase(),
      token,
      network,
      is_blacklisted ? 1 : 0,
      block_number,
      transaction_hash,
      timestamp,
      now,
      now
    ]);
  }

  async batchUpsertBlacklistEntries(entries) {
    const stmt = await this.db.prepare(`
      INSERT INTO blacklist (
        address, token, network, is_blacklisted, 
        block_number, transaction_hash, timestamp,
        first_seen, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(address, token, network) DO UPDATE SET
        is_blacklisted = excluded.is_blacklisted,
        block_number = excluded.block_number,
        transaction_hash = excluded.transaction_hash,
        timestamp = excluded.timestamp,
        last_updated = excluded.last_updated
    `);

    const now = Date.now();

    for (const entry of entries) {
      await stmt.run([
        entry.address.toLowerCase(),
        entry.token,
        entry.network,
        entry.is_blacklisted ? 1 : 0,
        entry.block_number,
        entry.transaction_hash,
        entry.timestamp,
        now,
        now
      ]);
    }

    await stmt.finalize();
  }

  async getLastSyncedBlock(network, token) {
    const result = await this.db.get(
      'SELECT last_synced_block FROM sync_status WHERE network = ? AND token = ?',
      [network, token]
    );
    return result?.last_synced_block || 0;
  }

  async updateSyncStatus(network, token, blockNumber) {
    await this.db.run(`
      INSERT INTO sync_status (network, token, last_synced_block, last_sync_timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(network, token) DO UPDATE SET
        last_synced_block = excluded.last_synced_block,
        last_sync_timestamp = excluded.last_sync_timestamp
    `, [network, token, blockNumber, Date.now()]);
  }

  async getBlacklistStatus(address, token = null, network = null) {
    let query = 'SELECT * FROM blacklist WHERE address = ?';
    const params = [address.toLowerCase()];

    if (token) {
      query += ' AND token = ?';
      params.push(token);
    }

    if (network) {
      query += ' AND network = ?';
      params.push(network);
    }

    return await this.db.all(query, params);
  }

  async getAllBlacklisted(network = null, token = null) {
    let query = 'SELECT * FROM blacklist WHERE is_blacklisted = 1';
    const params = [];

    if (network) {
      query += ' AND network = ?';
      params.push(network);
    }

    if (token) {
      query += ' AND token = ?';
      params.push(token);
    }

    return await this.db.all(query, params);
  }

  async getAllBlacklistEntries(limit = 100) {
    return await this.db.all('SELECT * FROM blacklist ORDER BY last_updated DESC LIMIT ?', [limit]);
  }

  async getSyncStatus() {
    return await this.db.all('SELECT * FROM sync_status');
  }

  async getStats() {
    const stats = await this.db.all(`
      SELECT 
        network,
        token,
        COUNT(CASE WHEN is_blacklisted = 1 THEN 1 END) as blacklisted_count,
        COUNT(*) as total_count
      FROM blacklist
      GROUP BY network, token
    `);

    const syncStatus = await this.db.all('SELECT * FROM sync_status');

    return { stats, syncStatus };
  }

  async close() {
    if (this.db) {
      await this.db.close();
    }
  }
}

export default new Database(); 