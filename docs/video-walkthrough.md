# Video Walkthrough for First-Time Contributors

> **Status: Placeholder — video pending recording**
>
> This document describes the intended content of the upcoming screen-recording,
> provides a full transcript template for accessibility, and reserves the link
> location so that CONTRIBUTING.md and docs/GETTING_STARTED.md always point to a
> stable URL.  Maintainers should record the video, upload it, and replace the
> placeholder links below.

---

## Video Overview

| Field | Value |
|-------|-------|
| **Status** | 🎬 Pending recording |
| **Target length** | ~10 minutes |
| **Format** | Screen recording with narration |
| **Covers** | Clone → install dependencies → run tests → make a small change → run tests again |
| **YouTube URL** | *(to be added by maintainers — replace this line with the full URL)* |
| **Direct download** | *(to be added — e.g. `docs/media/votechain-contributor-walkthrough.mp4`)* |

Once the video is recorded and uploaded, replace the placeholder values in the
table above and remove this notice.

---

## Intended Content

The recording will walk through the complete new-contributor setup in a single
continuous session, covering:

1. **Clone the repository**
   - `git clone https://github.com/veracindarella/votechain-contracts.git`
   - Overview of the top-level directory structure

2. **Install dependencies**
   - Install Rust + cargo via `rustup`
   - Add the `wasm32-unknown-unknown` target
   - Install the Stellar CLI (`cargo install --locked stellar-cli@22.8.2`)
   - Verify each tool with `--version`

3. **Run the test suite**
   - `make test`
   - Walk through the output: how many tests, what they cover
   - Confirm all tests pass

4. **Make a small change**
   - Open `contracts/governance/src/lib.rs` in an editor
   - Add a trivial doc-comment to one function (e.g., `/// Returns the total number of proposals.`)
   - Demonstrate `make fmt` and `make lint`

5. **Run tests again**
   - `make test` — confirm nothing broke
   - Discuss what a failing test looks like and how to read the error

---

## Transcript

The transcript below mirrors the intended narration of the recording, section by
section.  It is provided here so that the walkthrough is fully accessible to
contributors who are deaf or hard of hearing, prefer reading, or cannot stream
video.

---

### [00:00 – 00:30] Introduction

> "Welcome to VoteChain! In this walkthrough I'm going to show you how to go
> from zero to your first contribution in about ten minutes.  We'll clone the
> repo, install the dependencies, run the full test suite, make a small change,
> and run the tests one more time to confirm nothing broke.  Let's get started."

---

### [00:30 – 01:30] Cloning the Repository

> "First, open a terminal.  We'll clone the VoteChain repository from GitHub."

```bash
git clone https://github.com/veracindarella/votechain-contracts.git
cd votechain-contracts
```

> "Now let me give you a quick tour of the project layout.  At the top level
> you'll see a `contracts/` directory — that holds the two Soroban smart
> contracts: `governance` and `token`.  There's a `docs/` directory with
> Architecture Decision Records and guides, a `scripts/` directory for
> deployment helpers, and a `Makefile` that wraps the most common commands.
> Almost everything you'll do during development goes through `make`."

---

### [01:30 – 04:00] Installing Dependencies

> "Let's install the tools we need.  If you already have Rust installed you can
> skip the first step."

