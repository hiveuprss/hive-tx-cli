export interface Config {
  account: string;
  postingKey?: string;
  activeKey?: string;
  node?: string;
  chainId?: string;
}

export interface HiveOperation {
  type: string;
  value: Record<string, unknown>;
}
