import Web3 from 'web3';
import dotenv from 'dotenv';
import database from '../database.js';
import logger from '../logger.js';
import { safeToNumber, safeMin, safeMax } from '../utils/bigint.js';
import { 
  CONTRACTS, 
  EVENTS, 
  USDT_DEPLOYMENT_BLOCK, 
  USDC_DEPLOYMENT_BLOCK 
} from '../constants.js';

dotenv.config();

class EthereumSync {
  constructor() {
    this.web3 = new Web3(process.env.ETHEREUM_RPC_URL);
    this.chunkSize = parseInt(process.env.CHUNK_SIZE || '10000');
  }

  async processLog(log, token) {
    let address;
    
    // For USDT events, the address is in the data field (not indexed)
    // For USDC events, the address is in topics[1] (indexed)
    if (token === 'USDT') {
      // Extract address from data field (remove 0x prefix and first 24 chars)
      if (!log.data || log.data.length < 66) {
        logger.error('Invalid log structure - missing or invalid data field:', log);
        throw new Error(`Invalid log structure for ${token}: missing address data`);
      }
      address = '0x' + log.data.substring(26);
    } else {
      // For USDC, check if topics[1] exists
      if (!log.topics || log.topics.length < 2) {
        logger.error('Invalid log structure - missing topics[1]:', log);
        throw new Error(`Invalid log structure for ${token}: missing address topic`);
      }
      address = '0x' + log.topics[1].substring(26);
    }
    
    // Determine if this is a blacklist or unblacklist event
    let isBlacklisted = true;
    if (log.topics[0] === EVENTS.REMOVED_BLACKLIST || 
        log.topics[0] === EVENTS.UNBLACKLISTED) {
      isBlacklisted = false;
    }

    // Get block timestamp
    const block = await this.web3.eth.getBlock(log.blockNumber);
    
    return {
      address,
      token,
      network: 'ETHEREUM',
      is_blacklisted: isBlacklisted,
      block_number: safeToNumber(log.blockNumber),
      transaction_hash: log.transactionHash,
      timestamp: safeToNumber(block.timestamp)
    };
  }

  async syncToken(tokenSymbol, contractAddress, events, startBlock) {
    try {
      const lastSyncedBlock = await database.getLastSyncedBlock('ETHEREUM', tokenSymbol);
      const fromBlock = safeMax(lastSyncedBlock + 1, startBlock);
      const latestBlockBigInt = await this.web3.eth.getBlockNumber();
      const latestBlock = safeToNumber(latestBlockBigInt);

      logger.info(`Starting ${tokenSymbol} sync from block ${fromBlock} to ${latestBlock}`);

      let currentBlock = fromBlock;
      
      while (currentBlock <= latestBlock) {
        const toBlock = safeMin(currentBlock + this.chunkSize - 1, latestBlock);
        
        logger.info(`Fetching ${tokenSymbol} logs from block ${currentBlock} to ${toBlock}`);
        
        try {
          // Query each event type separately to avoid Web3.js v4 validation issues
          const allLogs = [];
          
          for (const eventHash of events) {
            const logs = await this.web3.eth.getPastLogs({
              fromBlock: currentBlock,
              toBlock: toBlock,
              address: contractAddress,
              topics: [eventHash]
            });
            allLogs.push(...logs);
          }

          if (allLogs.length > 0) {
            logger.info(`Found ${allLogs.length} events for ${tokenSymbol}`);
            
            const entries = [];
            for (const log of allLogs) {
              const entry = await this.processLog(log, tokenSymbol);
              entries.push(entry);
            }
            
            await database.batchUpsertBlacklistEntries(entries);
            logger.info(`Processed ${entries.length} ${tokenSymbol} blacklist entries`);
          }

          await database.updateSyncStatus('ETHEREUM', tokenSymbol, toBlock);
          currentBlock = toBlock + 1;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          if (error.message.includes('query returned more than') || 
              error.message.includes('range is too large') ||
              error.message.includes('max is 1k blocks')) {
            // Reduce chunk size if we hit the log limit
            this.chunkSize = Math.floor(this.chunkSize / 2);
            logger.warn(`Reducing chunk size to ${this.chunkSize} due to RPC limit: ${error.message}`);
            
            // Ensure chunk size doesn't go below 100
            if (this.chunkSize < 100) {
              this.chunkSize = 100;
              logger.warn(`Chunk size hit minimum of ${this.chunkSize}`);
            }
            continue;
          }
          throw error;
        }
      }

      logger.info(`${tokenSymbol} sync completed. Last block: ${latestBlock}`);
      
    } catch (error) {
      logger.error(`Error syncing ${tokenSymbol}:`, error);
      throw error;
    }
  }

