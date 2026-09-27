/*
    Description:
        Initializes the MongoDB collections required by the neatMon API
        and ingestion worker.

        Collections are created only when they do not already exist.

        This script also creates development seed data:
        - Organization
        - Device
        - Optional example sensor
        - Calibration formulas
        - Control queue records
        - Command queue records

    Important:
        Sensor definitions do NOT need to be pre-created in production.

        When a neatMon node sends new sensor/data types, the ingestion
        worker automatically creates the corresponding sensor definitions.

        The seeded sensor exists only to make a fresh development database
        immediately inspectable.

    Author: neatMon, Inc.
    License: MIT
*/


////////////////////////////////////////////////////////////
// CONFIGURATION
////////////////////////////////////////////////////////////

const DATABASE_NAME = "neatmon_dev";

const DATA_COLLECTION = "devicetimeseriesdatas";


////////////////////////////////////////////////////////////
// DATABASE
////////////////////////////////////////////////////////////

db = new Mongo().getDB(DATABASE_NAME);

print("");
print("==============================================");
print(" neatMon MongoDB Initialization");
print(" Database: " + DATABASE_NAME);
print("==============================================");
print("");


////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

function collectionExists(name) {
    return db.getCollectionInfos({ name: name }).length > 0;
}


function createNormalCollection(name) {

    if (!collectionExists(name)) {

        print("Creating collection: " + name);

        db.createCollection(name);

    } else {

        print("Collection already exists: " + name);

    }
}


////////////////////////////////////////////////////////////
// DEVICE TIME-SERIES DATA
////////////////////////////////////////////////////////////

/*
    Primary device data storage.

    Existing neatMon database configuration:

        timeField:   timestamp
        metaField:   metadata
        granularity: seconds
*/

if (!collectionExists(DATA_COLLECTION)) {

    print(
        "Creating time-series collection: " +
        DATA_COLLECTION
    );

    db.createCollection(
        DATA_COLLECTION,
        {
            timeseries: {
                timeField: "timestamp",
                metaField: "metadata",
                granularity: "seconds"
            }
        }
    );

} else {

    print(
        "Collection already exists: " +
        DATA_COLLECTION
    );

}


////////////////////////////////////////////////////////////
// DEVICE API REQUEST CACHE
////////////////////////////////////////////////////////////

/*
    The API stores incoming device requests here.

    Existing neatMon configuration:

        capped: true
        size:   10 MB
*/

if (!collectionExists("deviceApiRequestsCache")) {

    print(
        "Creating capped collection: " +
        "deviceApiRequestsCache"
    );

    db.createCollection(
        "deviceApiRequestsCache",
        {
            capped: true,
            size: 10485760
        }
    );

} else {

    print(
        "Collection already exists: " +
        "deviceApiRequestsCache"
    );

}


////////////////////////////////////////////////////////////
// STANDARD API COLLECTIONS
////////////////////////////////////////////////////////////

/*
    Only collections directly used by this API / ingestion worker
    are explicitly initialized here.

    Device configuration is stored in devices.deviceConfigs.

    There is no separate device-cfg collection.
*/

const apiCollections = [

    "devices",

    "organizations",

    "sensors",

    "formulas",

    "controlQueue",

    "commandQueue"

];


apiCollections.forEach(createNormalCollection);


////////////////////////////////////////////////////////////
// INDEXES
////////////////////////////////////////////////////////////

print("");
print("Creating API indexes...");
print("");


////////////////////////////////////////////////////////////
// DEVICES
////////////////////////////////////////////////////////////

/*
    API and worker look up devices by serial/GUID.
*/

db.devices.createIndex(
    {
        serial: 1
    },
    {
        name: "serial_1"
    }
);


////////////////////////////////////////////////////////////
// ORGANIZATIONS
////////////////////////////////////////////////////////////

/*
    The ingestion worker currently resolves an organization
    using device.organizationName.
*/

db.organizations.createIndex(
    {
        name: 1
    },
    {
        name: "name_1"
    }
);


////////////////////////////////////////////////////////////
// SENSORS
////////////////////////////////////////////////////////////

/*
    Sensors are discovered dynamically from incoming node data.

    The worker compares definitions using:

        guid
        sensor
        node
*/