**Install Rust:**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Follow the on-screen prompts, then restart your terminal.
rustc --version   # should print 1.75.0 or later
cargo --version
```

**Add the WebAssembly target:**

```bash
rustup target add wasm32-unknown-unknown
# Verify it appears in the list:
rustup target list | grep wasm32-unknown-unknown
```

> "Soroban contracts compile to WebAssembly, so Cargo needs this target to build
> them."

**Install the Stellar CLI (pinned version):**

```bash
cargo install --locked stellar-cli@22.8.2
stellar --version   # must print 22.8.2
```

> "We pin the CLI to a specific version to keep everyone's environment
> consistent.  The required version is always documented in the Makefile and
> README."

---

### [04:00 – 05:30] Running the Test Suite

> "Now let's run the tests to confirm the environment is set up correctly."

```bash
make test
```

> "Cargo compiles both contracts and runs all unit tests.  On the first run this
> can take a minute or two because it downloads and compiles dependencies.
> Subsequent runs are much faster thanks to the build cache."
>
> "When everything passes you'll see a line that looks like this:"

```
test result: ok. 45 passed; 0 failed; 0 ignored
```

> "Forty-five tests, zero failures — we're good.  If you see any failures here
> on a fresh clone, please open a GitHub issue so we can investigate."

---

### [05:30 – 08:00] Making a Small Change

> "Now let's make a small, safe change to prove the workflow end-to-end.  I'll
> add a documentation comment to one of the public functions in the governance
> contract."

Open `contracts/governance/src/lib.rs` in your editor and find the
`proposal_count` function:

```rust
pub fn proposal_count(env: Env) -> u64 {
    storage::proposal_count(&env)
}
```

Add a doc-comment above it:

```rust
/// Returns the total number of proposals ever created.
pub fn proposal_count(env: Env) -> u64 {
    storage::proposal_count(&env)
}
```

> "Now let's run the formatter and linter to make sure the change is clean."

```bash
make fmt
make lint
```

> "No warnings, no errors.  Let's also generate the docs to see the comment
> rendered:"

```bash
cargo doc --no-deps --open
```

> "You can see the new doc-comment appears in the rendered HTML.  This is the
> kind of small, incremental improvement that makes a great first contribution."

---

### [08:00 – 09:00] Running Tests Again

> "Always run the full test suite after any change, no matter how small."

```bash
make test
```

> "All forty-five tests still pass.  The doc-comment didn't break anything —
> which is exactly what we expected, but it's important to verify."

---

### [09:00 – 09:45] Committing and Opening a Pull Request

> "Let's commit the change using the Conventional Commits format."

```bash
git add contracts/governance/src/lib.rs
git commit -m "docs(governance): add doc-comment to proposal_count"
git push origin feature/my-first-change
```

> "Then go to GitHub, open a pull request against `main`, fill in the PR
> template, and reference any related issue.  A maintainer will review it
> and merge it once CI passes."

---

### [09:45 – 10:00] Wrap-Up

> "That's the full workflow — clone, install, test, change, test again, commit,
> and PR.  For more detail on any of these steps, see the
> [Getting Started guide](GETTING_STARTED.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
> Happy coding!"

---

## Accessibility

This document serves as the permanent transcript for the video.  If you find any
discrepancy between the video narration and the transcript, please open an issue
so we can keep them in sync.

Captions files are stored alongside this document:

| Format | File | Use |
|--------|------|-----|
| WebVTT | [`docs/media/votechain-contributor-walkthrough.vtt`](media/votechain-contributor-walkthrough.vtt) | HTML `<track>` element, YouTube, most modern video players |
| SubRip | [`docs/media/votechain-contributor-walkthrough.srt`](media/votechain-contributor-walkthrough.srt) | VLC, legacy players, Kdenlive, DaVinci Resolve |

When the video is uploaded to YouTube:
1. Go to **YouTube Studio → Subtitles → Add language → English**.
2. Choose **Upload file → With timing** and upload the `.vtt` file.
3. Review the auto-matched timings and correct any drift before publishing.

Requests for alternative formats (audio description, large-print transcript,
translated captions, etc.) can be made via a GitHub issue.

---

## Recording & Uploading (Maintainer Notes)

Once you are ready to record:

1. Use a screen recorder with microphone capture (e.g., OBS Studio, QuickTime,
   or Loom).
2. Follow the transcript above as a script.  Small deviations are fine; just
   update the transcript to match.
3. Export to MP4 (1080p, ≤ 150 MB) or upload the raw file to YouTube as
   unlisted first for review.
4. Once the video is public, update the **YouTube URL** and **Direct download**
   fields in the table at the top of this file.
5. Update the link in `CONTRIBUTING.md` and `docs/GETTING_STARTED.md` if the
   placeholder URL changed.
6. Commit the updated `docs/video-walkthrough.md` and open a PR against `main`.
