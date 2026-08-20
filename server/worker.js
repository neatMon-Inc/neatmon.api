/**
 * neatMon Device Data Worker
 *
 * Processes device data jobs received through the Bull data queue.
 *
 * Primary responsibilities:
 *
 *   1. Receive device payloads from the queue.
 *   2. Convert incoming sensor data into MongoDB time-series documents.
 *   3. Forward device payloads to configured third-party web services.
 *   4. Apply calibration formulas to forwarded values.
 *   5. Apply the optional Data Spike Filter to forwarded calibrated values.
 *   6. Maintain device/sensor configuration metadata.
 *   7. Store the original raw sensor values in MongoDB.
 *
 * IMPORTANT DATA OWNERSHIP RULE:
 *
 * Calibration and Data Spike Filtering affect the third-party forwarding
 * payload only.
 *
 * Raw device readings stored in MongoDB must remain unchanged so that:
 *
 *   - calibration formulas can be changed later
 *   - historical data can be recalculated
 *   - spike thresholds can be changed
 *   - troubleshooting can inspect original device measurements
 */

require('dotenv').config({});

const bull = require('bull');
const { json } = require('express');
const axios = require('axios');
const ObjectId = require('bson').ObjectId;
const math = require('mathjs');
const MongoClient = require('mongodb').MongoClient;

const {
    isDataSpikeFilterEnabled,
    isValidCalibratedNumber,
    createDataSpikeFilterState,
    applyDataSpikeFilterValue
} = require('./dataSpikeFilter');

const {
    ensureSpikeFilterStateIndexes,
    loadSpikeFilterState,
    saveSpikeFilterState,
    resetSpikeFilterState
} = require('./spikeFilterState');


/**
 * ============================================================
 * ENVIRONMENT CONFIGURATION
 * ============================================================
 */

const FROM_NEATMON_IO = process.env.FROM_NEATMON_IO;

const CONNECTION_URL =
    process.env.MONGO_URL;

const DATABASE_NAME =
    process.env.MONGO_DATABASE_NAME;

const DATABASE_COLLECTION =
    process.env.MONGO_DATABASE_COLLECTION_DATA;

const DATABASE_CONFIG =
    process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;

const MONGO_DATABASE_EDITOR_USER =
    process.env.MONGO_DATABASE_EDITOR_USER;

const MONGO_DATABASE_EDITOR_PASSWORD =
    process.env.MONGO_DATABASE_EDITOR_PASSWORD;

const REDIS_USERNAME =
    process.env.REDIS_USERNAME;

const REDIS_PASSWORD =
    process.env.REDIS_PASSWORD;

const REDIS_HOST =
    process.env.REDIS_HOST;

const REDIS_PORT =
    process.env.REDIS_PORT;

const REDIS_DB =
    process.env.REDIS_DB || 0;


let database;
let collection;
let unit_configuration;


/**
 * ============================================================
 * REDIS / BULL QUEUE
 * ============================================================
 */

const queue = new bull(
    'data-queue',
    {
        redis: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            db: REDIS_DB,
            username: REDIS_USERNAME,
            password: REDIS_PASSWORD,
            tls: {}
        }
    }
);


queue.on('ready', () => {
    console.log(
        `Worker connected to Redis at ${REDIS_HOST}:${REDIS_PORT}, DB ${REDIS_DB}`
    );
});


queue.on('error', (err) => {
    console.error(
        `Redis connection error: ${err.message}`
    );
});


queue.on('stalled', (job) => {
    console.warn(
        `Job ${job.id} stalled, retrying...`
    );
});


queue.once('error', (err) => {
    console.error(
        'Worker could not connect to Redis. Exiting process.'
    );

    console.error(err);

    process.exit(1);
});


console.log(
    '🚀 Worker queue initialized, waiting for jobs...'
);


/**
 * ============================================================
 * DATABASE CONNECTION
 * ============================================================
 */

/**
 * Establish the MongoDB connection used by the worker.
 *
 * In addition to the existing data/configuration collections, this ensures
 * the unique Data Spike Filter state index exists.
 */
async function connectToDatabase() {
    console.log(
        'Connecting to database'
    );

    try {
        const client =
            await MongoClient.connect(
                CONNECTION_URL,
                {
                    useNewUrlParser: true
                }
            );

        database =
            client.db(DATABASE_NAME);

        console.log(
            DATABASE_COLLECTION
        );

        collection =
            database.collection(
                DATABASE_COLLECTION
            );

        unit_configuration =
            database.collection(
                DATABASE_CONFIG
            );

        /*
         * Data Spike Filter state must be unique for:
         *
         *   guid + sensor + type
         */
        await ensureSpikeFilterStateIndexes(
            database
        );

        console.log(
            'Connected to `' +
            DATABASE_NAME +
            ':' +
            DATABASE_CONFIG +
            ', ' +
            DATABASE_COLLECTION +
            '`!'
        );
    } catch (e) {
        throw e;
    }
}


/**
 * ============================================================
 * DATA QUEUE PROCESSOR
 * ============================================================
 */

