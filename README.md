# Blockchain Blacklist Harvester

A real-time blockchain blacklist harvesting system that pulls blacklisted addresses directly from USDT and USDC smart contracts on Ethereum and TRON networks.

## Features

- **Real-time Sync**: Continuously monitors and syncs blacklist events from blockchain
- **Historical Data**: Fetches all historical blacklist events from contract deployment
- **Multi-Network Support**: Supports Ethereum (USDT, USDC) and TRON (USDT)
- **REST API**: Provides easy access to blacklist data via RESTful endpoints
- **Data Validation**: Built-in validation tools to cross-check data accuracy
- **Incremental Updates**: Efficient syncing that only fetches new events
- **Export Functionality**: Export blacklist data in JSON or CSV format

## Quick Start

### Prerequisites

- Node.js 18+ 
- Ethereum RPC endpoint (Infura, Alchemy, QuickNode, etc.)
- TRON Grid API key (optional, for better rate limits)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp env.example .env
```

3. Edit `.env` with your configuration:
```env
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
TRON_GRID_API_KEY=YOUR_TRON_KEY
DATABASE_PATH=./data/blacklist.db
PORT=3000
CHUNK_SIZE=10000
SYNC_INTERVAL_MINUTES=10
```

### Running the Application

#### Option 1: Direct Node.js

```bash
# Run full sync for all networks
npm start

# Run Ethereum only
npm run start:ethereum

# Run TRON only  
npm run start:tron

# Run one-time sync (no continuous monitoring)
npm run start:all --once
```

#### Option 2: Docker

```bash
# Build and run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## API Endpoints

### Check Single Address
```bash
GET /blacklist/check/:address?network=ETHEREUM&token=USDT

Response:
{
  "address": "0x...",
  "results": [{
    "token": "USDT",
    "network": "ETHEREUM",
    "is_blacklisted": true,
    "block_number": 12345678,
    "timestamp": 1234567890,
    "last_updated": 1234567890
  }]
}
```

### Batch Check Addresses
```bash
POST /blacklist/check-batch
Content-Type: application/json

{
  "addresses": ["0x...", "0x..."],
  "network": "ETHEREUM",
  "token": "USDT"
}
```

### Get All Blacklisted Addresses
```bash
GET /blacklist?network=ETHEREUM&token=USDT&limit=100&offset=0
```

### Export Data
```bash
GET /export?network=ETHEREUM&token=USDT&format=csv
```

### Statistics
```bash
GET /stats

Response:
{
  "stats": [{
    "network": "ETHEREUM",
    "token": "USDT",
    "blacklisted_count": 1234,
    "total_count": 1500
  }],
  "syncStatus": [{
    "network": "ETHEREUM",
    "token": "USDT",
    "last_synced_block": 18500000,
    "last_sync_timestamp": 1234567890
  }]
}
```

## Validation Tools

### Validate Random Sample
```bash
node src/utils/validate.js sample 50
```

### Validate Specific Address
```bash
node src/utils/validate.js address 0x123... ETHEREUM USDT
```

### Generate Validation Report
```bash
node src/utils/validate.js report
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Ethereum RPC   │     │   TRON RPC      │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Ethereum Sync   │     │   TRON Sync     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
              ┌─────────────┐
              │   SQLite    │
              │  Database   │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │  REST API   │
              │   Server    │
              └─────────────┘
```

## Database Schema

### blacklist table
- `address` (TEXT): Blockchain address
- `token` (TEXT): Token symbol (USDT/USDC)
- `network` (TEXT): Network name (ETHEREUM/TRON)
- `is_blacklisted` (BOOLEAN): Current blacklist status
- `block_number` (INTEGER): Block where event occurred
- `transaction_hash` (TEXT): Transaction hash
- `timestamp` (INTEGER): Block timestamp
- `first_seen` (INTEGER): First time address was seen
- `last_updated` (INTEGER): Last update timestamp

### sync_status table
- `network` (TEXT): Network name
- `token` (TEXT): Token symbol
- `last_synced_block` (INTEGER): Last processed block
- `last_sync_timestamp` (INTEGER): Last sync time

## Performance Considerations

- **Chunk Size**: Adjust `CHUNK_SIZE` based on your RPC provider limits
- **Rate Limiting**: Built-in delays to avoid RPC rate limits
- **Parallel Processing**: Ethereum and TRON sync run in parallel
- **Database Indexing**: Optimized indexes for fast queries

## Troubleshooting

### Common Issues

1. **RPC Rate Limiting**
   - Reduce `CHUNK_SIZE` in `.env`
   - Add delays between requests
   - Use a premium RPC endpoint

2. **Memory Issues**
   - Process smaller chunks
   - Increase Node.js memory: `node --max-old-space-size=4096`

3. **Sync Failures**
   - Check RPC endpoint connectivity
   - Verify API keys are correct
   - Check logs in `./logs` directory

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Based on the approach outlined in the blockchain blacklist harvesting guide
- Uses Web3.js for Ethereum interaction
- Uses TronWeb for TRON interaction 