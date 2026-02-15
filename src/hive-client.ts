import { PrivateKey, Transaction, call, config as hiveConfig } from 'hive-tx';
import type { Config, HiveOperation } from './types.js';

const DEFAULT_NODE = 'https://api.hive.blog';
const DEFAULT_CHAIN_ID = 'beeab0de00000000000000000000000000000000000000000000000000000000';

export class HiveClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    // Set up hive-tx config
    hiveConfig.node = config.node || DEFAULT_NODE;
    hiveConfig.chain_id = config.chainId || DEFAULT_CHAIN_ID;
  }

  async call(api: string, method: string, params: any = []): Promise<unknown> {
    const fullMethod = `${api}.${method}`;
    const response = await call(fullMethod, params);
    return response;
  }

  /**
   * Poll until a transaction appears in a block or the timeout expires.
   * Hive produces a block every ~3 seconds; allow up to 30s by default.
   */
  async waitForTransaction(txId: string, timeoutMs = 30_000): Promise<unknown> {
    const pollInterval = 3_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res: any = await this.call('condenser_api', 'get_transaction', [txId]);
        const tx = res?.result ?? res;
        if (tx?.block_num) return tx;
      } catch {
        // not confirmed yet — keep polling
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error(`Transaction ${txId} not confirmed within ${timeoutMs / 1000}s`);
  }

  async broadcast(operations: HiveOperation[], keyType: 'posting' | 'active' = 'posting'): Promise<unknown> {
    const key = keyType === 'active' ? this.config.activeKey : this.config.postingKey;
    
    if (!key) {
      const envVar = keyType === 'active' ? 'HIVE_ACTIVE_KEY' : 'HIVE_POSTING_KEY';
      throw new Error(`${keyType} key is not configured. Run 'hive config' or set ${envVar}.`);
    }

    if (!this.config.account) {
      throw new Error('Account is not configured. Run "hive config" or set HIVE_ACCOUNT.');
    }

    const privateKey = (PrivateKey as any).fromString(key);
    
    const tx = new Transaction();
    await tx.create(operations.map(op => [op.type, op.value]));
    tx.sign(privateKey);
    
    const result = await tx.broadcast();
    return result;
  }
}