queue.process(async (job) => {
    if (!database || !collection) {
        console.log(
            'Database: Re-establishing connection...'
        );

        await connectToDatabase();
    } else {
        console.log(
            'Database: Re-using connection....'
        );
    }

    const metadataSet =
        new Set();

    try {
        console.log(
            'Worker Started Job'
        );

        console.log(
            job.data
        );

        /*
         * Prevent invalid characters from propagating into database queries
         * and forwarding lookup operations.
         */
        job.data.guid =
            sanitizeGuid(
                job.data.guid
            );

        const timestamps = [];

        let docArray = [];
        let locationUpdate = '';

        let fw =
            job.data.fw;

        let hw =
            job.data.hw;

        let pn =
            job.data.pn;

        let body =
            job.data.body;

        let length =
            job.data.length;

        let now =
            job.data.now;


        /**
         * ------------------------------------------------------------
         * SYSTEM / PAYLOAD BYTE COUNT
         * ------------------------------------------------------------
         */

        if (
            now != null &&
            length != null
        ) {
            const date =
                new Date(now);

            const id =
                new ObjectId();

            docArray.push({
                metadata: {
                    id,
                    guid: job.data.guid,
                    sensor: 'sys',
                    type: 'bytes'
                },
                timestamp: date,
                data: parseInt(length)
            });

            metadataSet.add(
                JSON.stringify({
                    guid: job.data.guid,
                    sensor: 'sys',
                    node: 'bytes',
                    nodeType: 'singular',
                    alias: ['']
                })
            );
        } else {
            console.log(
                'Data appears to be zero length..'
            );
        }


        /**
         * ------------------------------------------------------------
         * BACKUP PACKET HANDLING
         * ------------------------------------------------------------
         *
         * Backup packets may contain historical timestamps.
         *
         * Smart formulas can be marked for recalculation, but historical
         * packets must not advance the current live Data Spike Filter state.
         */

        const isBackup =
            job.data.backup === true;

        if (isBackup) {
            console.log(
                'Backup data received!  Enqueing smart formula reset'
            );

            await database
                .collection('formulas')
                .updateMany(
                    {
                        guid:
                            job.data.guid,

                        type: {
                            $ne: 'calibration'
                        }
                    },
                    {
                        $set: {
                            recalcRequested:
                                true
                        }
                    }
                );
        }


        /**
         * ------------------------------------------------------------
         * BUILD RAW DEVICE DATA DOCUMENTS
         * ------------------------------------------------------------
         *
         * docArray contains the original measurements exactly as received.
         *
         * Calibration and Data Spike Filtering do NOT modify this array.
         */

        Object.keys(
            job.data.v
        ).forEach(
            (sensor) => {
                if (sensor === 'sys') {
                    job.data.v[sensor].forEach(
                        (entry) => {
                            const timestamp =
                                entry.ts;

                            timestamps.push(
                                new Date(timestamp)
                            );

                            /*
                             * Cellular signal strength.
                             */
                            if (
                                entry.rs != null &&
                                timestamp != null
                            ) {
                                const id =
                                    new ObjectId();

                                docArray.push({
                                    metadata: {
                                        id,
                                        guid:
                                            job.data.guid,
                                        sensor,
                                        type:
                                            'rssi'
                                    },
                                    timestamp:
                                        new Date(
                                            timestamp *
                                            1000
                                        ),
                                    data:
                                        entry.rs
                                });

                                metadataSet.add(
                                    JSON.stringify({
                                        guid:
                                            job.data.guid,
                                        sensor,
                                        node:
                                            'rssi',
                                        nodeType:
                                            'singular',
                                        alias:
                                            ['']
                                    })
                                );
                            }

                            /*
                             * Cellular signal quality.
                             */
                            if (
                                entry.sq != null &&
                                timestamp != null
                            ) {
                                const id =
                                    new ObjectId();

                                docArray.push({
                                    metadata: {
                                        id,
                                        guid:
                                            job.data.guid,
                                        sensor,
                                        type:
                                            'rsrq'
                                    },
                                    timestamp:
                                        new Date(
                                            timestamp *
                                            1000
                                        ),
                                    data:
                                        entry.sq
                                });

                                metadataSet.add(
                                    JSON.stringify({
                                        guid:
                                            job.data.guid,
                                        sensor,
                                        node:
                                            'rsrq',
                                        nodeType:
                                            'singular',
                                        alias:
                                            ['']
                                    })
                                );
                            }

                            /*
                             * GPS location update.
                             */
                            if (entry.loc) {
                                if (
                                    entry.loc[0] != null &&
                                    entry.loc[1] != null &&
                                    entry.loc[2] != null
                                ) {
                                    locationUpdate =
                                        JSON.stringify({
                                            lat:
                                                entry.loc[0],
                                            long:
                                                entry.loc[1],
                                            altitude:
                                                entry.loc[2]
                                        });
                                }
                            }
                        }
                    );
                } else {
                    job.data.v[sensor].forEach(
                        (entry) => {
                            const timestamp =
                                entry.ts;

                            timestamps.push(
                                new Date(timestamp)
                            );

                            Object.keys(entry).forEach(
                                (type) => {
                                    if (type === 'ts') {
                                        return;
                                    }

                                    /*
                                     * Array sensor values are expanded into
                                     * independently addressable database
                                     * channels:
                                     *
                                     *   m:0
                                     *   m:1
                                     *   m:2
                                     */
                                    if (
                                        typeof entry[type] ===
                                            'object' &&
                                        entry[type] !==
                                            null
                                    ) {
                                        entry[type].forEach(
                                            (
                                                dataPoint,
                                                index
                                            ) => {
                                                const id =
                                                    new ObjectId();

                                                docArray.push({
                                                    metadata: {
                                                        id,
                                                        guid:
                                                            job.data.guid,
                                                        sensor,
                                                        type:
                                                            type +
                                                            ':' +
                                                            index
                                                    },
                                                    timestamp:
                                                        new Date(
                                                            timestamp *
                                                            1000
                                                        ),
                                                    data:
                                                        dataPoint
                                                });
                                            }
                                        );

                                        if (
                                            entry[type].length >
                                            0
                                        ) {
                                            metadataSet.add(
                                                JSON.stringify({
                                                    guid:
                                                        job.data.guid,
                                                    sensor,
                                                    node:
                                                        type,
                                                    nodeType:
                                                        'array',
                                                    alias:
                                                        Array(
                                                            entry[type]
                                                                .length
                                                        ).fill(
                                                            ''
                                                        )
                                                })
                                            );
                                        }
                                    } else {
                                        metadataSet.add(
                                            JSON.stringify({
                                                guid:
                                                    job.data.guid,
                                                sensor,
                                                node:
                                                    type,
                                                nodeType:
                                                    'singular',
                                                alias:
                                                    ['']
                                            })
                                        );

                                        if (
                                            entry[type] ===
                                            null
                                        ) {
                                            console.log(
                                                'Entry is null, inserting anyways...'
                                            );
                                        }

                                        const id =
                                            new ObjectId();

                                        docArray.push({
                                            metadata: {
                                                id,
                                                guid:
                                                    job.data.guid,
                                                sensor,
                                                type
                                            },
                                            timestamp:
                                                new Date(
                                                    timestamp *
                                                    1000
                                                ),
                                            data:
                                                entry[type]
                                        });
                                    }
                                }
                            );
                        }
                    );
                }
            }
        );


        /**
         * ============================================================
         * THIRD-PARTY DATA FORWARDING
         * ============================================================
         *
         * The outgoing body is cloned inside applyCalibrations().
         *
         * Pipeline:
         *
         *   Raw incoming payload
         *       |
         *       +--> Raw MongoDB storage (docArray)
         *       |
         *       +--> Forwarding clone
         *               |
         *               +--> Calibration formula
         *               |
         *               +--> Data Spike Filter
         *               |
         *               +--> Third-party HTTP endpoint
         *
         * Raw MongoDB data is intentionally unaffected.
         */

        console.log(
            'Device/Organization Search: Checking to see if data should be forwarded...'
        );

        let device =
            await database
                .collection('devices')
                .findOne({
                    serial: {
                        $regex:
                            new RegExp(
                                job.data.guid
                            ),
                        $options:
                            'i'
                    }
                });

        if (device) {
            let organization =
                await database
                    .collection(
                        'organizations'
                    )
                    .findOne({
                        name:
                            device.organizationName
                    });

            if (organization) {
                if (
                    organization.webService !==
                    'None'
                ) {
                    console.log(
                        'Data needs to be forwarded.'
                    );

                    if (
                        organization.webAddress !==
                            '' &&
                        organization.webAddress !==
                            null &&
                        organization.webAddress !==
                            undefined &&
                        organization.webAddress !==
                            'undefined'
                    ) {
                        let newAddress =
                            organization.webAddress;

                        if (
                            typeof newAddress ===
                                'string' &&
                            newAddress.includes(
                                '%GUID%'
                            )
                        ) {
                            newAddress =
                                newAddress.replace(
                                    '%GUID%',
                                    job.data.guid
                                );
                        }

                        console.log(
                            'Organization\'s forwarding address: ' +
                            newAddress
                        );

                        /*
                         * Calibration + Data Spike Filter are applied only to
                         * this cloned forwarding payload.
                         *
                         * Backup context prevents historical/replayed packets
                         * from advancing live filter state.
                         */
                        const forwardingBody =
                            await applyCalibrations(
                                database,
                                job.data.guid,
                                job.data.body,
                                {
                                    isBackup
                                }
                            );

                        console.log(
                            '[CALIBRATION] Final forwarding payload:'
                        );

                        console.dir(
                            forwardingBody,
                            {
                                depth: null
                            }
                        );

                        try {
                            let res = null;

                            if (
                                organization.secretKey !==
                                    null &&
                                organization.secretKey !==
                                    undefined &&
                                organization.secretKey !==
                                    'None' &&
                                organization.secretKey !==
                                    'undefined' &&
                                organization.secretKey !==
                                    ''
                            ) {
                                console.log(
                                    'Secret key: ' +
                                    organization.secretKey
                                );

                                console.log(
                                    'Forwarding data...'
                                );

                                res =
                                    await axios.post(
                                        newAddress,
                                        JSON.stringify(
                                            forwardingBody
                                        ),
                                        {
                                            headers: {
                                                'x-api-key':
                                                    organization.secretKey,
                                                'Content-Type':
                                                    'application/json'
                                            }
                                        }
                                    );
                            } else {
                                console.log(
                                    'No secret key found. Proceeding without it.'
                                );

                                console.log(
                                    'Forwarding data...'
                                );

                                res =
                                    await axios.post(
                                        newAddress,
                                        JSON.stringify(
                                            forwardingBody
                                        ),
                                        {
                                            headers: {
                                                'Content-Type':
                                                    'application/json'
                                            }
                                        }
                                    );
                            }

                            let data =
                                res.data;

                            if (
                                res.status !=
                                200
                            ) {
                                console.error(
                                    'Forwarding failed.'
                                );
                            } else {
                                console.log(
                                    'Forwarding successful!'
                                );
                            }
                        } catch (e) {
                            console.log(
                                'Something went wrong when forwarding to webhook'
                            );

                            console.log(e);
                        }
                    } else {
                        console.log(
                            'No forwarding address found. Continuing...'
                        );
                    }
                } else {
                    console.log(
                        'Data does not need to be forwarded. Continuing...'
                    );
                }
            } else {
                console.error(
                    'Organization Search: Error finding organization from device in the database.'
                );
            }
        } else {
            console.error(
                'Device Search: Error finding device in database for forwarding.'
            );
        }


        /**
         * ============================================================
         * SENSOR METADATA DISCOVERY
         * ============================================================
         */

        const sensorArray = [];

        const currSensors =
            await database
                .collection('sensors')
                .find({
                    guid:
                        job.data.guid
                })
                .toArray();

        metadataSet.forEach(
            (metadata) => {
                const parsedData =
                    JSON.parse(metadata);

                const dupeCheck =
                    currSensors.findIndex(
                        (s) => {
                            return (
                                s.guid ===
                                    parsedData.guid &&
                                s.sensor ===
                                    parsedData.sensor &&
                                s.node ===
                                    parsedData.node
                            );
                        }
                    );

                if (dupeCheck === -1) {
                    sensorArray.push(
                        parsedData
                    );
                }
            }
        );

        if (sensorArray.length > 0) {
            console.log(
                'Sensors: New sensor(s) to add',
                sensorArray
            );

            await database
                .collection('sensors')
                .insertMany(
                    sensorArray
                );
        }


        /**
         * ============================================================
         * DEVICE LOCATION UPDATE
         * ============================================================
         */

        if (locationUpdate != '') {
            const location =
                JSON.parse(
                    locationUpdate
                );

            console.log(
                'Device Configuration: Pushing updates to device configuration doc, ',
                location
            );

            await database
                .collection('devices')
                .updateOne(
                    {
                        serial:
                            job.data.guid
                    },
                    {
                        $set:
                            location
                    }
                );
        }


        /**
         * ============================================================
         * DEVICE SYSTEM INFORMATION
         * ============================================================
         */

        if (fw || hw || pn) {
            let systemData = {};

            if (fw) {
                systemData.fw = fw;
            }

            if (hw) {
                systemData.hw = hw;
            }

            if (pn) {
                systemData.pn = pn;
            }

            console.log(
                'Device Configuration: Pushing updates to device configuration doc:',
                systemData
            );

            await database
                .collection('devices')
                .updateOne(
                    {
                        serial:
                            job.data.guid
                    },
                    {
                        $set:
                            systemData
                    }
                );
        }


        /**
         * ============================================================
         * DEVICE CONFIGURATION SNAPSHOT
         * ============================================================
         */

        if (body.cfg) {
            let deviceConfigObject =
                {};

            deviceConfigObject.date =
                new Date(now);

            deviceConfigObject.config =
                {};

            deviceConfigObject.config.network =
                body.cfg.htp;

            deviceConfigObject.config.modem =
                body.cfg.mod;

            deviceConfigObject.config.general =
                body.cfg.gen;

            deviceConfigObject.config.numSensors =
                body.cfg.numSens;

            deviceConfigObject.config.sensors =
                body.cfg.sens;

            console.log(
                'Device Configuration: Pushing updates to device configuration doc:',
                deviceConfigObject
            );

            const results =
                await database
                    .collection('devices')
                    .updateOne(
                        {
                            serial:
                                job.data.guid
                        },
                        {
                            $push: {
                                deviceConfigs:
                                    deviceConfigObject
                            }
                        }
                    );

            console.log(
                'Device Configuration: Result from update of device doc: ',
                results
            );
        } else {
            console.log(
                'Device Configuration: No configuration keys saved.'
            );
        }


        /**
         * ============================================================
         * RAW DATA DUPLICATE FILTERING / STORAGE
         * ============================================================
         *
         * IMPORTANT:
         *
         * docArray still contains the original device values.
         *
         * Values rejected by the forwarding Data Spike Filter are NOT removed
         * from raw MongoDB storage.
         */

        const promises =
            docArray.map(
                async (doc) => {
                    const check =
                        await collection.findOne({
                            'metadata.guid':
                                doc.metadata.guid,

                            'metadata.sensor':
                                doc.metadata.sensor,

                            'metadata.type':
                                doc.metadata.type,

                            timestamp:
                                doc.timestamp
                        });

                    return {
                        value:
                            doc,
                        include:
                            check == null
                    };
                }
            );

        const data_with_includes =
            await Promise.all(
                promises
            );

        const filtered_data_with_includes =
            data_with_includes.filter(
                v => v.include
            );

        const filtered_docs =
            filtered_data_with_includes.map(
                data => data.value
            );

        if (
            filtered_docs.length >
            0
        ) {
            await collection.insertMany(
                filtered_docs,
                (error, result) => {
                    if (
                        result !==
                        undefined
                    ) {
                        let combinedResponse =
                            '{"t":"' +
                            Date.now() +
                            '"}';

                        let json =
                            JSON.parse(
                                combinedResponse
                            );
                    } else {
                        console.log(
                            'Empty data object, nothing was inserted.'
                        );
                    }
                }
            );
        } else {
            console.log(
                'Data: No data to be inserted/received'
            );
        }

        console.log(
            'Worker: Finished'
        );
    } catch (e) {
        console.log(
            'An error occurred at some point during this job.'
        );

        console.log(
            'Job information:\n'
        );

        console.log(
            JSON.stringify(
                job,
                null,
                4
            )
        );

        console.log(
            '\nError that occurred:\n'
        );

        console.log(e);

        console.log(
            'Worker Finished'
        );
    }
});