db.sensors.createIndex(
    {
        guid: 1,
        sensor: 1,
        node: 1
    },
    {
        name: "guid_sensor_node"
    }
);


////////////////////////////////////////////////////////////
// FORMULAS
////////////////////////////////////////////////////////////

/*
    Calibration lookup:

        {
            guid: ...,
            type: "calibration",
            deleteRequested: { $ne: true }
        }
*/

db.formulas.createIndex(
    {
        guid: 1,
        type: 1,
        deleteRequested: 1
    },
    {
        name: "guid_type_deleteRequested"
    }
);


////////////////////////////////////////////////////////////
// CONTROL QUEUE
////////////////////////////////////////////////////////////

/*
    Pending controls are found with:

        {
            guid: ...,
            executed: ""
        }
*/

db.controlQueue.createIndex(
    {
        guid: 1,
        executed: 1
    },
    {
        name: "guid_executed"
    }
);


/*
    Current API acknowledges controls using:

        {
            short_id: ...,
            guid: ...
        }

    Real historic controlQueue records may not always contain
    short_id, but the current API expects it. Development seed
    controls therefore include it.
*/

db.controlQueue.createIndex(
    {
        short_id: 1,
        guid: 1
    },
    {
        name: "short_id_guid"
    }
);


////////////////////////////////////////////////////////////
// COMMAND QUEUE
////////////////////////////////////////////////////////////

/*
    Pending command lookup.
*/

db.commandQueue.createIndex(
    {
        guid: 1,
        executed: 1
    },
    {
        name: "guid_executed"
    }
);


/*
    Command acknowledgement lookup.
*/

db.commandQueue.createIndex(
    {
        short_id: 1,
        guid: 1
    },
    {
        name: "short_id_guid"
    }
);


////////////////////////////////////////////////////////////
// DEVICE TIME-SERIES INDEXES
////////////////////////////////////////////////////////////

/*
    Historical API lookup:

        {
            "metadata.guid": guid,
            timestamp: ...
        }
*/

db.getCollection(DATA_COLLECTION).createIndex(
    {
        "metadata.guid": 1,
        timestamp: -1
    },
    {
        name: "metadata_guid_timestamp"
    }
);


/*
    Worker duplicate-data lookup:

        {
            "metadata.guid": ...,
            "metadata.sensor": ...,
            "metadata.type": ...,
            timestamp: ...
        }
*/

db.getCollection(DATA_COLLECTION).createIndex(
    {
        "metadata.guid": 1,
        "metadata.sensor": 1,
        "metadata.type": 1,
        timestamp: 1
    },
    {
        name: "metadata_guid_sensor_type_timestamp"
    }
);


////////////////////////////////////////////////////////////
// DEVELOPMENT SEED DATA
////////////////////////////////////////////////////////////

print("");
print("Creating development seed data...");
print("");


////////////////////////////////////////////////////////////
// DEVELOPMENT CONSTANTS
////////////////////////////////////////////////////////////

const DEV_ORG_ID =
    ObjectId("64f000000000000000000001");


const DEV_DEVICE_ID =
    ObjectId("64f000000000000000000002");


const DEV_ORG_NAME =
    "neatMon Development";


const DEV_GUID =
    "aaaaaaaa-bbbb-cccc-dddd-000000000001";


const DEV_USERNAME =
    "dev@neatmon.com";


////////////////////////////////////////////////////////////
// ORGANIZATION
////////////////////////////////////////////////////////////

/*
    Matches the normal neatMon organization document shape.

    parentOrganization is intentionally omitted because there
    is no development parent organization being created here.
*/

