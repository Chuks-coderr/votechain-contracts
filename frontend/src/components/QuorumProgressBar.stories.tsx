import type { Meta, StoryObj } from "@storybook/react";
import QuorumProgressBar from "./QuorumProgressBar";

const meta: Meta<typeof QuorumProgressBar> = {
  title: "Components/QuorumProgressBar",
  component: QuorumProgressBar,
  tags: ["autodocs"],
  argTypes: {
    totalVotes: { control: { type: "number", min: 0 } },
    quorum: { control: { type: "number", min: 1 } },
    showExactNumbers: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof QuorumProgressBar>;

export const NotStarted: Story = {
  args: { totalVotes: 0, quorum: 5_000_000 },
};

export const LowProgress: Story = {
  args: { totalVotes: 1_000_000, quorum: 5_000_000 },
};

export const HalfWay: Story = {
  args: { totalVotes: 2_500_000, quorum: 5_000_000 },
};

export const NearlyMet: Story = {
  args: { totalVotes: 4_800_000, quorum: 5_000_000 },
};

export const QuorumMet: Story = {
  args: { totalVotes: 5_000_000, quorum: 5_000_000 },
};

export const ExceededWithNumbers: Story = {
  args: { totalVotes: 6_200_000, quorum: 5_000_000, showExactNumbers: true },
};