/**
 * ============================================================
 * GENERAL HELPERS
 * ============================================================
 */

/**
 * Sanitize a device GUID before using it in database queries.
 *
 * Allows letters, numbers and hyphens only.
 *
 * @param {string} p_guid Device GUID.
 * @returns {string} Sanitized GUID.
 */
function sanitizeGuid(p_guid) {
    return p_guid.replace(
        /[^a-z0-9-]/gi,
        ''
    );
}


/**
 * Parse a calibration sensor type.
 *
 * Singular examples:
 *
 *   pkv
 *   t
 *   h
 *
 * Indexed array example:
 *
 *   m:0
 *
 * becomes:
 *
 *   {
 *       key: 'm',
 *       index: 0
 *   }
 *
 * MongoDB stores indexed array channels using the same complete type string,
 * such as "m:0", even though the incoming packet contains:
 *
 *   entry.m[0]
 *
 * @param {string} type Calibration sensor type.
 * @returns {{key:string,index:number|null}}
 */
function parseSensorType(type) {
    if (
        !type ||
        typeof type !== 'string'
    ) {
        return {
            key: type,
            index: null
        };
    }

    const parts =
        type.split(':');

    if (parts.length === 2) {
        const index =
            Number(parts[1]);

        if (
            Number.isInteger(
                index
            )
        ) {
            return {
                key:
                    parts[0],
                index
            };
        }
    }

    return {
        key: type,
        index: null
    };
}


