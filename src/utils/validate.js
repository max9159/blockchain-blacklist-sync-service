import Web3 from 'web3';
import TronWeb from 'tronweb';
import dotenv from 'dotenv';
import database from '../database.js';
import logger from '../logger.js';
import { CONTRACTS } from '../constants.js';

dotenv.config();

class Validator {
  constructor() {
    this.web3 = new Web3(process.env.ETHEREUM_RPC_URL);
    this.tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
      headers: { 'TRON-PRO-API-KEY': process.env.TRON_GRID_API_KEY }
    });
  }

  async validateEthereumAddress(address, token) {
    try {
      // For USDT and USDC, we can call the isBlacklisted function
      const abi = [
        {
          "constant": true,
          "inputs": [{"name": "_address", "type": "address"}],
          "name": "isBlacklisted",
          "outputs": [{"name": "", "type": "bool"}],
          "type": "function"
        }
      ];

      const contractAddress = token === 'USDT' ? 
        CONTRACTS.ETHEREUM.USDT : CONTRACTS.ETHEREUM.USDC;

      const contract = new this.web3.eth.Contract(abi, contractAddress);
      const isBlacklisted = await contract.methods.isBlacklisted(address).call();

      return { address, token, network: 'ETHEREUM', isBlacklisted };
    } catch (error) {
      logger.error(`Error validating Ethereum address ${address}:`, error);
      return null;
    }
  }

  async validateTronAddress(address, token) {
    try {
      // Convert address format if needed
      const tronAddress = this.tronWeb.address.fromHex(address);
      
      // Get contract instance
      const contract = await this.tronWeb.contract().at(CONTRACTS.TRON.USDT);
      
      // Call isBlackListed function
      const isBlacklisted = await contract.isBlackListed(tronAddress).call();

      return { address, token, network: 'TRON', isBlacklisted };
    } catch (error) {
      logger.error(`Error validating TRON address ${address}:`, error);
      return null;
    }
  }

  async validateRandomSample(sampleSize = 50) {
    logger.info(`Validating random sample of ${sampleSize} addresses...`);

    // Get random blacklisted addresses from database
    const allBlacklisted = await database.getAllBlacklisted();
    
    // Shuffle and take sample
    const shuffled = allBlacklisted.sort(() => 0.5 - Math.random());
    const sample = shuffled.slice(0, Math.min(sampleSize, shuffled.length));

    const results = {
      total: sample.length,
      validated: 0,
      matches: 0,
      mismatches: [],
      errors: []
    };

    for (const entry of sample) {
      let validation = null;

      if (entry.network === 'ETHEREUM') {
        validation = await this.validateEthereumAddress(entry.address, entry.token);
      } else if (entry.network === 'TRON') {
        validation = await this.validateTronAddress(entry.address, entry.token);
      }

      if (validation) {
        results.validated++;
        
        const dbStatus = Boolean(entry.is_blacklisted);
        const chainStatus = validation.isBlacklisted;

        if (dbStatus === chainStatus) {
          results.matches++;
        } else {
          results.mismatches.push({
            address: entry.address,
            token: entry.token,
            network: entry.network,
            dbStatus,
            chainStatus
          });
        }
      } else {
        results.errors.push({
          address: entry.address,
          token: entry.token,
          network: entry.network
        });
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Calculate accuracy
    results.accuracy = results.validated > 0 ? 
      (results.matches / results.validated * 100).toFixed(2) + '%' : 'N/A';

    return results;
  }

  async compareWithEtherscan(address, token) {
    // This would require Etherscan API key and implementation
    // For now, just log that this feature could be added
    logger.info('Etherscan comparison not implemented yet');
    return null;
  }

  async generateReport() {
    logger.info('Generating validation report...');

    const stats = await database.getStats();
    const validationResults = await this.validateRandomSample();

    const report = {
      timestamp: new Date().toISOString(),
      databaseStats: stats,
      validationResults,
      recommendations: []
    };

    // Add recommendations based on results
    if (validationResults.accuracy !== '100.00%' && validationResults.mismatches.length > 0) {
      report.recommendations.push('Re-sync affected addresses');
      report.recommendations.push('Check for recent contract upgrades');
    }

    if (validationResults.errors.length > 0) {
      report.recommendations.push('Investigate RPC connectivity issues');
      report.recommendations.push('Verify contract addresses are correct');
    }

    return report;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new Validator();
  
  await database.init(process.env.DATABASE_PATH || './data/blacklist.db');
  
  const command = process.argv[2] || 'report';

  switch (command) {
    case 'sample':
      const sampleSize = parseInt(process.argv[3]) || 50;
      const results = await validator.validateRandomSample(sampleSize);
      console.log('Validation Results:', JSON.stringify(results, null, 2));
      break;

    case 'address':
      const address = process.argv[3];
      const network = process.argv[4] || 'ETHEREUM';
      const token = process.argv[5] || 'USDT';
      
      if (!address) {
        console.error('Please provide an address to validate');
        process.exit(1);
      }

      let result;
      if (network === 'ETHEREUM') {
        result = await validator.validateEthereumAddress(address, token);
      } else if (network === 'TRON') {
        result = await validator.validateTronAddress(address, token);
      }
      
      console.log('Validation Result:', result);
      break;

    case 'report':
    default:
      const report = await validator.generateReport();
      console.log('Validation Report:', JSON.stringify(report, null, 2));
      break;
  }

  await database.close();
}

export default Validator; 