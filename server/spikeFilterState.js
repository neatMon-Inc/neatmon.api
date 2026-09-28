/**
 * Data Spike Filter State
 *
 * Provides persistent MongoDB storage for Data Spike Filter state used by
 * the forwarding worker.
 *
 * State is maintained independently for each exact sensor channel:
 *
 *   guid + sensor + type
 *
 * Example:
 *
 *   guid   = af104a4d-c932-8d4e-6cc840717af8
 *   sensor = sm1-0
 *   type   = m:0
 *
 * Persisted state includes:
 *
 *   - acceptedWindow
 *   - candidateWindow
 *   - lastTimestamp
 *   - filterSignature
 *   - createdAt
 *   - updatedAt
 *
 * MongoDB is the source of truth so filter state survives:
 *
 *   - worker restarts
 *   - deployments
 *   - Redis reconnects
 *   - process crashes
 *
 * IMPORTANT:
 *
 * This collection stores filter-processing state only.
 *
 * Raw sensor values continue to be stored in the existing time-series
 * collection exactly as they were received from the device.
 *
 * This module does not implement the filter algorithm itself. That logic
 * belongs in dataSpikeFilter.js.
 */

const STATE_COLLECTION = 'dataSpikeFilterStates';


/**
 * Build the canonical MongoDB identity for one filter channel.
 *
 * The type must contain any array index used by the original sensor data.
 *
 * Examples:
 *
 *   { guid, sensor: 'ai-1', type: 'pkv' }
 *   { guid, sensor: 'sm1-0', type: 'm:0' }
 *
 * @param {string} guid Device GUID.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact sensor data type.
 * @returns {{guid:string, sensor:string, type:string}}
 */
function buildStateKey(guid, sensor, type) {
    return {
        guid,
        sensor,
        type
    };
}


/**
 * Ensure MongoDB can contain only one state document per exact sensor channel.
 *
 * Calling createIndex repeatedly is safe. MongoDB reuses the existing index
 * when the definition already exists.
 *
 * @param {Object} database MongoDB database instance.
 */
async function ensureSpikeFilterStateIndexes(database) {
    const collection =
        database.collection(STATE_COLLECTION);

    await collection.createIndex(
        {
            guid: 1,
            sensor: 1,
            type: 1
        },
        {
            unique: true,
            name: 'unique_data_spike_filter_channel'
        }
    );
}


/**
 * Load persisted Data Spike Filter state for one sensor channel.
 *
 * Returns null when no state has yet been established.
 *
 * @param {Object} database MongoDB database instance.
 * @param {string} guid Device GUID.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact sensor data type.
 * @returns {Promise<Object|null>} Existing state document.
 */
async function loadSpikeFilterState(
    database,
    guid,
    sensor,
    type
) {
    return database
        .collection(STATE_COLLECTION)
        .findOne(
            buildStateKey(
                guid,
                sensor,
                type
            )
        );
}


/**
 * Persist current Data Spike Filter state.
 *
 * The document is upserted so the same operation handles both first-time
 * initialization and normal state advancement.
 *
 * lastTimestamp is the timestamp of the latest chronological reading that
 * was allowed to advance live filter state.
 *
 * filterSignature identifies the calibration/filter settings used to produce
 * this rolling state. If those settings later change, worker.js discards the
 * old state rather than mixing incompatible models.
 *
 * @param {Object} database MongoDB database instance.
 * @param {string} guid Device GUID.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact sensor data type.
 * @param {Object} state Current filter state.
 * @param {number} lastTimestampMs Latest processed epoch timestamp in ms.
 * @param {string} filterSignature Current calibration/filter signature.
 */
async function saveSpikeFilterState(
    database,
    guid,
    sensor,
    type,
    state,
    lastTimestampMs,
    filterSignature
) {
    const now = new Date();

    await database
        .collection(STATE_COLLECTION)
        .updateOne(
            buildStateKey(
                guid,
                sensor,
                type
            ),
            {
                $set: {
                    acceptedWindow:
                        state.acceptedWindow,
                    candidateWindow:
                        state.candidateWindow,
                    lastTimestamp:
                        new Date(lastTimestampMs),
                    filterSignature,
                    updatedAt: now
                },
                $setOnInsert: {
                    createdAt: now
                }
            },
            {
                upsert: true
            }
        );
}


/**
 * Remove state for one exact sensor channel.
 *
 * State is reset when configuration affecting the filter changes. Examples:
 *
 *   - formulaString changes
 *   - deltaType changes
 *   - maxDelta changes
 *   - calibration effective dates change
 *
 * Resetting is safer than interpreting existing accepted/candidate windows
 * using a different configuration than the one that created them.
 *
 * @param {Object} database MongoDB database instance.
 * @param {string} guid Device GUID.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact sensor data type.
 */
async function resetSpikeFilterState(
    database,
    guid,
    sensor,
    type
) {
    await database
        .collection(STATE_COLLECTION)
        .deleteOne(
            buildStateKey(
                guid,
                sensor,
                type
            )
        );
}


module.exports = {
    STATE_COLLECTION,
    ensureSpikeFilterStateIndexes,
    loadSpikeFilterState,
    saveSpikeFilterState,
    resetSpikeFilterState
};