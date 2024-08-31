/*
    Description: Used to setup the database and the collection names used by the server
    Author: neatMon, Inc.
    License: MIT
*/

const DATABASE_NAME = 'neatmon_dev';
const DATABASE_COLLECTION = 'device-data';

//////////////////////////////////////////////
//// SETUP DATABASE                       ////
//////////////////////////////////////////////
db = new Mongo().getDB(DATABASE_NAME);

//////////////////////////////////////////////
//// CREATE A COLLECTION                //////
//////////////////////////////////////////////

// devicetimeseriesdatas is where all device data is stored
// the timeseries type of collection is specialized for data from IoT devices
// https://www.mongodb.com/docs/manual/core/timeseries-collections/
// note this requires version 5.0 or greater
db.createCollection(
    "devicetimeseriesdatas",
    {
       timeseries: {
          timeField: "timestamp",
          metaField: "metadata",
          granularity: "hours"
       }
    }
)

/**
 * To create a capped/cache collection that automatically purges data 
 * see the guide from MongoDB https://www.mongodb.com/docs/manual/core/capped-collections/create-capped-collection/#std-label-create-capped-collection-max-size
 * uncomment the function below, and comment out the createCollection above
 */
// db.createCollection(
//     "devicetimeseriesdatas",
//     {
//        timeseries: {
//           timeField: "timestamp",
//           metaField: "metadata",
//           granularity: "hours"
//        },
//        capped: true,
//        size: 100000,
//        max: 5000
//     }
// )