  async syncUSDT() {
    await this.syncToken(
      'USDT',
      CONTRACTS.ETHEREUM.USDT,
      [EVENTS.ADDED_BLACKLIST, EVENTS.REMOVED_BLACKLIST],
      USDT_DEPLOYMENT_BLOCK
    );
  }

  async syncUSDC() {
    await this.syncToken(
      'USDC',
      CONTRACTS.ETHEREUM.USDC,
      [EVENTS.BLACKLISTED, EVENTS.UNBLACKLISTED],
      USDC_DEPLOYMENT_BLOCK
    );
  }

  async syncAll() {
    logger.info('Starting Ethereum sync...');
    
    // Sync in parallel for better performance
    await Promise.all([
      this.syncUSDT(),
      this.syncUSDC()
    ]);
    
    logger.info('Ethereum sync completed');
  }

  async liveSync() {
    logger.info('Starting Ethereum live sync...');
    
    // Set up event subscriptions for real-time updates
    const usdtContract = new this.web3.eth.Contract([], CONTRACTS.ETHEREUM.USDT);
    const usdcContract = new this.web3.eth.Contract([], CONTRACTS.ETHEREUM.USDC);

    // USDT AddedBlackList events
    usdtContract.events.allEvents({
      topics: [EVENTS.ADDED_BLACKLIST]
    })
    .on('data', async (event) => {
      logger.info('New USDT AddedBlackList event:', event);
      const entry = await this.processLog(event, 'USDT');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDT AddedBlackList event error:', error);
    });

    // USDT RemovedBlackList events
    usdtContract.events.allEvents({
      topics: [EVENTS.REMOVED_BLACKLIST]
    })
    .on('data', async (event) => {
      logger.info('New USDT RemovedBlackList event:', event);
      const entry = await this.processLog(event, 'USDT');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDT RemovedBlackList event error:', error);
    });

    // USDC Blacklisted events
    usdcContract.events.allEvents({
      topics: [EVENTS.BLACKLISTED]
    })
    .on('data', async (event) => {
      logger.info('New USDC Blacklisted event:', event);
      const entry = await this.processLog(event, 'USDC');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDC Blacklisted event error:', error);
    });

    // USDC UnBlacklisted events
    usdcContract.events.allEvents({
      topics: [EVENTS.UNBLACKLISTED]
    })
    .on('data', async (event) => {
      logger.info('New USDC UnBlacklisted event:', event);
      const entry = await this.processLog(event, 'USDC');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDC UnBlacklisted event error:', error);
    });
  }
}
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
const isMainModule = import.meta.url.endsWith('src/ethereum/sync.js') && normalizedArgv.endsWith('src/ethereum/sync.js');

// Run if called directly
if (isMainModule) {
  const sync = new EthereumSync();
  
  await database.init(process.env.DATABASE_PATH || './data/blacklist.db');
  
  // Run initial sync
  await sync.syncAll();
  
  // Start live sync if not in one-time mode
  if (process.argv[2] !== '--once') {
    await sync.liveSync();
    
    // Also run periodic sync to catch any missed events
    setInterval(async () => {
      await sync.syncAll();
    }, parseInt(process.env.SYNC_INTERVAL_MINUTES || '10') * 60 * 1000);
  }
}

export default EthereumSync; 