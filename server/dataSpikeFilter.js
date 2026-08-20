/**
 * Data Spike Filter
 *
 * Provides the canonical Data Spike Filter implementation used by
 * forwarded/calibrated data.
 *
 * The filter is applied AFTER the calibration formula and operates on
 * calibrated engineering values.
 *
 * Supported delta types:
 *   - absolute
 *   - percentage
 *
 * Filtering model:
 *   1. Maintain a rolling window of up to 5 accepted calibrated values.
 *   2. Compare the current value against the arithmetic mean of that window.
 *   3. Values outside the configured threshold become candidates.
 *   4. Three mutually consistent candidates establish a legitimate new level.
 *   5. On rebase, the candidate values become the new accepted baseline.
 *
 * Live forwarding differs from historical graph processing:
 * previously forwarded candidate values are not retroactively restored.
 *
 * This module contains no database access and no global mutable state.
 * Filter state is supplied by the caller.
 */

const DATA_SPIKE_WINDOW_SIZE = 5;
const DATA_SPIKE_REBASE_COUNT = 3;
const DATA_SPIKE_ZERO_BASELINE_EPSILON = 1e-12;


/**
 * Resolve the configured delta type.
 *
 * Existing/legacy calibration documents may contain a Data Spike Filter
 * without deltaType. Those documents intentionally default to "absolute".
 *
 * @param {Object|null|undefined} filter Data Spike Filter configuration.
 * @returns {'absolute'|'percentage'} Resolved delta type.
 */
function resolveDataSpikeDeltaType(filter) {
    return filter?.deltaType === 'percentage'
        ? 'percentage'
        : 'absolute';
}


/**
 * Determine whether a Data Spike Filter configuration is valid and enabled.
 *
 * The filter only runs when:
 *   - configuration exists
 *   - enabled === true
 *   - maxDelta is a positive finite number
 *
 * Invalid/missing configuration behaves as filter disabled.
 *
 * @param {Object|null|undefined} filter Data Spike Filter configuration.
 * @returns {boolean} True when the filter should run.
 */
function isDataSpikeFilterEnabled(filter) {
    return (
        filter &&
        filter.enabled === true &&
        typeof filter.maxDelta === 'number' &&
        Number.isFinite(filter.maxDelta) &&
        filter.maxDelta > 0
    );
}


/**
 * Determine whether a value can participate in Data Spike Filter state.
 *
 * Null, undefined, NaN and Infinity must never enter either the accepted
 * or candidate windows.
 *
 * @param {*} value Value to validate.
 * @returns {boolean} True when value is a finite number.
 */
function isValidCalibratedNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}


/**
 * Create caller-scoped Data Spike Filter state.
 *
 * Existing state may be supplied when restoring persisted state from MongoDB.
 * Accepted values are sanitized and trimmed to the configured window size.
 *
 * Candidate values are also sanitized, but are intentionally not inserted
 * into the accepted baseline until a legitimate level change is confirmed.
 *
 * @param {Object} seed Optional previously persisted state.
 * @returns {{acceptedWindow:number[], candidateWindow:number[]}}
 */
function createDataSpikeFilterState(seed = {}) {
    return {
        acceptedWindow: Array.isArray(seed.acceptedWindow)
            ? seed.acceptedWindow
                .filter(isValidCalibratedNumber)
                .slice(-DATA_SPIKE_WINDOW_SIZE)
            : [],

        candidateWindow: Array.isArray(seed.candidateWindow)
            ? seed.candidateWindow
                .filter(isValidCalibratedNumber)
            : []
    };
}


/**
 * Calculate the current rolling baseline.
 *
 * The baseline is the arithmetic mean of the current accepted window.
 * During startup this may contain fewer than five values.
 *
 * Examples:
 *
 *   [10]                -> 10
 *   [10, 12]            -> 11
 *   [10, 11, 12, 13, 14] -> 12
 *
 * @param {number[]} acceptedWindow Current accepted calibrated values.
 * @returns {number|null} Rolling mean, or null when no baseline exists.
 */
function computeRollingBaseline(acceptedWindow) {
    if (!acceptedWindow.length) {
        return null;
    }

    return acceptedWindow.reduce(
        (sum, value) => sum + value,
        0
    ) / acceptedWindow.length;
}


