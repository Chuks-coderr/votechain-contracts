import type { Meta, StoryObj } from "@storybook/react";
import { TransactionToast } from "./TransactionToast";

const HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const meta: Meta<typeof TransactionToast> = {
  title: "Components/TransactionToast",
  component: TransactionToast,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ minHeight: "200px", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TransactionToast>;

export const Pending: Story = {
  args: {
    tx: { hash: HASH, status: "pending", error: null, explorerUrl: null },
  },
};

export const Confirmed: Story = {
  args: {
    tx: {
      hash: HASH,
      status: "confirmed",
      error: null,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    },
  },
};

export const Failed: Story = {
  args: {
    tx: {
      hash: HASH,
      status: "failed",
      error: "Transaction not confirmed after 60 seconds.",
      explorerUrl: null,
    },
    onRetry: () => alert("retry clicked"),
    onDismiss: () => alert("dismiss clicked"),
  },
};
