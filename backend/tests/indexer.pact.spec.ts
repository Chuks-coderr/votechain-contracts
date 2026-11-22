import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, integer, string, boolean, eachLike, decimal } = MatchersV3;

/**
 * Pact consumer contract test between the backend (consumer) and the
 * indexer REST API (provider).
 *
 * The backend depends on the indexer REST API to query indexed blockchain
 * data (e.g. transactions, accounts, and indexer health). This contract
 * captures the interactions the backend relies on so that a breaking change
 * in the indexer API is caught before deploy.
 *
 * The generated pact file is written to `backend/pacts` and can be published
 * for provider verification (see the `contract` script in package.json).
 */

const PACT_DIR = path.resolve(__dirname, '..', 'pacts');

const provider = new PactV3({
  consumer: 'backend',
  provider: 'indexer',
  dir: PACT_DIR,
  logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'warn',
});

describe('Indexer REST API contract', () => {
  describe('GET /health', () => {
    it('returns the indexer health status', async () => {
      provider
        .given('the indexer is healthy')
        .uponReceiving('a request for the indexer health status')
        .withRequest({
          method: 'GET',
          path: '/health',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            status: string('ok'),
            uptime: integer(1234),
            version: string('1.0.0'),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/health`);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          status: string;
          uptime: number;
          version: string;
        };
        expect(body.status).toBe('ok');
        expect(typeof body.uptime).toBe('number');
        expect(typeof body.version).toBe('string');
      });
    });
  });

  describe('GET /transactions/:hash', () => {
    const txHash =
      '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd';

    it('returns a single indexed transaction by hash', async () => {
      provider
        .given('a transaction with the given hash exists')
        .uponReceiving('a request for a transaction by hash')
        .withRequest({
          method: 'GET',
          path: `/transactions/${txHash}`,
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            hash: string(txHash),
            blockNumber: integer(100),
            from: string('0x0000000000000000000000000000000000000001'),
            to: string('0x0000000000000000000000000000000000000002'),
            value: string('1000000000000000000'),
            status: string('success'),
            timestamp: integer(1700000000),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/transactions/${txHash}`);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          hash: string;
          blockNumber: number;
          from: string;
          to: string;
          value: string;
          status: string;
          timestamp: number;
        };
        expect(body.hash).toBe(txHash);
        expect(typeof body.blockNumber).toBe('number');
        expect(typeof body.from).toBe('string');
        expect(typeof body.to).toBe('string');
        expect(typeof body.value).toBe('string');
        expect(typeof body.status).toBe('string');
        expect(typeof body.timestamp).toBe('number');
      });
    });

    it('returns 404 when the transaction does not exist', async () => {
      provider
        .given('a transaction with the given hash does not exist')
        .uponReceiving('a request for a non-existent transaction by hash')
        .withRequest({
          method: 'GET',
          path: `/transactions/${txHash}`,
        })
        .willRespondWith({
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            error: string('not_found'),
            message: string('Transaction not found'),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/transactions/${txHash}`);
        expect(response.status).toBe(404);

        const body = (await response.json()) as {
          error: string;
          message: string;
        };
        expect(body.error).toBe('not_found');
        expect(typeof body.message).toBe('string');
      });
    });
  });

  describe('GET /accounts/:address/transactions', () => {
    const address = '0x0000000000000000000000000000000000000001';

    it('returns a paginated list of transactions for an account', async () => {
      provider
        .given('an account with the given address has transactions')
        .uponReceiving('a request for an account transaction list')
        .withRequest({
          method: 'GET',
          path: `/accounts/${address}/transactions`,
          query: {
            page: '1',
            limit: '20',
          },
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            items: eachLike({
              hash: string(
                '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
              ),
              blockNumber: integer(100),
              from: string(address),
              to: string('0x0000000000000000000000000000000000000002'),
              value: string('1000000000000000000'),
              status: string('success'),
              timestamp: integer(1700000000),
            }),
            page: integer(1),
            limit: integer(20),
            total: integer(1),
            hasMore: boolean(false),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const response = await fetch(
          `${mockServer.url}/accounts/${address}/transactions?page=1&limit=20`,
        );
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          items: Array<{
            hash: string;
            blockNumber: number;
            from: string;
            to: string;
            value: string;
            status: string;
            timestamp: number;
          }>;
          page: number;
          limit: number;
          total: number;
          hasMore: boolean;
        };
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items.length).toBeGreaterThan(0);
        expect(typeof body.items[0].hash).toBe('string');
        expect(typeof body.items[0].blockNumber).toBe('number');
        expect(typeof body.page).toBe('number');
        expect(typeof body.limit).toBe('number');
        expect(typeof body.total).toBe('number');
        expect(typeof body.hasMore).toBe('boolean');
      });
    });
  });

  describe('GET /stats', () => {
    it('returns indexer statistics', async () => {
      provider
        .given('the indexer has indexed data')
        .uponReceiving('a request for indexer statistics')
        .withRequest({
          method: 'GET',
          path: '/stats',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            latestBlock: integer(1000),
            indexedTransactions: integer(50000),
            indexedAccounts: integer(10000),
            syncProgress: decimal(0.99),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/stats`);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          latestBlock: number;
          indexedTransactions: number;
          indexedAccounts: number;
          syncProgress: number;
        };
        expect(typeof body.latestBlock).toBe('number');
        expect(typeof body.indexedTransactions).toBe('number');
        expect(typeof body.indexedAccounts).toBe('number');
        expect(typeof body.syncProgress).toBe('number');
      });
    });
  });
});