/**
 * ============================================================
 * FORWARDED DATA CALIBRATION / DATA SPIKE FILTER
 * ============================================================
 *
 * The functions below operate ONLY on the outgoing forwarding payload.
 *
 * Pipeline:
 *
 *   incoming raw value
 *       |
 *       +--> calibration effective-date check
 *       |
 *       +--> formulaString(x)
 *       |
 *       +--> calibrated engineering value
 *       |
 *       +--> optional Data Spike Filter
 *       |
 *       +--> forwarded value
 *
 * Raw MongoDB DeviceData storage is not modified.
 */


/**
 * Apply a compiled mathjs calibration formula to one raw sensor value.
 *
 * Non-finite formula output such as NaN or Infinity is normalized to null.
 * Such values must never enter the Data Spike Filter state.
 *
 * @param {Object} compiled Compiled mathjs expression.
 * @param {string} symbol Formula variable name, normally "x".
 * @param {*} rawValue Raw sensor value.
 * @returns {*} Calibrated finite number, null, or original unsupported object.
 */
function applyCompiledCalibration(
    compiled,
    symbol,
    rawValue
) {
    if (
        rawValue === null ||
        rawValue === undefined
    ) {
        return rawValue;
    }

    if (
        typeof rawValue ===
        'object'
    ) {
        return rawValue;
    }

    const value =
        compiled.evaluate({
            [symbol]:
                rawValue
        });

    return isValidCalibratedNumber(
        value
    )
        ? value
        : null;
}


