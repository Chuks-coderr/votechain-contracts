// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * TagFilter — accessible tag-based proposal filter bar (issue #102).
 *
 * Renders a row of clickable tag buttons for each predefined taxonomy tag.
 * The active tag is highlighted and its button reports `aria-pressed="true"`.
 * Clicking the active tag again clears the filter (calls `onTagChange(null)`).
 *
 * Usage:
 *   <TagFilter selectedTag={tag} onTagChange={setTag} />
 */

import { useTranslation } from "react-i18next";

/** Predefined tag taxonomy — must stay in sync with docs/tags-taxonomy.md and
 *  the PREDEFINED_TAGS constant in backend/src/routes/proposals.ts. */
const PREDEFINED_TAGS = [
  "treasury",
  "technical",
  "community",
  "security",
  "emergency",
  "meta",
  "protocol",
  "grants",
] as const;

export type PredefinedTag = (typeof PREDEFINED_TAGS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TagFilterProps {
  /** The currently selected tag, or `null` if no tag filter is active. */
  selectedTag: string | null;
  /** Callback invoked when the user selects a tag or clears the filter. */
  onTagChange: (tag: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a labelled group of tag filter buttons.
 *
 * Accessibility:
 * - The button group has `role="group"` and a visible/accessible label via
 *   `aria-label` sourced from i18next so it can be localised.
 * - Each button has `aria-pressed` set to reflect the active state.
 */
export function TagFilter({ selectedTag, onTagChange }: TagFilterProps) {
  const { t } = useTranslation();

  function handleTagClick(tag: string) {
    // Toggle: clicking the active tag clears the filter.
    onTagChange(selectedTag === tag ? null : tag);
  }

  return (
    <div
      role="group"
      aria-label={t("Tags")}
      className="tag-filter"
    >
      <span className="tag-filter__label" aria-hidden="true">
        {t("Tags")}
      </span>

      {PREDEFINED_TAGS.map((tag) => {
        const isActive = selectedTag === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            aria-pressed={isActive}
            className={`tag-filter__button${isActive ? " tag-filter--active" : ""}`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

export default TagFilter;
