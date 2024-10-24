require('dotenv').config({});
const bull = require('bull');
const { json } = require('express');
const axios = require('axios');
const ObjectId = require('bson').ObjectId
let database, collection;
console.log('Starting up worker queue...')
const queue = new bull('data-queue', 'redis://redis:6379');
console.log('Queue started!')
const MongoClient = require("mongodb").MongoClient;
FROM_NEATMON_IO = process.env.FROM_NEATMON_IO
CONNECTION_URL = process.env.MONGO_URL;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION_DATA;
const DATABASE_CONFIG = process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;

async function connectToDatabase() {
    console.log("Connecting to database");
    try {
        const client = await MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true })
        database = client.db(DATABASE_NAME);
        console.log(DATABASE_COLLECTION);
        collection = database.collection(DATABASE_COLLECTION); // data storage

        unit_configuration = database.collection(DATABASE_CONFIG); // password storage
        console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_CONFIG + ", " + DATABASE_COLLECTION + "`!");
    }
    catch (e) {
        throw e
    }
}

queue.process(async (job, done) => {
    if (!database || !collection) {
        console.log('Re-establishing connection to database...')
        await connectToDatabase();
    }
    const metadataSet = new Set()
    try {
        console.log("Worker Started Job")
        console.log(job.data)
        const timestamps = []
        let docArray = [];
        let locationUpdate = ''
        let fw = job.data.fw
        let hw = job.data.hw
        let pn = job.data.pn
        let body = job.data.body
        let length = job.data.length
        let now = job.data.now

        if (now != null && length != null) {
            const date = new Date(now)
            const id = new ObjectId()
            docArray.push({
                metadata: {
                    id: id,
                    guid: job.data.guid,
                    sensor: 'sys',
                    type: 'bytes',
                },
                timestamp: date,
                data: parseInt(length),
            })
            metadataSet.add(JSON.stringify({
                guid: job.data.guid,
                sensor: 'sys',
                node: 'bytes',
                nodeType: 'singular',
                alias: [''],
            }))
        }

        // NOTE: Currently unknown if this is better in the post funciton or in this worker
        // // START CONTROL/CONFIG COLLECTIONS UPDATE
        // // Check for control request responses
        // const controlsExecuted = body.ctrl;
        // // Set timestamp executed for each control in the controlQueue
        // // Adding a timestamp prevents the control from being being sent again
        // if (controlsExecuted && Object.keys(controlsExecuted).length > 0) {
        //     // if (body.cmd.stat > 0) { // TODO: Double check if this is not nexted in each control object
        //         console.log("Control Record(s): ");
        //         controlsExecuted.forEach((ctrlResp) => {
        //             // Get data to update database
        //             const controlShortId = ctrlResp.id;                 // last 5 digits of the event id for object
        //             const controlDate= new Date (ctrlResp.ts * 1000);   // timestamp of when the control was set
        //             const controlStat = ctrlResp.stat;                  // acknowledgement of the control

        //             console.log("\tShort Object ID " + controlShortId);
        //             console.log("\t\tDate    \t" + controlDate);
        //             console.log("\t\tStatus  \t" + controlStat);

        //             // Search for the control object in the database for record with matching short id and guid
        //             console.log("Searching for data base record with short id " + controlShortId + " and guid " + job.data.guid);
        //             database.collection('controlQueue').updateOne({
        //                 short_id: controlShortId,
        //                 guid: job.data.guid
        //             }, {
        //                 $set: {
        //                     // executed: controlDate,
        //                     stat: controlStat
        //                 }
        //             });
        //         });
        //     // }
        // }

        // // Check for command request responses
        // const commandExecuted = body.cfg;
        // // Set timestamp executed for each command in the commandQueue
        // // Adding a timestamp prevents the command from being being sent again
        // if (commandExecuted && Object.keys(commandExecuted).length > 0) {
        //     if (body.cfg.stat > 0) {
        //         console.log("Command Record(s): ");
        //         const commandShortId = commandExecuted.id;                 // last 5 digits of the event id for object
        //         const commandDate= new Date (commandExecuted.ts * 1000);   // timestamp of when the command was set
        //         const commandStat = commandExecuted.stat;                  // acknowledgement of the command

        //         console.log("\tShort Object ID " + commandShortId);
        //         console.log("\t\tDate    \t" + commandDate);
        //         console.log("\t\tStatus  \t" + commandStat);

        //         // Search for the command object in the database for record with matching short id and guid
        //         console.log("Searching for data base record with short id " + commandShortId + " and guid " + job.data.guid);
        //         database.collection('commandQueue').updateOne({
        //             short_id: commandShortId,
        //             guid: job.data.guid
        //         }, {
        //             $set: {
        //                 executed: commandDate,
        //                 stat: commandStat
        //             }
        //         });
        //     }
        // }
        // // END CONTROL/CONFIG COLLECTIONS UPDATE 
        
        console.log(job.data)
        Object.keys(job.data.v).forEach((sensor) => {
            if(sensor === 'sys'){
                job.data.v[sensor].forEach((entry) => {
                    const timestamp = entry.ts
                    timestamps.push(new Date(timestamp))
                    if (entry.rs != null && timestamp != null) { // Signal strength
                        const id = new ObjectId()
                        docArray.push({
                            metadata: {
                                id: id,
                                guid: job.data.guid,
                                sensor: sensor,
                                type: 'rssi',
                            },
                            timestamp: new Date(timestamp * 1000),
                            data: entry.rs,
                        })
                        metadataSet.add(JSON.stringify({
                            guid: job.data.guid,
                            sensor: sensor,
                            node: 'rssi',
                            nodeType: 'singular',
                            alias: [''],
                        }))
                    }
                    if (entry.sq != null && timestamp != null) { // Signal quality
                        const id = new ObjectId()
                        docArray.push({
                            metadata: {
                                id: id,
                                guid: job.data.guid,
                                sensor: sensor,
                                type: 'rsrq',
                            },
                            timestamp: new Date(timestamp * 1000),
                            data: entry.sq,
                        })
                        metadataSet.add(JSON.stringify({
                            guid: job.data.guid,
                            sensor: sensor,
                            node: 'rsrq',
                            nodeType: 'singular',
                            alias: [''],
                        }))
                    }
                    if (entry.loc) { // GPS location
                        if (entry.loc[0] != null && entry.loc[1] != null && entry.loc[2] != null) {
                            locationUpdate = JSON.stringify({
                                lat: entry.loc[0],
                                long: entry.loc[1],
                                altitude: entry.loc[2],
                            })
                        }
                    }
                })
            }else{
                job.data.v[sensor].forEach((entry) => {
                    const timestamp = entry.ts
                    timestamps.push(new Date(timestamp))
                    Object.keys(entry).forEach((type) => {
                        if(type !== 'ts'){
                            if(typeof entry[type] === 'object' && entry[type] !== null){
                                entry[type].forEach((dataPoint, index) => {
                                    const id = new ObjectId()
                                    docArray.push({
                                        metadata: {
                                            id: id,
                                            guid: job.data.guid,
                                            sensor: sensor,
                                            type: type + ':' + index,
                                        },
                                        timestamp: new Date(timestamp * 1000),
                                        data: dataPoint
                                    })
                                })
                                if (entry[type].length > 0) {
                                    metadataSet.add(JSON.stringify({
                                        guid: job.data.guid,
                                        sensor: sensor,
                                        node: type,
                                        nodeType: 'array',
                                        alias: Array(entry[type].length).fill(""),
                                    }))
                                }
                            }else{
                                metadataSet.add(JSON.stringify({
                                    guid: job.data.guid,
                                    sensor: sensor,
                                    node: type,
                                    nodeType: 'singular',
                                    alias: [''],
                                }))
                                if (entry[type] === null)
                                    console.log('Entry is null, inserting anyways...')
                                const id = new ObjectId()
                                docArray.push({
                                    metadata: {
                                        id: id,
                                        guid: job.data.guid,
                                        sensor: sensor,
                                        type: type,
                                    },
                                    timestamp: new Date(timestamp * 1000),
                                    data: entry[type]
                                })
                            }
                        }
                    })
                })
            }
        })       

        // START DATA FORWARDING CODE
        console.log('Checking to see if data should be forwarded...')
        let device = await database.collection('devices').findOne({"serial": job.data.guid})
        if (device) {
            let organization = await database.collection('organizations').findOne({ "name": device.organizationName})
            if (organization) {
                if (organization.webService !== 'None') {
                    console.log('Data needs to be forwarded.')
                    if (organization.webAddress !== '' && organization.webAddress !== null && organization.webAddress !== undefined && organization.webAddress !== 'undefined') {

                        let newAddress = organization.webAddress
                        if (typeof newAddress == 'string' && newAddress.includes('%GUID%')) {
                            newAddress = newAddress.replace('%GUID%', job.data.guid)
                        }
                        console.log('Organization\'s forwarding address: ' + newAddress)

                        try{
                            let res = null;
            
                            if (organization.secretKey !== null && organization.secretKey !== undefined && organization.secretKey !== 'None' && organization.secretKey !== 'undefined' && organization.secretKey !== '') {
                                console.log('Secret key: ' + organization.secretKey)
                                console.log('Forwarding data...') 
                                res = await axios.post(newAddress, JSON.stringify(job.data.body), {
                                    "x-api-key": organization.secretKey,
                                    'Content-Type': 'application/json'
                                })
                            }
                            else {
                                console.log('No secret key found. Proceeding without it.')
                                console.log('Forwarding data...') 
                                res = await axios.post(newAddress, JSON.stringify(job.data.body), {
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                })
                            }
                            
                            let data = res.data;
                            if (res.status != 200) {
                                console.error('Forwarding failed.')
                            }
                            else {
                                console.log('Forwarding successful!')
                            }
                            console.log('DATA')
                            console.log(data);       
                        } catch(e){
                            console.log('Something went wrong when forwarding to webhook')
                            console.log(e)
                        }
                    }
                    else {
                        console.log('No forwarding address found. Continuing...')
                    }
                    
                }
                else {
                    console.log('Data does not need to be forwarded. Continuing...')
                }
            }
            else {
                console.error('Error finding organization from device in the database.')
                console.log(device)
            }
        }
        else {
            console.error('Error finding device in database for forwarding.')
            console.log(job.data)
        }
        // END DATA FORWARDING CODE

        const sensorArray = []
        // console.log('metadata set', metadataSet)
        const currSensors = await database.collection('sensors').find({guid: job.data.guid}).toArray()
        metadataSet.forEach( (metadata) => {
            const parsedData = JSON.parse(metadata)
            const dupeCheck = currSensors.findIndex((s) => {
                return s.guid === parsedData.guid && s.sensor === parsedData.sensor && s.node === parsedData.node
            })
            //console.log(dupeCheck)
            if(dupeCheck === -1) {
                sensorArray.push(parsedData)
            }
        })
        if(sensorArray.length > 0) {
            console.log('New sensor(s) to add', sensorArray)
            await database.collection('sensors').insertMany(sensorArray)
        }
        if (locationUpdate != '') {
            const location = JSON.parse(locationUpdate)
            const results = await database.collection('devices').updateOne({'serial': job.data.guid}, {
                $set: location
            })
            console.log(results)
            console.log(`Updated device location to ${location.lat}, ${location.long}, ${location.altitude}`)
        }
        if (fw || hw || pn) {
            let systemData = {}
            if (fw) 
                systemData.fw = fw
            if (hw)
                systemData.hw = hw
            if (pn)
                systemData.pn = pn

            console.log('Updating document with: ', systemData)

            const results = await database.collection('devices').updateOne({'serial': job.data.guid}, {
                $set: systemData,
            })
            console.log(results)
            console.log('Updates to device system information', systemData)
        }

        if (body.cfg) {
            // Add the configuration to the device's configuration array
            let deviceConfigObject = {}
            deviceConfigObject.date = new Date(now)
            deviceConfigObject.config = {}
            deviceConfigObject.config.network       = body.cfg.net
            deviceConfigObject.config.modem         = body.cfg.mod
            deviceConfigObject.config.general       = body.cfg.gen
            deviceConfigObject.config.numSensors    = body.cfg.numSens
            deviceConfigObject.config.sensors       = body.cfg.sens

            const results = await database.collection('devices').updateOne({'serial': job.data.guid}, {
                $push: {deviceConfigs: deviceConfigObject}
            })

            console.log(results)
            console.log('Updates to device configuration information', deviceConfigObject)
        }

        // This block of code filters out duplicate data
        const promises = docArray.map(async(doc) => {
            const check = await collection.findOne({
                'metadata.guid': doc.metadata.guid,
                'metadata.sensor': doc.metadata.sensor,
                'metadata.type': doc.metadata.type,
                'timestamp': doc.timestamp,
            })
            return {
                value: doc,
                include: check == null
            }
        })
        const data_with_includes = await Promise.all(promises)
        const filtered_data_with_includes = data_with_includes.filter(v => v.include)
        const filtered_docs = filtered_data_with_includes.map(data => data.value)

        console.log('filtered_docs', filtered_docs)

        if (filtered_docs.length > 0) {
            await collection.insertMany(filtered_docs, (error, result) => {
                console.log(result)
                if(result !== undefined){

                    Object.values(result.insertedIds).forEach((id) => {
                        console.log("Insert db _id:" + id);
                    })
                    // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
                    let combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
                    
                    let json = JSON.parse(combinedResponse);
                } else {
                    console.log("Empty data object, nothing was inserted.")
                }
            });
        }
        console.log("Worker Finished")
        done()
    }
    catch (e) {
        console.log('An error occurred at some point during this job.')
        console.log('Job information:\n')
        console.log(JSON.stringify(job, null, 4))
        console.log('\nError that occurred:\n')
        console.log(e)
        console.log("Worker Finished")
        done()
    }
    
})