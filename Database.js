const e = require('express');
const { MongoClient, ObjectID, MongoDBNamespace } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v3.6+ - [API Documentation](http://mongodb.github.io/node-mongodb-native/3.6/api/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(
			mongoUrl,
			{
				useNewUrlParser: true
			},
			(err, client) => {
				if (err) reject(err);
				else {
					console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
					resolve(client.db(dbName));
				}
			}
		)
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatrooms from `db`
			 * and resolve an array of chatrooms */
            // Promise.resolve(db.collection("chatrooms").find({}).toArray());
			const collection = db.collection("chatrooms");
			collection.find().toArray().then(arr => resolve(arr));
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatroom from `db`
			 * and resolve the result */
			const collection = db.collection("chatrooms");
			let fields = {};
			if (ObjectID.isValid(room_id)) {
				fields = {"_id": {$in: [room_id, ObjectID(room_id)]}};
			} else {
				fields = {"_id": room_id};
			}

			collection.find(fields).toArray().then(arr => {
				if (arr.length == 0) {
					resolve(null);
				} else if (arr.length > 1) {
					if (typeof(arr[0]._id) == "string") {
						arr.shift();
					}
				}
				resolve(arr[0]);
			});
		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			/* TODO: insert a room in the "chatrooms" collection in `db`
			 * and resolve the newly added room */
			if (!room.name) {
				reject(new Error());
			} else {
				const collection = db.collection("chatrooms");
				let insertedRoom = room;
				collection.insertOne(room, function(err, newRoom) {
					insertedRoom = newRoom;
				});
				resolve(insertedRoom);
			}
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read a conversation from `db` based on the given arguments
			 * and resolve if found */
			if (!before) {
				before = Date.now();
			} else {
				before = parseInt(before);
			}
			const collection = db.collection("conversations");
			collection.find({
				"room_id": room_id,
				"timestamp": {$lt: before}
			}).toArray().then(arr => {
				if (arr.length == 0) {
					resolve(null);
				} else {
					arr.sort((a, b) => b.timestamp - a.timestamp);
					resolve(arr[0]);
				}
			});
		}) 
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: insert a conversation in the "conversations" collection in `db`
			 * and resolve the newly added conversation */
			if (!conversation.room_id || !conversation.timestamp || !conversation.messages) {
				reject(new Error());
			} else {
				const collection = db.collection("conversations");
				let insertedConvo = conversation;
				collection.insertOne(conversation, function(err, convo) {
					insertedConvo = convo; 
				});
				resolve(insertedConvo);
			}
		})
	)
}

Database.prototype.getUser = function(username) {
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			const collection = db.collection("users");
			collection.find({"username": username}).toArray().then(arr => {
				if (arr) {
					resolve(arr[0]);
				} else {
					resolve(null);
				}
			});
		})
	)
}

module.exports = Database;