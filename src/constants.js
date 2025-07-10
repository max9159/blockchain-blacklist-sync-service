import Web3 from 'web3';
import dotenv from 'dotenv';

dotenv.config();

// Validate environment variables
function validateConfig() {
  const requiredEnvVars = {
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    
    // Check for placeholder values
    if (value.includes('YOUR_')) {
      throw new Error(`Please replace placeholder value for ${key} in your .env file with a valid API key`);
    }
  }
}

// Run validation
validateConfig();

// Contract addresses
export const CONTRACTS = {
  ETHEREUM: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  },
  TRON: {
    USDT: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'
  }
};

// Event signatures (keccak256 hashes)
const web3 = new Web3();
export const EVENTS = {
  // USDT events
  ADDED_BLACKLIST: web3.utils.keccak256('AddedBlackList(address)'),
  REMOVED_BLACKLIST: web3.utils.keccak256('RemovedBlackList(address)'),
  
  // USDC events
  BLACKLISTED: web3.utils.keccak256('Blacklisted(address)'),
  UNBLACKLISTED: web3.utils.keccak256('UnBlacklisted(address)')
};

// USDT deployment block (to optimize historical sync)
export const USDT_DEPLOYMENT_BLOCK = 4634748;

// USDC deployment block
export const USDC_DEPLOYMENT_BLOCK = 6082465;

// Database schema
export const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS blacklist (
    address TEXT NOT NULL,
    token TEXT NOT NULL,
    network TEXT NOT NULL,
    is_blacklisted BOOLEAN DEFAULT TRUE,
    block_number INTEGER,
    transaction_hash TEXT,
    timestamp INTEGER,
    first_seen INTEGER,
    last_updated INTEGER,
    PRIMARY KEY (address, token, network)
  );

  CREATE TABLE IF NOT EXISTS sync_status (
    network TEXT NOT NULL,
    token TEXT NOT NULL,
    last_synced_block INTEGER DEFAULT 0,
    last_sync_timestamp INTEGER,
    PRIMARY KEY (network, token)
  );

  CREATE INDEX IF NOT EXISTS idx_blacklist_address ON blacklist(address);
  CREATE INDEX IF NOT EXISTS idx_blacklist_status ON blacklist(is_blacklisted);
  CREATE INDEX IF NOT EXISTS idx_blacklist_network_token ON blacklist(network, token);
`; 