/**
 * Calculate deviation from the rolling accepted baseline.
 *
 * Absolute:
 *
 *   abs(current - baseline)
 *
 * Percentage:
 *
 *   abs(current - baseline)
 *   ----------------------- * 100
 *        abs(baseline)
 *
 * Percentage mode intentionally uses abs(baseline) so negative engineering
 * values produce meaningful positive percentage differences.
 *
 * Zero / near-zero percentage baseline:
 *
 *   - current also near zero -> deviation 0
 *   - current non-zero       -> Infinity
 *
 * The Infinity result causes the value to become a candidate for any finite
 * maxDelta.
 *
 * @param {number} current Current calibrated reading.
 * @param {number} baseline Rolling baseline.
 * @param {'absolute'|'percentage'} deltaType Delta calculation mode.
 * @returns {number} Calculated deviation.
 */
function computeDeviation(current, baseline, deltaType) {
    const absolute = Math.abs(current - baseline);

    if (deltaType === 'absolute') {
        return absolute;
    }

    const denominator = Math.abs(baseline);

    if (denominator <= DATA_SPIKE_ZERO_BASELINE_EPSILON) {
        return Math.abs(current) <= DATA_SPIKE_ZERO_BASELINE_EPSILON
            ? 0
            : Number.POSITIVE_INFINITY;
    }

    return (absolute / denominator) * 100;
}


/**
 * Determine whether a calibrated value falls within the configured threshold.
 *
 * Values exactly equal to maxDelta are accepted.
 *
 * @param {number} current Current calibrated value.
 * @param {number} baseline Current rolling baseline.
 * @param {Object} filter Data Spike Filter configuration.
 * @returns {boolean} True when the reading is acceptable.
 */
function isWithinThreshold(current, baseline, filter) {
    const deviation = computeDeviation(
        current,
        baseline,
        resolveDataSpikeDeltaType(filter)
    );

    return deviation <= filter.maxDelta;
}


/**
 * Determine whether candidate readings represent one coherent new level.
 *
 * A candidate set is considered consistent when every candidate lies within
 * the configured threshold of the candidate set's arithmetic mean.
 *
 * This prevents unrelated isolated spikes such as:
 *
 *   80, 100, 120
 *
 * from incorrectly establishing a new baseline.
 *
 * @param {number[]} candidates Candidate calibrated values.
 * @param {Object} filter Data Spike Filter configuration.
 * @returns {boolean} True when candidates describe one coherent level.
 */
function areCandidatesConsistent(candidates, filter) {
    if (candidates.length === 0) {
        return false;
    }

    if (candidates.length === 1) {
        return true;
    }

    const mean = candidates.reduce(
        (sum, value) => sum + value,
        0
    ) / candidates.length;

    return candidates.every(
        value => isWithinThreshold(value, mean, filter)
    );
}


/**
 * Add an accepted value to the rolling baseline.
 *
 * Only the most recent DATA_SPIKE_WINDOW_SIZE accepted readings are retained.
 *
 * @param {Object} state Mutable filter state.
 * @param {number} value Accepted calibrated value.
 */
function pushAccepted(state, value) {
    state.acceptedWindow.push(value);

    if (state.acceptedWindow.length > DATA_SPIKE_WINDOW_SIZE) {
        state.acceptedWindow.splice(
            0,
            state.acceptedWindow.length - DATA_SPIKE_WINDOW_SIZE
        );
    }
}


/**
 * Process one calibrated reading through the Data Spike Filter.
 *
 * State is mutated in place.
 *
 * Accepted reading:
 *
 *   {
 *       value: calibratedValue,
 *       rejected: false,
 *       rebased: false
 *   }
 *
 * Suspected spike/candidate:
 *
 *   {
 *       value: null,
 *       rejected: true,
 *       rebased: false
 *   }
 *
 * Confirmed legitimate new level:
 *
 *   {
 *       value: calibratedValue,
 *       rejected: false,
 *       rebased: true
 *   }
 *
 * Filtering behavior:
 *
 *   - First valid reading always seeds an empty baseline.
 *   - In-threshold reading is accepted and clears pending candidates.
 *   - Out-of-threshold reading becomes a candidate.
 *   - Inconsistent candidates restart the candidate sequence.
 *   - Three consistent candidates establish a new baseline.
 *
 * Invalid/non-finite values return null and do not modify state.
 *
 * NOTE:
 * Historical graph processing can retroactively restore previous candidate
 * points after a rebase. Live forwarding cannot change webhook payloads that
 * have already been emitted, therefore this function only returns the current
 * accepted/rejected decision.
 *
 * @param {*} calibratedValue Current calibrated value.
 * @param {Object} state Mutable caller-owned filter state.
 * @param {Object|null|undefined} filter Data Spike Filter configuration.
 * @returns {{value:number|null, rejected:boolean, rebased:boolean}}
 */
