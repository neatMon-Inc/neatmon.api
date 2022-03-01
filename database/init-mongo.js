/*
    Description: Used to setup the database and the collection names used by the server
    Author: neatMon, Inc.
    License: MIT
*/

const DATABASE_NAME = 'neatmon';
const DATABASE_COLLECTION = 'device-data';

//////////////////////////////////////////////
//// SETUP DATABASE                       ////
//////////////////////////////////////////////
db = new Mongo().getDB(DATABASE_NAME);

//////////////////////////////////////////////
//// CREATE A COLLECTION                //////
//////////////////////////////////////////////
db.createCollection('device-data', { capped:true, size:3000000000 });