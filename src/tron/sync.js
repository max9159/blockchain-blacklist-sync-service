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

  async processEvent(event, token, eventConfig) {
    // Extract address from event result
    const address = event.result._user || event.result[0];
    
    // Convert TRON address to hex format for consistency
    const hexAddress = this.tronWeb.address.toHex(address);
    
    // Determine if this is a blacklist or unblacklist event based on event name
    let isBlacklisted = true;
    const eventName = event.event_name;
    
    // Check if this is an unblacklist event
    if (eventName === 'RemovedBlackList' || eventName === 'UnBlacklisted') {
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
    
    // Check if date range is over 1 month (30 days)
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const dateRange = maxBlockTimestamp - minBlockTimestamp;
    
    if (dateRange > oneMonthMs) {
      // Split into monthly chunks
      logger.info(`Date range is ${Math.ceil(dateRange / oneMonthMs)} months, splitting into monthly batches`);
      
      let currentStart = minBlockTimestamp;
      while (currentStart < maxBlockTimestamp) {
        const currentEnd = Math.min(currentStart + oneMonthMs, maxBlockTimestamp);
        
        logger.info(`Fetching batch: ${new Date(currentStart).toISOString()} to ${new Date(currentEnd).toISOString()}`);
        const batchEvents = await this.fetchEventsForRange(contractAddress, eventName, currentStart, currentEnd);
        events.push(...batchEvents);
        
        currentStart = currentEnd + 1; // Move to next batch
        
        // Add a small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      // Single request for smaller date ranges
      const rangeEvents = await this.fetchEventsForRange(contractAddress, eventName, minBlockTimestamp, maxBlockTimestamp);
      events.push(...rangeEvents);
    }

    return events;
  }

  async fetchEventsForRange(contractAddress, eventName, minBlockTimestamp, maxBlockTimestamp) {
    const events = [];
    let fingerprint = '';
    
    try {
      while (true) {
        logger.info(`Fetching TRON events for ${eventName} from ${new Date(minBlockTimestamp).toISOString()} to ${new Date(maxBlockTimestamp).toISOString()}`);
        const url = `${this.tronWeb.fullNode.host}/v1/contracts/${contractAddress}/events`;
        const params = new URLSearchParams({
          event_name: eventName,
          min_block_timestamp: minBlockTimestamp,
          max_block_timestamp: maxBlockTimestamp,
          limit: 100
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
      logger.error(`Error fetching TRON events for ${eventName}: ${error.message}`);
      throw error;
    }

    return events;
  }

  async syncToken(tokenSymbol, contractConfig, forceFullSync = false) {
    try {
      const { address: contractAddress, events: eventConfigs } = contractConfig;
      
      let lastSyncedBlock = 0;
      if (!forceFullSync) {
        lastSyncedBlock = await database.getLastSyncedBlock('TRON', tokenSymbol);
      }
      
      // Get current block info
      const currentBlock = await this.tronWeb.trx.getCurrentBlock();
      const currentBlockNumber = currentBlock.block_header.raw_data.number;
      const currentTimestamp = currentBlock.block_header.raw_data.timestamp;

      // If we have a last synced block and not forcing full sync, get its timestamp
      // let fromTimestamp = 1483804800000; // the first txn on TRON: January 8, 2017
      let fromTimestamp = new Date().getTime() - (365 * 24 * 60 * 60 * 1000); // Set a range to fetch latest 1 year
      if (lastSyncedBlock > 0 && !forceFullSync) {
        try {
          const lastBlock = await this.tronWeb.trx.getBlockByNumber(lastSyncedBlock);
          fromTimestamp = lastBlock.block_header.raw_data.timestamp + 1;
        } catch {
          // If we can't get the block, start from a reasonable time ago
          fromTimestamp = currentTimestamp - (30 * 24 * 60 * 60 * 1000); // 30 days ago
        }
      }

      const syncType = forceFullSync ? 'FULL' : (lastSyncedBlock > 0 ? 'INCREMENTAL' : 'INITIAL');
      logger.info(`Starting ${tokenSymbol} TRON ${syncType} sync from timestamp ${new Date(fromTimestamp).toISOString()} to ${new Date(currentTimestamp).toISOString()}`);

      // Fetch events for all configured event types
      const allEventPromises = eventConfigs.map(eventConfig => 
        this.getContractEvents(contractAddress, eventConfig.eventName, fromTimestamp, currentTimestamp)
      );

      const allEventResults = await Promise.all(allEventPromises);
      const allEvents = allEventResults.flat();
      
      if (allEvents.length > 0) {
        logger.info(`Found ${allEvents.length} events for ${tokenSymbol} on TRON`);
        
        // Sort events by block number to process in order
        allEvents.sort((a, b) => a.block_number - b.block_number);
        
        const entries = [];
        for (const event of allEvents) {
          const entry = await this.processEvent(event, tokenSymbol, eventConfigs);
          entries.push(entry);
        }
        
        if (forceFullSync) {
          // For full sync, we might want to clear existing data first
          logger.info(`Clearing existing ${tokenSymbol} TRON data before full sync`);
          await database.clearBlacklistData('TRON', tokenSymbol);
        }
        
        await database.batchUpsertBlacklistEntries(entries);
        logger.info(`Processed ${entries.length} ${tokenSymbol} TRON blacklist entries`);
      } else {
        logger.info(`No new events found for ${tokenSymbol} on TRON`);
      }

      await database.updateSyncStatus('TRON', tokenSymbol, currentBlockNumber);
      logger.info(`${tokenSymbol} TRON sync completed. Last block: ${currentBlockNumber}`);
      
    } catch (error) {
      logger.error(`Error syncing ${tokenSymbol} on TRON:`, error);
      throw error;
    }
  }

  async syncUSDT(forceFullSync = false) {
    if (!CONTRACTS.TRON.USDT) {
      logger.warn('USDT contract not configured for TRON');
      return;
    }
    await this.syncToken('USDT', CONTRACTS.TRON.USDT, forceFullSync);
  }

  async syncUSDC(forceFullSync = false) {
    if (!CONTRACTS.TRON.USDC) {
      logger.warn('USDC contract not configured for TRON');
      return;
    }
    await this.syncToken('USDC', CONTRACTS.TRON.USDC, forceFullSync);
  }

  async syncAll(forceFullSync = false) {
    logger.info(`Starting TRON ${forceFullSync ? 'FULL ' : ''}sync...`);
    
    // Sync all available tokens
    await this.syncUSDT(forceFullSync);
    await this.syncUSDC(forceFullSync);
    
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

        // Poll for events from all configured tokens
        const tokenPromises = [];
        
        if (CONTRACTS.TRON.USDT) {
          const usdtPromises = CONTRACTS.TRON.USDT.events.map(eventConfig =>
            this.getContractEvents(CONTRACTS.TRON.USDT.address, eventConfig.eventName, fromTimestamp, currentTimestamp)
          );
          tokenPromises.push(...usdtPromises.map(p => p.then(events => ({ token: 'USDT', events }))));
        }

        if (CONTRACTS.TRON.USDC) {
          const usdcPromises = CONTRACTS.TRON.USDC.events.map(eventConfig =>
            this.getContractEvents(CONTRACTS.TRON.USDC.address, eventConfig.eventName, fromTimestamp, currentTimestamp)
          );
          tokenPromises.push(...usdcPromises.map(p => p.then(events => ({ token: 'USDC', events }))));
        }

        const results = await Promise.all(tokenPromises);
        
        for (const result of results) {
          for (const event of result.events) {
            logger.info(`New TRON ${result.token} event:`, event);
            const tokenConfig = CONTRACTS.TRON[result.token];
            const entry = await this.processEvent(event, result.token, tokenConfig.events);
            await database.upsertBlacklistEntry(entry);
          }
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
  
  // Check for command line arguments
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
    
    // Also run periodic full sync to catch any missed events
    setInterval(async () => {
      await sync.syncAll(false); // Don't force full sync on periodic runs
    }, parseInt(process.env.SYNC_INTERVAL_MINUTES || '10') * 60 * 1000);
  }
}

export default TronSync; 