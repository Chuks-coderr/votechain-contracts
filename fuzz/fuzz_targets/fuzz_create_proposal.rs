#![no_main]

use libfuzzer_sys::fuzz_target;
use votechain_governance_fuzz::validate_proposal_params;

fuzz_target!(|data: &[u8]| {
    if data.len() < 20 {
        return;
    }

    // Parse fuzzing input
    let title_len = data[0] as usize;
    let desc_len = data[1] as usize;
    let quorum_bytes = &data[2..10];
    let duration_bytes = &data[10..18];

    let title = String::from_utf8_lossy(&data[18..18.saturating_add(title_len)]);
    let desc = String::from_utf8_lossy(&data[18.saturating_add(title_len)
        ..18.saturating_add(title_len).saturating_add(desc_len)]);

    let quorum = i64::from_le_bytes([
        quorum_bytes[0], quorum_bytes[1], quorum_bytes[2], quorum_bytes[3],
        quorum_bytes[4], quorum_bytes[5], quorum_bytes[6], quorum_bytes[7],
    ]) as i128;

    let duration = u64::from_le_bytes([
        duration_bytes[0], duration_bytes[1], duration_bytes[2], duration_bytes[3],
        duration_bytes[4], duration_bytes[5], duration_bytes[6], duration_bytes[7],
    ]);

    // Run the validation (this is what would be checked in create_proposal)
    let _result = validate_proposal_params(&title, &desc, quorum, duration);

    // In a real fuzzing harness, we would:
    // 1. Initialize a test environment
    // 2. Call create_proposal with the fuzzing inputs
    // 3. Check for panics or assertion failures
});
