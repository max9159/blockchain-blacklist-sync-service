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

  async syncToken(tokenSymbol, contractAddress, events, startBlock, forceFullSync = false) {
    try {
      const lastSyncedBlock = await database.getLastSyncedBlock('ETHEREUM', tokenSymbol);
      let fromBlock = safeMax(lastSyncedBlock + 1, startBlock);
      if (forceFullSync) {
        fromBlock = startBlock;
        logger.info(`Clearing existing ${tokenSymbol} ETHEREUM data before full sync`);
        await database.clearBlacklistData('ETHEREUM', tokenSymbol);
      }
      const latestBlockBigInt = await this.web3.eth.getBlockNumber();
      const latestBlock = safeToNumber(latestBlockBigInt);

      logger.info(`Starting ${tokenSymbol} sync from block ${fromBlock} to ${latestBlock}`);

      const maxBatchSize = 172800; // a 24-day period (assuming an average block time of ~12 seconds, which yields about 7,200 blocks per day: 7,200 × 24 = 172,800)
      let batchStart = fromBlock;
      while (batchStart <= latestBlock) {
        const batchEnd = safeMin(batchStart + maxBatchSize - 1, latestBlock);
        logger.info(`Processing batch from ${batchStart} to ${batchEnd} for ${tokenSymbol}`);
        let currentBlock = batchStart;
        while (currentBlock <= batchEnd) {
          const toBlock = safeMin(currentBlock + this.chunkSize - 1, batchEnd);
          
          logger.info(`Fetching ${tokenSymbol} logs from block ${currentBlock} to ${toBlock}`);
          
          try {
            const logs = await this.web3.eth.getPastLogs({
              fromBlock: currentBlock,
              toBlock: toBlock,
              address: contractAddress,
              topics: [events]
            });

            if (logs.length > 0) {
              logger.info(`Found ${logs.length} events for ${tokenSymbol}`);
              
              const entries = [];
              for (const log of logs) {
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
        batchStart = batchEnd + 1;
      }

      logger.info(`${tokenSymbol} sync completed. Last block: ${latestBlock}`);
          
    } catch (error) {
      logger.error(`Error syncing ${tokenSymbol}:`, error);
      throw error;
    }
  }

  async syncUSDT(forceFullSync = false) {
    await this.syncToken(
      'USDT',
      CONTRACTS.ETHEREUM.USDT,
      [EVENTS.ADDED_BLACKLIST, EVENTS.REMOVED_BLACKLIST],
      USDT_DEPLOYMENT_BLOCK,
      forceFullSync
    );
  }

  async syncUSDC(forceFullSync = false) {
    await this.syncToken(
      'USDC',
      CONTRACTS.ETHEREUM.USDC,
      [EVENTS.BLACKLISTED, EVENTS.UNBLACKLISTED],
      USDC_DEPLOYMENT_BLOCK,
      forceFullSync
    );
  }

  async syncAll(forceFullSync = false) {
    logger.info('Starting Ethereum sync...');
      
    // Sync in parallel for better performance
    await Promise.all([
      this.syncUSDT(forceFullSync),
      this.syncUSDC(forceFullSync)
    ]);
      
    logger.info('Ethereum sync completed');
  }

  async liveSync() {
    logger.info('Starting Ethereum live sync...');
      
    // Set up event subscriptions for real-time updates
    const usdtContract = new this.web3.eth.Contract([], CONTRACTS.ETHEREUM.USDT);
    usdtContract.events.allEvents({
      topics: [[EVENTS.ADDED_BLACKLIST, EVENTS.REMOVED_BLACKLIST]]
    })
    .on('data', async (event) => {
      logger.info('New USDT blacklist event:', event);
      const entry = await this.processLog(event, 'USDT');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDT blacklist event error:', error);
    });

    const usdcContract = new this.web3.eth.Contract([], CONTRACTS.ETHEREUM.USDC);
    usdcContract.events.allEvents({
      topics: [[EVENTS.BLACKLISTED, EVENTS.UNBLACKLISTED]]
    })
    .on('data', async (event) => {
      logger.info('New USDC blacklist event:', event);
      const entry = await this.processLog(event, 'USDC');
      await database.upsertBlacklistEntry(entry);
    })
    .on('error', (error) => {
      logger.error('USDC blacklist event error:', error);
    });
  }
}
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
const isMainModule = import.meta.url.endsWith('src/ethereum/sync.js') && normalizedArgv.endsWith('src/ethereum/sync.js');

// Run if called directly
if (isMainModule) {
  const sync = new EthereumSync();
  
  await database.init(process.env.DATABASE_PATH || './data/blacklist.db');
  
  const args = process.argv.slice(2);
  const isOnceMode = args.includes('--once');
  const isFullSync = args.includes('--full-sync');
  
  if (isFullSync) {
    logger.info('Full sync mode enabled - will re-fetch all historical data');
  }
  
  // Run initial sync
  await sync.syncAll(isFullSync);
  
  // Start live sync if not in one-time mode
  if (!isOnceMode) {
    await sync.liveSync();
    
    // Also run periodic sync to catch any missed events
    setInterval(async () => {
      await sync.syncAll(false);
    }, parseInt(process.env.SYNC_INTERVAL_MINUTES || '10') * 60 * 1000);
  }
}

export default EthereumSync; 