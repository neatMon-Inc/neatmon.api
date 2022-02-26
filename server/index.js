/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config();
const Express = require("express");
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

console.log("Setting up app.  Getting environment variables");

//  TODO: Need to setup environment variables
// const CONNECTION_URL = process.env.NEATMON_DATABASE_URI;
// const DATABASE_NAME = process.env.NEATMON_DATABASE_NAME;
// const DATABASE_COLLECTION = process.env.NEATMON_DATABASE_COLLECTION;
const DATABASE_NAME = "neatmon";
const DATABASE_COLLECTION = "device-data";
CONNECTION_URL = 'mongoDB'; // Docker host name for mongodb
// Add the protocol to the connection URL
CONNECTION_URL = "mongodb://" + CONNECTION_URL;

console.log("DB parameters set " + DATABASE_NAME + ":" + DATABASE_COLLECTION);

var app = Express();

app.use(BodyParser.json());
app.use(BodyParser.urlencoded({ extended: true }));

var database, collection;

//////////////////////////////////////////////////////////
//// POST METHODS 
/////////////////////////////////////////////////////////
app.post("/device", (request, response) => {
    collection.insert(request.body, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        response.send(result.result);
    });
});

app.post("/device/:id", (request, response) => {
    collection.insert(request.body, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        response.send(result.result);
    });
});

//////////////////////////////////////////////////////////
//// GET METHODS 
/////////////////////////////////////////////////////////
app.get("/api/status", (request, response) => {
    response.send("API Working " + Date());
});

/**GET:ID*/
app.get("/api/device/:id", (request, response) => {
    collection.findOne({ "_id": new ObjectId(request.params.id) }, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        response.send(result);
    });
});


app.listen(5000, () => {
    MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true }, (error, client) => {
        if (error) {
            throw error;
        }
        database = client.db(DATABASE_NAME);
        collection = database.collection(DATABASE_COLLECTION);
        console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_COLLECTION + "`!");
    });
});