function applyDataSpikeFilterValue(
    calibratedValue,
    state,
    filter
) {
    /*
     * Invalid calibration output must never influence future filter state.
     */
    if (!isValidCalibratedNumber(calibratedValue)) {
        return {
            value: null,
            rejected: false,
            rebased: false
        };
    }

    /*
     * When filtering is disabled the value passes through unchanged.
     *
     * Maintaining the accepted state here makes this helper safe for callers
     * that deliberately run it regardless of enabled state, although the API
     * forwarding path normally skips state persistence when the filter is off.
     */
    if (!isDataSpikeFilterEnabled(filter)) {
        pushAccepted(state, calibratedValue);
        state.candidateWindow = [];

        return {
            value: calibratedValue,
            rejected: false,
            rebased: false
        };
    }

    /*
     * No baseline exists yet. The first valid calibrated value establishes it.
     */
    if (state.acceptedWindow.length === 0) {
        pushAccepted(state, calibratedValue);
        state.candidateWindow = [];

        return {
            value: calibratedValue,
            rejected: false,
            rebased: false
        };
    }

    const baseline = computeRollingBaseline(
        state.acceptedWindow
    );

    /*
     * Normal reading: accept it, advance the rolling baseline and discard any
     * pending candidate sequence.
     */
    if (
        isWithinThreshold(
            calibratedValue,
            baseline,
            filter
        )
    ) {
        pushAccepted(state, calibratedValue);
        state.candidateWindow = [];

        return {
            value: calibratedValue,
            rejected: false,
            rebased: false
        };
    }

    /*
     * The value is outside the established baseline.
     *
     * If candidates already exist, first determine whether this value belongs
     * to the same potential new level. If not, abandon the old candidate
     * sequence and begin a new one with the current value.
     */
    if (state.candidateWindow.length > 0) {
        const trialCandidates = [
            ...state.candidateWindow,
            calibratedValue
        ];

        if (
            !areCandidatesConsistent(
                trialCandidates,
                filter
            )
        ) {
            state.candidateWindow = [
                calibratedValue
            ];

            return {
                value: null,
                rejected: true,
                rebased: false
            };
        }
    }

    state.candidateWindow.push(calibratedValue);

    /*
     * A sustained and coherent three-reading level change is treated as real
     * sensor movement rather than a spike.
     */
    if (
        state.candidateWindow.length >= DATA_SPIKE_REBASE_COUNT &&
        areCandidatesConsistent(
            state.candidateWindow,
            filter
        )
    ) {
        state.acceptedWindow =
            state.candidateWindow.slice(
                -DATA_SPIKE_WINDOW_SIZE
            );

        state.candidateWindow = [];

        return {
            value: calibratedValue,
            rejected: false,
            rebased: true
        };
    }

    /*
     * Candidate has not yet been confirmed.
     *
     * Forward null for this live reading while preserving candidate state for
     * the next chronological reading.
     */
    return {
        value: null,
        rejected: true,
        rebased: false
    };
}


module.exports = {
    DATA_SPIKE_WINDOW_SIZE,
    DATA_SPIKE_REBASE_COUNT,
    DATA_SPIKE_ZERO_BASELINE_EPSILON,
    resolveDataSpikeDeltaType,
    isDataSpikeFilterEnabled,
    isValidCalibratedNumber,
    createDataSpikeFilterState,
    computeRollingBaseline,
    computeDeviation,
    isWithinThreshold,
    areCandidatesConsistent,
    applyDataSpikeFilterValue
};