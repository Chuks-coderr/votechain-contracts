#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 16 {
        return;
    }

    // Parse fuzzing input for cast_vote
    let proposal_id_bytes = &data[0..8];
    let vote_type = data[8] % 3; // 0=Yes, 1=No, 2=Abstain

    let proposal_id = u64::from_le_bytes([
        proposal_id_bytes[0], proposal_id_bytes[1], proposal_id_bytes[2], proposal_id_bytes[3],
        proposal_id_bytes[4], proposal_id_bytes[5], proposal_id_bytes[6], proposal_id_bytes[7],
    ]);

    // In a real fuzzing harness, we would:
    // 1. Set up a test environment with an active proposal
    // 2. Call cast_vote with the fuzzing inputs
    // 3. Verify vote tallies don't overflow or underflow
    // 4. Check that vote records are immutable after being cast

    let _ = (proposal_id, vote_type);
});
