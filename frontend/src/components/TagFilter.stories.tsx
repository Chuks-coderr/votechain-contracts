import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TagFilter } from "./TagFilter";

const meta: Meta<typeof TagFilter> = {
  title: "Components/TagFilter",
  component: TagFilter,
  tags: ["autodocs"],
};

export default meta;

export const NoSelection: StoryObj<typeof TagFilter> = {
  args: { selectedTag: null, onTagChange: () => {} },
};

export const WithSelection: StoryObj<typeof TagFilter> = {
  args: { selectedTag: "treasury", onTagChange: () => {} },
};

export const Interactive: StoryObj<typeof TagFilter> = {
  render: () => {
    const [tag, setTag] = useState<string | null>(null);
    return (
      <div>
        <TagFilter selectedTag={tag} onTagChange={setTag} />
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#6b7280" }}>
          Active tag: <strong>{tag ?? "none"}</strong>
        </p>
      </div>
    );
  },
};
