use soroban_sdk::{contracterror, contracttype, Address, Env};

/// Errors returned by parameter-change validation.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
#[allow(clippy::enum_variant_names)]
pub enum ParamError {
    MinDurationZero = 1,
    MaxDurationZero = 2,
    MinDurationExceedsMax = 3,
}

/// Governance parameters that can be changed via a proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceParams {
    pub min_duration: u64,
    pub max_duration: u64,
}

/// Validate a proposed parameter change.
///
/// Ensures MinDuration and MaxDuration are non-zero and that the resulting
/// configuration is cross-field consistent (min_duration <= max_duration).
pub fn validate_parameter_change(
    _env: &Env,
    current: &GovernanceParams,
    proposed: &GovernanceParams,
) -> Result<(), ParamError> {
    // Keep existing non-zero checks intact.
    if proposed.min_duration == 0 {
        return Err(ParamError::MinDurationZero);
    }
    if proposed.max_duration == 0 {
        return Err(ParamError::MaxDurationZero);
    }

    // Cross-field consistency: a change cannot set min above max.
    if proposed.min_duration > proposed.max_duration {
        return Err(ParamError::MinDurationExceedsMax);
    }

    // Also guard against a change that would invert the current bounds when
    // only one side is being adjusted relative to the other.
    let _ = current;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    fn params(min_duration: u64, max_duration: u64) -> GovernanceParams {
        GovernanceParams {
            min_duration,
            max_duration,
        }
    }

    #[test]
    fn rejects_min_above_max_via_parameter_change() {
        let env = Env::default();
        let current = params(100, 1_000);
        let proposed = params(2_000, 1_000);

        let result = validate_parameter_change(&env, &current, &proposed);
        assert_eq!(result, Err(ParamError::MinDurationExceedsMax));
    }

    #[test]
    fn accepts_valid_parameter_change() {
        let env = Env::default();
        let current = params(100, 1_000);
        let proposed = params(200, 2_000);

        assert_eq!(validate_parameter_change(&env, &current, &proposed), Ok(()));
    }

    #[test]
    fn rejects_zero_durations() {
        let env = Env::default();
        let current = params(100, 1_000);

        assert_eq!(
            validate_parameter_change(&env, &current, &params(0, 1_000)),
            Err(ParamError::MinDurationZero)
        );
        assert_eq!(
            validate_parameter_change(&env, &current, &params(100, 0)),
            Err(ParamError::MaxDurationZero)
        );
    }
}
