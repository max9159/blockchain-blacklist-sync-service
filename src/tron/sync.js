import TronWeb from 'tronweb';
import dotenv from 'dotenv';
import database from '../database.js';
import logger from '../logger.js';
import { safeToNumber } from '../utils/bigint.js';
import { CONTRACTS } from '../constants.js';

dotenv.config();

class TronSync {
  constructor() {
    this.tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
      headers: { 'TRON-PRO-API-KEY': process.env.TRON_GRID_API_KEY }
    });
    this.chunkSize = parseInt(process.env.CHUNK_SIZE || '200'); // Smaller chunks for TRON
  }

  async processEvent(event, token) {
    // Extract address from event result
    const address = event.result._user || event.result[0];
    
    // Convert TRON address to hex format for consistency
    const hexAddress = this.tronWeb.address.toHex(address);
    
    // Determine if this is a blacklist or unblacklist event
    let isBlacklisted = true;
    if (event.event_name === 'RemovedBlackList') {
      isBlacklisted = false;
    }

    return {
      address: hexAddress,
      token,
      network: 'TRON',
      is_blacklisted: isBlacklisted,
      block_number: safeToNumber(event.block_number),
      transaction_hash: event.transaction_id,
      timestamp: safeToNumber(event.block_timestamp)
    };
  }

  async getContractEvents(contractAddress, eventName, minBlockTimestamp, maxBlockTimestamp) {
    const events = [];
    let fingerprint = '';
    
    try {
      while (true) {
        const url = `${this.tronWeb.fullNode.host}/v1/contracts/${contractAddress}/events`;
        const params = new URLSearchParams({
          event_name: eventName,
          min_block_timestamp: minBlockTimestamp,
          max_block_timestamp: maxBlockTimestamp,
          limit: 200
        });
        
        if (fingerprint) {
          params.append('fingerprint', fingerprint);
        }

        const response = await fetch(`${url}?${params}`, {
          headers: {
            'TRON-PRO-API-KEY': process.env.TRON_GRID_API_KEY || ''
          }
        });

        if (!response.ok) {
          throw new Error(`TronGrid API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
          break;
        }

        events.push(...data.data);
        
        // Check if there are more results
        if (!data.meta?.fingerprint || data.data.length < 200) {
          break;
        }
        
        fingerprint = data.meta.fingerprint;
      }
    } catch (error) {
      logger.error(`Error fetching TRON events: ${error.message}`);
      throw error;
    }

    return events;
  }

  async syncToken(tokenSymbol, contractAddress) {
    try {
      const lastSyncedBlock = await database.getLastSyncedBlock('TRON', tokenSymbol);
      
      // Get current block info
      const currentBlock = await this.tronWeb.trx.getCurrentBlock();
      const currentBlockNumber = currentBlock.block_header.raw_data.number;
      const currentTimestamp = currentBlock.block_header.raw_data.timestamp;

      // If we have a last synced block, get its timestamp
      let fromTimestamp = 0;
      if (lastSyncedBlock > 0) {
        try {
          const lastBlock = await this.tronWeb.trx.getBlockByNumber(lastSyncedBlock);
          fromTimestamp = lastBlock.block_header.raw_data.timestamp + 1;
        } catch {
          // If we can't get the block, start from a reasonable time ago
          fromTimestamp = currentTimestamp - (30 * 24 * 60 * 60 * 1000); // 30 days ago
        }
      }

      logger.info(`Starting ${tokenSymbol} TRON sync from timestamp ${fromTimestamp} to ${currentTimestamp}`);

      // Fetch both AddedBlackList and RemovedBlackList events
      const [addedEvents, removedEvents] = await Promise.all([
        this.getContractEvents(contractAddress, 'AddedBlackList', fromTimestamp, currentTimestamp),
        this.getContractEvents(contractAddress, 'RemovedBlackList', fromTimestamp, currentTimestamp)
      ]);

      const allEvents = [...addedEvents, ...removedEvents];
      
      if (allEvents.length > 0) {
        logger.info(`Found ${allEvents.length} events for ${tokenSymbol} on TRON`);
        
        // Sort events by block number to process in order
        allEvents.sort((a, b) => a.block_number - b.block_number);
        
        const entries = [];
        for (const event of allEvents) {
          const entry = await this.processEvent(event, tokenSymbol);
          entries.push(entry);
        }
        
        await database.batchUpsertBlacklistEntries(entries);
        logger.info(`Processed ${entries.length} ${tokenSymbol} TRON blacklist entries`);
      }

      await database.updateSyncStatus('TRON', tokenSymbol, currentBlockNumber);
      logger.info(`${tokenSymbol} TRON sync completed. Last block: ${currentBlockNumber}`);
      
    } catch (error) {
      logger.error(`Error syncing ${tokenSymbol} on TRON:`, error);
      throw error;
    }
  }

  async syncUSDT() {
    await this.syncToken('USDT', CONTRACTS.TRON.USDT);
  }

  async syncAll() {
    logger.info('Starting TRON sync...');
    
    // Currently only USDT on TRON
    await this.syncUSDT();
    
    logger.info('TRON sync completed');
  }

  async liveSync() {
    logger.info('Starting TRON live sync...');
    
    // TRON doesn't have WebSocket support like Ethereum
    // We'll use polling with a shorter interval
    const pollInterval = 3000; // 3 seconds

    const pollForEvents = async () => {
      try {
        const currentBlock = await this.tronWeb.trx.getCurrentBlock();
        const currentTimestamp = currentBlock.block_header.raw_data.timestamp;
        const fromTimestamp = currentTimestamp - (pollInterval * 2); // Look back 2x poll interval

        const [addedEvents, removedEvents] = await Promise.all([
          this.getContractEvents(CONTRACTS.TRON.USDT, 'AddedBlackList', fromTimestamp, currentTimestamp),
          this.getContractEvents(CONTRACTS.TRON.USDT, 'RemovedBlackList', fromTimestamp, currentTimestamp)
        ]);

        const allEvents = [...addedEvents, ...removedEvents];
        
        for (const event of allEvents) {
          logger.info('New TRON event:', event);
          const entry = await this.processEvent(event, 'USDT');
          await database.upsertBlacklistEntry(entry);
        }
      } catch (error) {
        logger.error('TRON live sync error:', error);
      }
    };

    // Start polling
    setInterval(pollForEvents, pollInterval);
  }
}
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
const isMainModule = import.meta.url.endsWith('src/tron/sync.js') && normalizedArgv.endsWith('src/tron/sync.js');

// Run if called directly
if (isMainModule) {
  const sync = new TronSync();
  
  await database.init(process.env.DATABASE_PATH || './data/blacklist.db');
  
  // Run initial sync
  await sync.syncAll();
  
  // Start live sync if not in one-time mode
  if (process.argv[2] !== '--once') {
    await sync.liveSync();
    
    // Also run periodic full sync to catch any missed events
    setInterval(async () => {
      await sync.syncAll();
    }, parseInt(process.env.SYNC_INTERVAL_MINUTES || '10') * 60 * 1000);
  }
}

export default TronSync; 