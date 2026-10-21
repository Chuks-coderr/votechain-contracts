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

import { Router, Request, Response } from "express";
import { PassThrough } from "stream";

const router = Router();

// ---------------------------------------------------------------------------
// GET /proposals/:id/votes.csv
// ---------------------------------------------------------------------------

/**
 * Downloads a CSV of every vote cast on a given proposal.
 *
 * Headers: proposal_id, voter, vote, weight, timestamp
 */
router.get("/proposals/:id/votes.csv", (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="proposal-${id}-votes.csv"`,
  );

  const stream = new PassThrough();
  stream.pipe(res);

  // RFC 4180 header row
  stream.write("proposal_id,voter,vote,weight,timestamp\r\n");

  // TODO: replace stub with real DB query, e.g.:
  //   const rows = await db.query(
  //     `SELECT proposal_id, voter, vote, weight, timestamp
  //      FROM votes WHERE proposal_id = $1 ORDER BY timestamp ASC`,
  //     [id],
  //   );
  //   for (const row of rows.rows) {
  //     stream.write(
  //       `${row.proposal_id},${row.voter},${row.vote},${row.weight},${row.timestamp}\r\n`,
  //     );
  //   }

  stream.end();
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
router.get("/proposals.csv", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="proposals.csv"');

  const stream = new PassThrough();
  stream.pipe(res);

  // RFC 4180 header row
  stream.write(
    "id,title,state,proposer,votes_yes,votes_no,votes_abstain,quorum,start_time,end_time\r\n",
  );

  // TODO: replace stub with real DB query, e.g.:
  //   const rows = await db.query(
  //     `SELECT id, title, state, proposer, votes_yes, votes_no, votes_abstain,
  //             quorum, start_time, end_time
  //      FROM proposals ORDER BY id ASC`,
  //   );
  //   for (const row of rows.rows) {
  //     const title = `"${String(row.title).replace(/"/g, '""')}"`;
  //     stream.write(
  //       `${row.id},${title},${row.state},${row.proposer},` +
  //       `${row.votes_yes},${row.votes_no},${row.votes_abstain},` +
  //       `${row.quorum},${row.start_time},${row.end_time}\r\n`,
  //     );
  //   }

  stream.end();
});

export default router;
