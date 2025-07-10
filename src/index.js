import dotenv from 'dotenv';
import cron from 'node-cron';
import database from './database.js';
import logger from './logger.js';
import EthereumSync from './ethereum/sync.js';
import TronSync from './tron/sync.js';
import { startServer } from './api/server.js';

dotenv.config();

async function main() {
  try {
    logger.info('Starting Blockchain Blacklist Harvester...');

    // Initialize database
    await database.init(process.env.DATABASE_PATH || './data/blacklist.db');

    // Initialize sync instances
    const ethereumSync = new EthereumSync();
    const tronSync = new TronSync();

    // Start API server
    startServer();

    // Run initial sync based on command line arguments
    const args = process.argv.slice(2);
    const syncMode = args[0] || 'all';
    const runOnce = args.includes('--once');

    logger.info(`Sync mode: ${syncMode}, Run once: ${runOnce}`);

    // Perform initial sync
    if (syncMode === 'ethereum' || syncMode === 'all') {
      await ethereumSync.syncAll();
    }

    if (syncMode === 'tron' || syncMode === 'all') {
      await tronSync.syncAll();
    }

    if (!runOnce) {
      // Start live sync for real-time updates
      if (syncMode === 'ethereum' || syncMode === 'all') {
        ethereumSync.liveSync();
      }

      if (syncMode === 'tron' || syncMode === 'all') {
        tronSync.liveSync();
      }

      // Schedule periodic full sync
      const syncInterval = process.env.SYNC_INTERVAL_MINUTES || '10';
      const cronExpression = `*/${syncInterval} * * * *`;

      logger.info(`Scheduling periodic sync every ${syncInterval} minutes`);

      cron.schedule(cronExpression, async () => {
        logger.info('Running scheduled sync...');
        
        try {
          if (syncMode === 'ethereum' || syncMode === 'all') {
            await ethereumSync.syncAll();
          }

          if (syncMode === 'tron' || syncMode === 'all') {
            await tronSync.syncAll();
          }

          // Log statistics after sync
          const stats = await database.getStats();
          logger.info('Sync statistics:', stats);
        } catch (error) {
          logger.error('Error in scheduled sync:', error);
        }
      });

      logger.info('Blacklist harvester is running...');
      logger.info('Press Ctrl+C to stop');

      // Keep the process running
      process.on('SIGINT', async () => {
        logger.info('Shutting down...');
        await database.close();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Shutting down...');
        await database.close();
        process.exit(0);
      });
    } else {
      // Exit after one-time sync
      logger.info('One-time sync completed');
      await database.close();
      process.exit(0);
    }

  } catch (error) {
    logger.error('Fatal error:', error);
    await database.close();
    process.exit(1);
  }
}

// Run the main function
main(); 