/**
 * Determine whether a reading falls inside the calibration's effective range.
 *
 * Canonical range:
 *
 *   timestamp >= startDate
 *   timestamp <  endDate
 *
 * Missing startDate means there is no lower bound.
 * Missing endDate means there is no upper bound.
 *
 * An epoch-zero endDate is treated as open-ended for compatibility with
 * existing calibration documents.
 *
 * @param {number} timestampSeconds Device timestamp in epoch seconds.
 * @param {Object} calibration Calibration formula document.
 * @returns {boolean} True when calibration applies to this reading.
 */
function isCalibrationTimestampInRange(
    timestampSeconds,
    calibration
) {
    if (
        typeof timestampSeconds !==
            'number' ||
        !Number.isFinite(
            timestampSeconds
        )
    ) {
        return false;
    }

    const timestampMs =
        timestampSeconds * 1000;

    const hasStart =
        calibration.startDate !==
            null &&
        calibration.startDate !==
            undefined;

    const endDateMs =
        calibration.endDate !==
            null &&
        calibration.endDate !==
            undefined
            ? new Date(
                calibration.endDate
            ).getTime()
            : null;

    /*
     * Existing data may represent no end date with epoch zero.
     */
    const hasEnd =
        endDateMs !== null &&
        Number.isFinite(
            endDateMs
        ) &&
        endDateMs !== 0;

    if (hasStart) {
        const startDateMs =
            new Date(
                calibration.startDate
            ).getTime();

        if (
            Number.isFinite(
                startDateMs
            ) &&
            timestampMs <
                startDateMs
        ) {
            return false;
        }
    }

    if (
        hasEnd &&
        timestampMs >= endDateMs
    ) {
        return false;
    }

    return true;
}


