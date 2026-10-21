import type { Meta, StoryObj } from "@storybook/react";
import { ProposalListSkeleton, ProposalDetailSkeleton } from "./Skeleton";

const meta: Meta = {
  title: "Components/Skeleton",
  tags: ["autodocs"],
};

export default meta;

export const ProposalList: StoryObj = {
  render: () => <ProposalListSkeleton />,
};

export const ProposalDetail: StoryObj = {
  render: () => <ProposalDetailSkeleton />,
};
