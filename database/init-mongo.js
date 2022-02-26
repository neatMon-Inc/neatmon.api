// Note the database connection parameters must be set such as with the /script/setConfig.base methods
// TODO: Need to setup environment variables
// const DATABASE_NAME = process.env.NEATMON_DATABASE_NAME;
// const DATABASE_COLLECTION = process.env.NEATMON_DATABASE_COLLECTION;
const DATABASE_NAME = "neatmon";
const DATABASE_COLLECTION = 'device-data';

const now = Date();

db = new Mongo().getDB(DATABASE_NAME);
db.createCollection(DATABASE_COLLECTION, { capped:true, size:3000000000 });
db.DATABASE_COLLECTION.insert([
    {
        "Database Status": "Initialized",
        "Date": now
    },
]);