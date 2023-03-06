require('dotenv').config({})
const MongoClient = require("mongodb").MongoClient

CONNECTION_URL = process.env.MONGO_URL;
MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true}, (error, client) => {
    if (error) {
        throw error
    }
    database = client.db('neatmon_dev')
    database.collection('deviceresponses').insert({
        guid: '',
        key: '',
        payload: '',
        expirationDate: new Date(),
    })

});