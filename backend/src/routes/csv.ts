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
 * CSV export routes for proposal history.
 *
 * GET /proposals/:id/votes.csv  — streams all votes for a single proposal
 * GET /proposals.csv            — streams summary data for all proposals
 *
 * Both endpoints are RFC 4180 compliant, UTF-8 encoded, and stream the
 * response rather than buffering it in memory.
 *
 * Replace the TODO stubs with real DB / indexer queries once the data layer
 * is wired up.
 */

import { Router, Response } from "express";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { log } from "../middleware/requestTracing";
import { csvExportRateLimit } from "../middleware/csvExportRateLimit";

const router = Router();
const MAX_CSV_EXPORT_ROWS = 10_000;

/**
 * Streams rows as CSV with backpressure, capped at `maxRows` (#522).
 *
 * X-Record-Count / X-Truncated are headers when the source is an array (size
 * known up front) and HTTP trailers otherwise.
 */
export async function sendCsv<T>(
  res: Response,
  filename: string,
  columns: string,
  rows: Iterable<T> | AsyncIterable<T>,
  formatRow: (row: T) => string,
  maxRows = MAX_CSV_EXPORT_ROWS,
): Promise<void> {
  let count = 0;
  let truncated = false;

  async function* capped() {
    for await (const row of rows) {
      if (count >= maxRows) {
        truncated = true;
        return; // closes the source cursor
      }
      count++;
      yield row;
    }
  }

  const known = Array.isArray(rows);
  if (known) {
    res.setHeader("X-Record-Count", Math.min(rows.length, maxRows));
    if (rows.length > maxRows) res.setHeader("X-Truncated", "true");
  } else {
    res.setHeader("Trailer", "X-Record-Count, X-Truncated");
  }

  const toCsv = new Transform({
    writableObjectMode: true,
    construct(callback) {
      this.push(`${columns}\r\n`);
      callback();
    },
    transform(row: T, _encoding, callback) {
      try {
        callback(null, `${formatRow(row)}\r\n`);
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      if (!known) {
        res.addTrailers({
          "X-Record-Count": String(count),
          "X-Truncated": String(truncated),
        });
      }
      callback();
    },
  });

  try {
    await pipeline(Readable.from(capped(), { highWaterMark: 16 }), toCsv, res);
  } catch (error) {
    // Source failure or client disconnect; pipeline has destroyed the streams.
    log("error", "CSV export aborted", { error: String(error) });
  }
}

// ---------------------------------------------------------------------------
// GET /proposals/:id/votes.csv
// ---------------------------------------------------------------------------

/**
 * Downloads a CSV of every vote cast on a given proposal.
 *
 * Headers: proposal_id, voter, vote, weight, timestamp
 */
router.get("/proposals/:id/votes.csv", csvExportRateLimit, async (req, res) => {
  const { id } = req.params;

  // TODO: replace the empty source with a database cursor, e.g.:
  //   const rows = await db.query(
  //     `SELECT proposal_id, voter, vote, weight, timestamp
  //      FROM votes WHERE proposal_id = $1 ORDER BY timestamp ASC LIMIT 10001`,
  //     [id],
  //   );
  await sendCsv(
    res,
    `proposal-${id}-votes.csv`,
    "proposal_id,voter,vote,weight,timestamp",
    [],
    (row: { proposal_id: string; voter: string; vote: string; weight: number; timestamp: string }) =>
      `${row.proposal_id},${row.voter},${row.vote},${row.weight},${row.timestamp}`,
  );
});

// ---------------------------------------------------------------------------
// GET /proposals.csv
// ---------------------------------------------------------------------------

/**
 * Downloads a CSV summary of all proposals.
 *
 * Headers: id, title, state, proposer, votes_yes, votes_no, votes_abstain,
 *          quorum, start_time, end_time
 */
router.get("/proposals.csv", csvExportRateLimit, async (_req, res) => {
  // TODO: replace the empty source with a database cursor, e.g.:
  //   const rows = await db.query(
  //     `SELECT id, title, state, proposer, votes_yes, votes_no, votes_abstain,
  //             quorum, start_time, end_time
  //      FROM proposals ORDER BY id ASC LIMIT 10001`,
  //   );
  await sendCsv(
    res,
    "proposals.csv",
    "id,title,state,proposer,votes_yes,votes_no,votes_abstain,quorum,start_time,end_time",
    [],
    (row: {
      id: string;
      title: string;
      state: string;
      proposer: string;
      votes_yes: number;
      votes_no: number;
      votes_abstain: number;
      quorum: number;
      start_time: string;
      end_time: string;
    }) =>
      `${row.id},"${row.title.replace(/"/g, '""')}",${row.state},${row.proposer},` +
      `${row.votes_yes},${row.votes_no},${row.votes_abstain},${row.quorum},` +
      `${row.start_time},${row.end_time}`,
  );
});

export default router;