db.organizations.updateOne(
    {
        _id: DEV_ORG_ID
    },
    {
        $setOnInsert: {

            _id: DEV_ORG_ID,

            name: DEV_ORG_NAME,

            poc: "Development User",

            email: DEV_USERNAME,

            streetAddress: "",

            zip: "",

            country: "United States",

            city: "",

            state: "",

            numDevice: NumberInt(1),

            numNeedService: NumberInt(0),

            webService: "None",

            unitType: "imperial",

            userOrg: "",

            subscriptionLevel: "proactive",

            organizationUsers: [],

            devices: [],

            createdAt: new Date(),

            updatedAt: new Date(),

            __v: NumberInt(0),

            /*
                Empty secretKey preserves the API's current
                legacy development authentication behavior.
            */

            secretKey: ""
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// DEVICE
////////////////////////////////////////////////////////////

/*
    Device configuration is stored directly in:

        devices.deviceConfigs

    The worker adds configuration history to this array as
    configuration data is received from the node.

    `organization` is stored as the string representation of
    the organization ObjectId, matching current device documents.
*/

db.devices.updateOne(
    {
        serial: DEV_GUID
    },
    {
        $setOnInsert: {

            _id: DEV_DEVICE_ID,

            name: "Development MINI",

            serial: DEV_GUID,

            location: "Development",

            lat: NumberInt(0),

            long: NumberInt(0),

            organization: DEV_ORG_ID.toString(),

            description: "Development API test device",

            status: "OK",

            organizationName: DEV_ORG_NAME,

            createdAt: new Date(),

            updatedAt: new Date(),

            __v: NumberInt(0),

            fw: NumberInt(331),

            hw: NumberInt(101),

            pn: "MINI",

            /*
                Device configuration records will normally be
                populated by incoming node configuration data.
            */

            deviceConfigs: []
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// OPTIONAL DEVELOPMENT SENSOR
////////////////////////////////////////////////////////////

/*
    IMPORTANT:

    Sensors do not need to be manually provisioned.

    The ingestion worker creates sensor definitions when a node
    reports previously unseen sensor/data types.

    This record is included only as an example for developers.
*/

db.sensors.updateOne(
    {
        guid: DEV_GUID,
        sensor: "1",
        node: "v"
    },
    {
        $setOnInsert: {

            guid: DEV_GUID,

            sensor: "1",

            node: "v",

            nodeType: "singular",

            alias: [""]
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// CALIBRATION 1
////////////////////////////////////////////////////////////

/*
    Example:

        output = x * 2

    Applies to:

        sensor 1
        data type v
*/

db.formulas.updateOne(
    {
        guid: DEV_GUID,

        type: "calibration",

        formulaString: "x * 2",

        "sensors.sensor": "1",

        "sensors.type": "v"
    },
    {
        $setOnInsert: {

            guid: DEV_GUID,

            type: "calibration",

            formulaString: "x * 2",

            sensors: [
                {
                    sensor: "1",
                    type: "v",
                    symbol: "x"
                }
            ],

            deleteRequested: false
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// CALIBRATION 2
////////////////////////////////////////////////////////////

/*
    Example:

        output = x + 1

    The corresponding sensor/type does not need to already
    exist in the sensors collection. It will be discovered
    when the node reports that data type.
*/

db.formulas.updateOne(
    {
        guid: DEV_GUID,

        type: "calibration",

        formulaString: "x + 1",

        "sensors.sensor": "1",

        "sensors.type": "t"
    },
    {
        $setOnInsert: {

            guid: DEV_GUID,

            type: "calibration",

            formulaString: "x + 1",

            sensors: [
                {
                    sensor: "1",
                    type: "t",
                    symbol: "x"
                }
            ],

            deleteRequested: false
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// CONTROL QUEUE CONSTANTS
////////////////////////////////////////////////////////////

const DEV_CONTROL_ID_1 =
    ObjectId("64f000000000000000000101");


const DEV_CONTROL_ID_2 =
    ObjectId("64f000000000000000000102");


const DEV_CONTROL_EVENT_1 =
    ObjectId("64f000000000000000000201");


const DEV_CONTROL_EVENT_2 =
    ObjectId("64f000000000000000000202");


/*
    Example epoch base time.

    The controls are development examples only and are not
    intended to operate real equipment.
*/

const DEV_CONTROL_BASE_TIME =
    1725752736.788;


////////////////////////////////////////////////////////////
// CONTROL QUEUE RECORD 1
////////////////////////////////////////////////////////////

/*
    Shape based on actual neatMon controlQueue documents:

        guid
        created
        event
        executed
        deleted
        control:
            rnum
            rtyp
            on
            off

    short_id is additionally included because the current API
    uses it when sending and acknowledging controls.
*/

db.controlQueue.updateOne(
    {
        _id: DEV_CONTROL_ID_1
    },
    {
        $setOnInsert: {

            _id: DEV_CONTROL_ID_1,

            guid: DEV_GUID,

            short_id:
                DEV_CONTROL_ID_1.toString().slice(-5),

            created: new Date(),

            event: DEV_CONTROL_EVENT_1,

            /*
                Empty string identifies a pending control.
            */

            executed: "",

            deleted: "",

            control: {

                rnum: NumberInt(1),

                rtyp: NumberInt(1),

                on: Double(
                    DEV_CONTROL_BASE_TIME
                ),

                off: Double(
                    DEV_CONTROL_BASE_TIME + 900
                )
            }
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// CONTROL QUEUE RECORD 2
////////////////////////////////////////////////////////////

db.controlQueue.updateOne(
    {
        _id: DEV_CONTROL_ID_2
    },
    {
        $setOnInsert: {

            _id: DEV_CONTROL_ID_2,

            guid: DEV_GUID,

            short_id:
                DEV_CONTROL_ID_2.toString().slice(-5),

            created: new Date(),

            event: DEV_CONTROL_EVENT_2,

            executed: "",

            deleted: "",

            control: {

                rnum: NumberInt(2),

                rtyp: NumberInt(1),

                on: Double(
                    DEV_CONTROL_BASE_TIME + 1800
                ),

                off: Double(
                    DEV_CONTROL_BASE_TIME + 2700
                )
            }
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// COMMAND QUEUE CONSTANTS
////////////////////////////////////////////////////////////

const DEV_COMMAND_ID_1 =
    ObjectId("64f000000000000000000301");


const DEV_COMMAND_ID_2 =
    ObjectId("64f000000000000000000302");


////////////////////////////////////////////////////////////
// COMMAND QUEUE RECORD 1
////////////////////////////////////////////////////////////

/*
    Shape based on actual neatMon commandQueue documents:

        _id
        guid
        short_id
        requestedBy
        username
        executed
        command
        created
        updatedAt
        __v

    executed remains empty until the node acknowledges
    the command.
*/

db.commandQueue.updateOne(
    {
        _id: DEV_COMMAND_ID_1
    },
    {
        $setOnInsert: {

            _id: DEV_COMMAND_ID_1,

            guid: DEV_GUID,

            short_id:
                DEV_COMMAND_ID_1.toString().slice(-5),

            requestedBy: DEV_USERNAME,

            username: DEV_USERNAME,

            executed: "",

            command: {

                cfg: {

                    htp: {
                        syn: NumberInt(120)
                    },

                    gen: {
                        slp: NumberInt(3)
                    }
                }
            },

            created: new Date(),

            updatedAt: new Date(),

            __v: NumberInt(0)
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// COMMAND QUEUE RECORD 2
////////////////////////////////////////////////////////////

db.commandQueue.updateOne(
    {
        _id: DEV_COMMAND_ID_2
    },
    {
        $setOnInsert: {

            _id: DEV_COMMAND_ID_2,

            guid: DEV_GUID,

            short_id:
                DEV_COMMAND_ID_2.toString().slice(-5),

            requestedBy: DEV_USERNAME,

            username: DEV_USERNAME,

            executed: "",

            command: {

                cfg: {

                    htp: {
                        syn: NumberInt(300)
                    },

                    gen: {
                        slp: NumberInt(5)
                    }
                }
            },

            created: new Date(),

            updatedAt: new Date(),

            __v: NumberInt(0)
        }
    },
    {
        upsert: true
    }
);


////////////////////////////////////////////////////////////
// SUMMARY
////////////////////////////////////////////////////////////

print("");
print("==============================================");
print(" neatMon MongoDB initialization complete");
print("==============================================");
print("");

print("Collections:");

print("  " + DATA_COLLECTION);
print("  deviceApiRequestsCache");
print("  devices");
print("  organizations");
print("  sensors");
print("  formulas");
print("  controlQueue");
print("  commandQueue");

print("");

print("Development organization:");
print("  " + DEV_ORG_NAME);

print("");

print("Development device:");
print("  " + DEV_GUID);

print("");

print("Seeded:");

print("  1 organization");
print("  1 device");
print("  1 optional sensor definition");
print("  2 calibration formulas");
print("  2 pending control queue records");
print("  2 pending command queue records");

print("");

print("Sensor provisioning:");
print("  Sensor definitions do not need to be created manually.");
print("  The ingestion worker creates new sensor definitions");
print("  automatically when new node sensor/data types arrive.");

print("");

print("Initialization complete.");
print("");