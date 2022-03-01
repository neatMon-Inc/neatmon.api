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
CONNECTION_URL = process.env.MONGO_DATABASE_URI;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;

// Add the protocol to the connection URL
CONNECTION_URL = "mongodb://" + MONGO_DATABASE_EDITOR_USER + ":" + MONGO_DATABASE_EDITOR_PASSWORD + "@" + CONNECTION_URL + "/" + DATABASE_NAME;

console.log("DB string " + CONNECTION_URL);

var app = Express();

app.use(BodyParser.json());
app.use(BodyParser.urlencoded({ extended: true }));

var database, collection;

//////////////////////////////////////////////////////////
//// POST METHODS                                   //////
//////////////////////////////////////////////////////////
app.post("/api/device/:id", (request, response) => {
    // Test insert with random data
    var now = new Date();
    m_date = new Date(now.toISOString()); // For some reason this extra step is required.
    var m_guid = "437870dc-0984-492f-91c4-42c007621de6";
    const doc = 
    {
        "GUID": m_guid,
        "HW": "2.02",
        "FW": "1.12",
        "VAL": 
        {
            "SM6": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "SM12": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "SM18": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "SM24": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "SM36": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "SM48": [
                {
                    "SM": "0.00",
                    "ST": "17.7",
                    "SS": "2"
                }
            ],
            "BATT": "5.00",
            "DB": "-79",
            "Date": m_date
        }
    }
    // console.log(doc);
    // response.send(doc);

    collection.insert(doc, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        response.send(result);
    });
});

//////////////////////////////////////////////////////////
//// GET METHODS                                    //////
//////////////////////////////////////////////////////////
app.get("/api/status", (request, response) => {
    response.send("API Working " + Date());
});

/** GET: ID
 *  Description: Returns data for a given GUID passed as parameter to /api/device/
 **/

app.get("/api/device/:guid", (request, response) => {
    console.log("Received a data request for guid: " + request.params.guid);
    collection.findOne({ "_id": new ObjectId(request.params.guid) }, (error, result) => {
        if (error) {
            return response.status(500).send("Doesn't exist, or bad request");
            // return response.status(500).send(error);
        }
        response.send(result);
    });
});

/////////////////////////////////////////////////////////
/////   DATABASE CONNECTOR                          /////
/////////////////////////////////////////////////////////
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