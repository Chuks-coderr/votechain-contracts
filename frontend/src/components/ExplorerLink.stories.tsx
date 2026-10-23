import type { Meta, StoryObj } from "@storybook/react";
import { ExplorerLink, TransactionLink, AccountLink } from "./ExplorerLink";

const ADDR = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const meta: Meta = {
  title: "Components/ExplorerLink",
  tags: ["autodocs"],
};

export default meta;

export const Basic: StoryObj = {
  render: () => (
    <ExplorerLink href={`https://stellar.expert/explorer/testnet/account/${ADDR}`}>
      {ADDR}
    </ExplorerLink>
  ),
};

export const NoTruncate: StoryObj = {
  render: () => (
    <ExplorerLink
      href={`https://stellar.expert/explorer/testnet/account/${ADDR}`}
      truncate={false}
    >
      {ADDR}
    </ExplorerLink>
  ),
};

export const TxLink: StoryObj = {
  render: () => (
    <TransactionLink
      txHash={TX_HASH}
      explorerUrl={`https://stellar.expert/explorer/testnet/tx/${TX_HASH}`}
    />
  ),
};

export const AcctLink: StoryObj = {
  render: () => (
    <AccountLink
      accountAddress={ADDR}
      explorerUrl={`https://stellar.expert/explorer/testnet/account/${ADDR}`}
    />
  ),
};