/**
 * Build a deterministic signature for configuration that affects persistent
 * Data Spike Filter state.
 *
 * Existing rolling state must not be reused after any of these changes:
 *
 *   - formulaString
 *   - startDate
 *   - endDate
 *   - enabled
 *   - deltaType
 *   - maxDelta
 *
 * A configuration mismatch causes the channel state to reset.
 *
 * @param {Object} calibration Calibration formula document.
 * @returns {string} Stable JSON configuration signature.
 */
function buildFilterSignature(
    calibration
) {
    const filter =
        calibration.dataSpikeFilter ||
        {};

    return JSON.stringify({
        formulaString:
            calibration.formulaString ||
            '',

        startDate:
            calibration.startDate ||
            null,

        endDate:
            calibration.endDate ||
            null,

        enabled:
            filter.enabled ===
            true,

        deltaType:
            filter.deltaType ||
            'absolute',

        maxDelta:
            filter.maxDelta ??
            null
    });
}


/**
 * Load persistent filter state for one exact sensor channel.
 *
 * If existing state was created using different calibration/filter settings,
 * that state is deleted and a clean state is returned.
 *
 * State is keyed by:
 *
 *   guid + sensor + type
 *
 * @param {Object} database MongoDB database instance.
 * @param {string} guid Device GUID.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact sensor channel type.
 * @param {Object} calibration Calibration formula.
 * @returns {Promise<Object>} Runtime filter state metadata.
 */
async function getSpikeFilterState(
    database,
    guid,
    sensor,
    type,
    calibration
) {
    const saved =
        await loadSpikeFilterState(
            database,
            guid,
            sensor,
            type
        );

    const currentSignature =
        buildFilterSignature(
            calibration
        );

    if (
        saved &&
        saved.filterSignature ===
            currentSignature
    ) {
        return {
            state:
                createDataSpikeFilterState({
                    acceptedWindow:
                        saved.acceptedWindow,

                    candidateWindow:
                        saved.candidateWindow
                }),

            lastTimestamp:
                saved.lastTimestamp
                    ? new Date(
                        saved.lastTimestamp
                    ).getTime()
                    : null,

            filterSignature:
                currentSignature,

            stateChanged:
                false
        };
    }

    /*
     * Configuration changed. Do not evaluate new readings against state that
     * was produced using different formula/filter behavior.
     */
    if (saved) {
        console.log(
            '[DATA_SPIKE_FILTER] Configuration changed; resetting state',
            {
                guid,
                sensor,
                type
            }
        );

        await resetSpikeFilterState(
            database,
            guid,
            sensor,
            type
        );
    }

    return {
        state:
            createDataSpikeFilterState(),

        lastTimestamp:
            null,

        filterSignature:
            currentSignature,

        stateChanged:
            false
    };
}


/**
 * Extract one exact calibration channel from the outgoing packet.
 *
 * Returned readings retain their original packet index so values can be
 * processed chronologically but written back without reordering the payload.
 *
 * @param {Object} calibratedBody Forwarding payload.
 * @param {string} sensor Sensor identifier.
 * @param {string} type Exact type, including optional array index.
 * @returns {Array<Object>} Matching readings.
 */
function extractForwardingChannelReadings(
    calibratedBody,
    sensor,
    type
) {
    if (
        !calibratedBody.v ||
        !Array.isArray(
            calibratedBody.v[sensor]
        )
    ) {
        return [];
    }

    const {
        key,
        index
    } = parseSensorType(type);

    const readings = [];

    calibratedBody.v[sensor].forEach(
        (
            entry,
            originalIndex
        ) => {
            if (
                !entry ||
                typeof entry !==
                    'object'
            ) {
                return;
            }

            if (
                entry.ts === undefined ||
                entry[key] ===
                    undefined
            ) {
                return;
            }

            let rawValue;

            /*
             * Indexed array channel.
             *
             * Example:
             *   formula type = m:0
             *   packet value = entry.m[0]
             */
            if (index !== null) {
                if (
                    !Array.isArray(
                        entry[key]
                    ) ||
                    index < 0 ||
                    index >=
                        entry[key].length
                ) {
                    return;
                }

                rawValue =
                    entry[key][index];
            } else {
                /*
                 * Singular calibration should not accidentally calibrate an
                 * entire array. Indexed arrays must use explicit types such
                 * as m:0, m:1, etc.
                 */
                if (
                    Array.isArray(
                        entry[key]
                    )
                ) {
                    return;
                }

                rawValue =
                    entry[key];
            }

            readings.push({
                originalIndex,
                timestamp:
                    entry.ts,
                rawValue,
                key,
                index
            });
        }
    );

    return readings;
}


/**
 * Write one processed value back into the forwarding payload.
 *
 * Handles singular and indexed-array channels without changing any unrelated
 * values in the same sensor entry.
 *
 * @param {Object} calibratedBody Forwarding payload.
 * @param {string} sensor Sensor identifier.
 * @param {Object} reading Extracted reading metadata.
 * @param {*} forwardingValue Value to place in outgoing payload.
 */
