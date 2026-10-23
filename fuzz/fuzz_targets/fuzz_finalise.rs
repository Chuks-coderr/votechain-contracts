#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 16 {
        return;
    }

    // Parse fuzzing input for finalise
    let proposal_id_bytes = &data[0..8];
    let votes_yes_bytes = &data[8..16];

    let proposal_id = u64::from_le_bytes([
        proposal_id_bytes[0], proposal_id_bytes[1], proposal_id_bytes[2], proposal_id_bytes[3],
        proposal_id_bytes[4], proposal_id_bytes[5], proposal_id_bytes[6], proposal_id_bytes[7],
    ]);

    let votes_yes = i64::from_le_bytes([
        votes_yes_bytes[0], votes_yes_bytes[1], votes_yes_bytes[2], votes_yes_bytes[3],
        votes_yes_bytes[4], votes_yes_bytes[5], votes_yes_bytes[6], votes_yes_bytes[7],
    ]) as i128;

    // In a real fuzzing harness, we would:
    // 1. Set up multiple test scenarios with different vote distributions
    // 2. Call finalise with the fuzzing inputs
    // 3. Verify:
    //    - Quorum calculation doesn't overflow
    //    - Majority logic is correctly applied (yes > no)
    //    - Abstain votes are counted in quorum but not majority
    //    - State transitions are correct (Active -> Passed/Rejected)
    //    - The total_supply_snapshot is used for quorum validation

    let _ = (proposal_id, votes_yes);
});
