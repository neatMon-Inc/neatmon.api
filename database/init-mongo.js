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
db.createUser({
    user: "mongodb-user",
    pwd: "mongodb-user-password",
    roles: [
        {
            role: "readWrite",
            db: "neatmon_dev"
        }
    ]
});

//////////////////////////////////////////////
//// CREATE A COLLECTION                //////
//////////////////////////////////////////////
// db.createCollection('device-data', { capped:true, size:3000000000 });

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