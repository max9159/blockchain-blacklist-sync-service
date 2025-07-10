import express from 'express';
import dotenv from 'dotenv';
import database from '../database.js';
import logger from '../logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { query: req.query, body: req.body });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get blacklist status for a specific address
app.get('/blacklist/check/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { token, network } = req.query;

    const results = await database.getBlacklistStatus(address, token, network);
    
    const response = {
      address: address.toLowerCase(),
      results: results.map(r => ({
        token: r.token,
        network: r.network,
        is_blacklisted: Boolean(r.is_blacklisted),
        block_number: r.block_number,
        timestamp: r.timestamp,
        last_updated: r.last_updated
      }))
    };

    res.json(response);
  } catch (error) {
    logger.error('Error checking blacklist status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all blacklisted addresses
app.get('/blacklist', async (req, res) => {
  try {
    const { network, token, limit = 1000, offset = 0 } = req.query;

    const results = await database.getAllBlacklisted(network, token);
    
    // Apply pagination
    const paginatedResults = results.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      total: results.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      data: paginatedResults.map(r => ({
        address: r.address,
        token: r.token,
        network: r.network,
        block_number: r.block_number,
        timestamp: r.timestamp,
        last_updated: r.last_updated
      }))
    });
  } catch (error) {
    logger.error('Error getting blacklist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics
app.get('/stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Batch check multiple addresses
app.post('/blacklist/check-batch', async (req, res) => {
  try {
    const { addresses, token, network } = req.body;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'Invalid addresses array' });
    }

    if (addresses.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 addresses per batch' });
    }

    const results = {};
    
    for (const address of addresses) {
      const status = await database.getBlacklistStatus(address, token, network);
      results[address.toLowerCase()] = status.map(r => ({
        token: r.token,
        network: r.network,
        is_blacklisted: Boolean(r.is_blacklisted),
        block_number: r.block_number,
        timestamp: r.timestamp
      }));
    }

    res.json({ results });
  } catch (error) {
    logger.error('Error in batch check:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export blacklist data
app.get('/export', async (req, res) => {
  try {
    const { network, token, format = 'json' } = req.query;

    const results = await database.getAllBlacklisted(network, token);

    if (format === 'csv') {
      const csv = [
        'address,token,network,block_number,timestamp',
        ...results.map(r => 
          `${r.address},${r.token},${r.network},${r.block_number},${r.timestamp}`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=blacklist.csv');
      res.send(csv);
    } else {
      res.json(results);
    }
  } catch (error) {
    logger.error('Error exporting data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export function startServer() {
  return app.listen(PORT, () => {
    logger.info(`API server listening on port ${PORT}`);
  });
}

// If run directly, start the server
// Use a more reliable method to detect if this is the main module
// Normalize path separators for cross-platform compatibility
const normalizedArgv = process.argv[1].replace(/\\/g, '/');
const isMainModule = import.meta.url.endsWith('src/api/server.js') && normalizedArgv.endsWith('src/api/server.js');

if (isMainModule) {
  console.log('🚀 Starting API server directly...');
  
  // Initialize database first
  database.init(process.env.DATABASE_PATH || './data/blacklist.db')
    .then(() => {
      logger.info('✅ Database initialized, starting server...');
      console.log('✅ Database initialized, starting server...');
      startServer();
      logger.info('✅ API server started successfully');
      console.log('✅ API server started successfully');
    })
    .catch(error => {
      console.error('❌ Failed to initialize API server:', error);
      logger.error('❌ Failed to initialize API server:', error);
      process.exit(1);
    });
}

export default app; 