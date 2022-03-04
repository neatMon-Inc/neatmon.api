/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config(); // Get env variables
const axios = require("axios"); // HTTP Client
const Express = require("express");
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
const fetch = require('isomorphic-fetch')

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
app.use(BodyParser.urlencoded({ extended: true }));
app.use(BodyParser.json());
app.use(BodyParser.raw());

var database, collection;

//////////////////////////////////////////////////////////
//// POST METHODS                                   //////
//////////////////////////////////////////////////////////
app.post("/api/device/:id", (request, response) => {


    m_guid = request.body.GUID;
    if (m_guid != request.params.id) return response.status(500).send("Bad request"); //fail

    console.log("Received new request: " + request.body);
    m_hw_id = request.body.HW;
    m_fw_id = request.body.FW;
    m_vals_1 = request.body.VAL.SM5;
    m_vals_2 = request.body.VAL.SM15;
    m_vals_3 = request.body.VAL.SM25;
    m_vals_4 = request.body.VAL.SM35;
    m_vals_5 = request.body.VAL.SM45;
    m_vals_6 = request.body.VAL.SM55;
    m_vals_7 = request.body.VAL.SM65;
    m_vals_8 = request.body.VAL.SM75;
    m_vals_9 = request.body.VAL.SM85;
    m_vals_batt = request.body.VAL.BATT;
    m_vals_signal = request.body.VAL.DB;


    // for (var ikey of Object.keys(request.body.VAL))
    // {
    //     console.log(ikey + "->" + request.body.VAL[ikey]);

    // }

    // Use the server time for now
    var now = new Date(); // Get the date/time
    var m_date = new Date(now.toISOString()); // Convert to ISO format

    const doc =
    {
        "GUID": m_guid,
        "HW": m_hw_id,
        "FW": m_fw_id,
        "VAL": {
            "SM5": m_vals_1,
            "SM15": m_vals_2,
            "SM25": m_vals_3,
            "SM35": m_vals_4,
            "SM45": m_vals_5,
            "SM55": m_vals_6,
            "SM65": m_vals_7,
            "SM75": m_vals_8,
            "SM85": m_vals_9,
            "BATT": m_vals_batt,
            "DB": m_vals_signal,
            "Date": m_date
        }
    }

    var remotePushResponse;
    // HTTP push to remote
    axios
        .post('https://data-streams-api.azurewebsites.net/stream', doc)
        .then(axios_res => {
            console.log(`statusCode: ${axios_res.status}`);
            var responseText = axios_res.data;
            console.log(responseText);
            // console.log(Object.keys(axios_res)); // list the keys of the response
            remotePushResponse = "Remote res ID: " + responseText;
            // return response.send(axios_res.status);
        })
        .catch(error => {
            console.error(error);
            return response.send(error);
        });

    // Insert adds the _id to the doc.
    collection.insertOne(doc, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        console.log("Insert db _id:" + result.insertedId);
        var combinedResponse = remotePushResponse + " local insert ID: " + result.insertedId;
        return response.send(combinedResponse);
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