function writeForwardingChannelValue(
    calibratedBody,
    sensor,
    reading,
    forwardingValue
) {
    const original =
        calibratedBody.v[sensor][
            reading.originalIndex
        ];

    const nextEntry = {
        ...original
    };

    if (
        reading.index !==
        null
    ) {
        const nextArray = [
            ...nextEntry[
                reading.key
            ]
        ];

        nextArray[
            reading.index
        ] = forwardingValue;

        nextEntry[
            reading.key
        ] = nextArray;
    } else {
        nextEntry[
            reading.key
        ] = forwardingValue;
    }

    calibratedBody.v[sensor][
        reading.originalIndex
    ] = nextEntry;
}


/**
 * Apply one calibration and optional Data Spike Filter to one exact sensor
 * channel in the outgoing payload.
 *
 * Supported examples:
 *
 * Singular:
 *
 *   sensor = ai-1
 *   type   = pkv
 *
 * Indexed array:
 *
 *   sensor = sm1-0
 *   type   = m:0
 *
 * Processing:
 *
 *   1. Extract matching values.
 *   2. Sort oldest -> newest.
 *   3. Verify calibration effective date.
 *   4. Apply the formula.
 *   5. Apply the Data Spike Filter when enabled.
 *   6. Write the resulting number/null back into the forwarding clone.
 *   7. Persist updated filter state.
 *
 * Live candidate behavior:
 *
 *   candidate #1 -> null
 *   candidate #2 -> null
 *   candidate #3 -> accepted when it confirms a coherent new level
 *
 * Previously forwarded null values are never resent/restored.
 *
 * Backup packets:
 *
 * Historical/backup packets may be calibrated for forwarding but never alter
 * the current live Data Spike Filter state.
 *
 * Duplicate/out-of-order packets:
 *
 * A timestamp that is not newer than the persisted live timestamp does not
 * advance filter state. The live filter is causal.
 *
 * @param {Object} database MongoDB database instance.
 * @param {Object} calibratedBody Mutable forwarding payload clone.
 * @param {string} guid Device GUID.
 * @param {Object} sensorConfig Calibration sensor configuration.
 * @param {Object} calibration Calibration formula document.
 * @param {Object} compiled Compiled mathjs formula.
 * @param {Object} options Processing options.
 */
async function applyCalibrationToForwardingChannel(
    database,
    calibratedBody,
    guid,
    sensorConfig,
    calibration,
    compiled,
    options = {}
) {
    const sensor =
        sensorConfig.sensor;

    const type =
        sensorConfig.type;

    const symbol =
        sensorConfig.symbol ||
        'x';

    const readings =
        extractForwardingChannelReadings(
            calibratedBody,
            sensor,
            type
        );

    if (!readings.length) {
        return;
    }

    /*
     * Device payload arrays are not assumed to be chronological.
     *
     * Filter state is causal, therefore process oldest to newest while keeping
     * originalIndex for writing values back to the original payload ordering.
     */
    readings.sort(
        (a, b) => {
            const aTimestamp =
                Number(a.timestamp);

            const bTimestamp =
                Number(b.timestamp);

            if (
                Number.isFinite(
                    aTimestamp
                ) &&
                Number.isFinite(
                    bTimestamp
                )
            ) {
                if (
                    aTimestamp !==
                    bTimestamp
                ) {
                    return (
                        aTimestamp -
                        bTimestamp
                    );
                }
            }

            return (
                a.originalIndex -
                b.originalIndex
            );
        }
    );

    const filter =
        calibration.dataSpikeFilter;

    const filterEnabled =
        isDataSpikeFilterEnabled(
            filter
        );

    let stateInfo =
        null;

    /*
     * Backup/historical packets intentionally use no live state.
     */
    if (
        filterEnabled &&
        options.isBackup !==
            true
    ) {
        stateInfo =
            await getSpikeFilterState(
                database,
                guid,
                sensor,
                type,
                calibration
            );
    }

    for (
        const reading
        of readings
    ) {
        const timestampSeconds =
            Number(
                reading.timestamp
            );

        /*
         * Invalid timestamp:
         *
         * Do not apply a date-bounded calibration when there is no usable
         * timestamp with which to make that determination.
         */
        if (
            !Number.isFinite(
                timestampSeconds
            )
        ) {
            continue;
        }

        /*
         * Outside calibration effective dates:
         *
         * Keep the raw value in the forwarding body and do not modify filter
         * state.
         */
        if (
            !isCalibrationTimestampInRange(
                timestampSeconds,
                calibration
            )
        ) {
            continue;
        }

        let calibratedValue;

        try {
            calibratedValue =
                applyCompiledCalibration(
                    compiled,
                    symbol,
                    reading.rawValue
                );
        } catch (error) {
            console.error(
                '[CALIBRATION_FORWARDING_VALUE_ERROR]',
                {
                    guid,
                    sensor,
                    type,
                    timestamp:
                        timestampSeconds,
                    rawValue:
                        reading.rawValue,
                    error:
                        error.message
                }
            );

            calibratedValue =
                null;
        }

        let forwardingValue =
            calibratedValue;

        if (
            filterEnabled &&
            options.isBackup !==
                true
        ) {
            const readingTimestampMs =
                timestampSeconds *
                1000;

            /*
             * The live Data Spike Filter is causal.
             *
             * Delayed or duplicate readings must never move persisted state
             * backwards or be evaluated as though they arrived after newer
             * measurements.
             *
             * For stale values we preserve calibration, but skip filtering
             * state mutation.
             */
            if (
                stateInfo.lastTimestamp !==
                    null &&
                readingTimestampMs <=
                    stateInfo.lastTimestamp
            ) {
                console.warn(
                    '[DATA_SPIKE_FILTER] Stale/duplicate reading does not advance state',
                    {
                        guid,
                        sensor,
                        type,
                        timestamp:
                            timestampSeconds,
                        lastTimestamp:
                            stateInfo.lastTimestamp
                    }
                );

                forwardingValue =
                    calibratedValue;
            } else {
                const step =
                    applyDataSpikeFilterValue(
                        calibratedValue,
                        stateInfo.state,
                        filter
                    );

                forwardingValue =
                    step.value;

                /*
                 * Even an invalid calibrated value is chronological.
                 *
                 * applyDataSpikeFilterValue leaves filter windows unchanged for
                 * invalid values, but recording the timestamp prevents that same
                 * old packet from later being treated as new state input.
                 */
                stateInfo.lastTimestamp =
                    readingTimestampMs;

                stateInfo.stateChanged =
                    true;

                console.log(
                    '[DATA_SPIKE_FILTER]',
                    {
                        guid,
                        sensor,
                        type,
                        timestamp:
                            timestampSeconds,
                        deltaType:
                            filter.deltaType ||
                            'absolute',
                        maxDelta:
                            filter.maxDelta,
                        raw:
                            reading.rawValue,
                        calibrated:
                            calibratedValue,
                        forwarded:
                            forwardingValue,
                        rejected:
                            step.rejected,
                        rebased:
                            step.rebased,
                        acceptedWindow:
                            stateInfo.state
                                .acceptedWindow,
                        candidateWindow:
                            stateInfo.state
                                .candidateWindow
                    }
                );
            }
        }

        /*
         * The forwarding clone receives the calibrated/filter result.
         *
         * docArray remains untouched and will later store the raw value.
         */
        writeForwardingChannelValue(
            calibratedBody,
            sensor,
            reading,
            forwardingValue
        );
    }

    /*
     * Persist only when live state actually processed one or more new readings.
     */
    if (
        filterEnabled &&
        options.isBackup !==
            true &&
        stateInfo &&
        stateInfo.stateChanged &&
        stateInfo.lastTimestamp !==
            null
    ) {
        await saveSpikeFilterState(
            database,
            guid,
            sensor,
            type,
            stateInfo.state,
            stateInfo.lastTimestamp,
            stateInfo.filterSignature
        );
    }
}


/**
 * Apply all active calibration formulas to the third-party forwarding payload.
 *
 * Each calibration may optionally include:
 *
 *   dataSpikeFilter: {
 *       enabled: true,
 *       deltaType: 'absolute' | 'percentage',
 *       maxDelta: number
 *   }
 *
 * Calibration and filtering occur independently for each exact channel:
 *
 *   guid + sensor + type
 *
 * The original incoming body is deep-cloned before any transformations.
 *
 * @param {Object} database MongoDB database instance.
 * @param {string} guid Device GUID.
 * @param {Object} body Original device HTTP payload body.
 * @param {Object} options Processing options.
 * @returns {Promise<Object>} Calibrated/filtered forwarding payload.
 */
async function applyCalibrations(
    database,
    guid,
    body,
    options = {}
) {
    const calibratedBody =
        JSON.parse(
            JSON.stringify(
                body
            )
        );

    const calibrations =
        await database
            .collection('formulas')
            .find({
                guid,
                type:
                    'calibration',
                deleteRequested: {
                    $ne:
                        true
                }
            })
            .toArray();

    if (!calibrations.length) {
        return calibratedBody;
    }

    console.log(
        '[CALIBRATION] Active calibration count:',
        calibrations.length,
        'guid:',
        guid
    );

    for (
        const calibration
        of calibrations
    ) {
        try {
            if (
                !calibration.formulaString ||
                !Array.isArray(
                    calibration.sensors
                )
            ) {
                continue;
            }

            const compiled =
                math.compile(
                    calibration.formulaString
                );

            console.log(
                '[CALIBRATION] Applying formula',
                {
                    guid,
                    formulaId:
                        calibration._id
                            ?.toString(),
                    formulaString:
                        calibration.formulaString,
                    sensors:
                        calibration.sensors,
                    dataSpikeFilter:
                        calibration.dataSpikeFilter ??
                        null
                }
            );

            /*
             * Current calibration documents should contain one exact sensor
             * channel, but processing the array keeps this worker compatible
             * with the stored schema.
             */
            for (
                const sensorConfig
                of calibration.sensors
            ) {
                await applyCalibrationToForwardingChannel(
                    database,
                    calibratedBody,
                    guid,
                    sensorConfig,
                    calibration,
                    compiled,
                    options
                );
            }
        } catch (error) {
            console.error(
                '[CALIBRATION_FORWARDING_ERROR]',
                {
                    guid,
                    formulaId:
                        calibration._id,
                    formulaString:
                        calibration.formulaString,
                    error:
                        error.message
                }
            );
        }
    }

    return calibratedBody;
}