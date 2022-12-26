const path = require('path');
const fs = require('fs');
const express = require('express');
const ws = require('ws');
const Database = require('./Database.js');
const SessionManager = require('./SessionManager.js');
const crypto = require('crypto');
const { request } = require('express');

let sessionManager = new SessionManager();

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

/* Assignment 4 */
let db = new Database("mongodb://localhost:27017", "web-messenger");

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug

app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

app.use("/chat/:room_id/messages", sessionManager.middleware);
app.use("/chat/:room_id", sessionManager.middleware);
app.use("/chat", sessionManager.middleware);					
app.use("/profile", sessionManager.middleware);					
app.use("/app.js", sessionManager.middleware);
app.use("/index.html", sessionManager.middleware);
app.use("/index", sessionManager.middleware);
app.use(express.static("client/login.html"));
app.get("/", sessionManager.middleware);						
app.use('/', express.static(clientApp, { extensions: ['html'] }));

app.route("/chat/:room_id/messages")
	.get((req, res, next) => {
		db.getLastConversation(req.params["room_id"], req.query.before).then(convo => {
			res.send(convo);
		});
	});

app.route("/chat/:room_id")
	.get((req, res, next) => {
		db.getRoom(req.params["room_id"]).then(room => {
			if (room) {
				res.send(room);
			} else {
				res.status(404).send(`Room ${req.params["room_id"]} was not found`);	
			}
		});
	});

app.route("/chat")
	.get((req, res, next) => {
		let responseArr = [];
		db.getRooms().then(arr => {
			arr.forEach(room => {
				let newRoom = room;
				if (!messages[room._id]) {
					messages[room._id] = [];
				}
				newRoom["messages"] = messages[room._id];
				responseArr.push(newRoom);
			});
			res.send(responseArr);
		});
	})
	.post((req, res, next) => {
		if (req.body.name) {
			db.addRoom(req.body).then(newRoom => {
				messages[newRoom["_id"]] = [];
				res.json(newRoom);
			});
		} else {
			res.status(400).send("bro put on a name tag pls")
		}
	});

app.route("/profile")
	.get((req, res, next) => {
		res.json({"username": req.username});
	})

app.route("/login")
	.post((req, res, next) => {
		db.getUser(req.body.username).then(user => {
			if (user && isCorrectPassword(req.body.password, user.password)) {
				sessionManager.createSession(res, user.username);
				res.redirect("/")
			} else {
				res.redirect("/login");
			}
		})
	})

app.route("/logout")
	.get((req, res, next) => {
		sessionManager.deleteSession(req);
		res.redirect("/login");
	})

app.use((err, req, res, next) => {
	if (err instanceof SessionManager.Error) {
		if (req.headers.accept === "application/json") {
			res.status(401).send(err.message);
		} else {
			res.redirect("/login");
		}
	} else {
		res.status(500).send();
	}
});

let isCorrectPassword = function(password, saltedHash) {
	let buf = Buffer.from(saltedHash);
	const hash = crypto.createHash('sha256').update(password.concat(saltedHash.substring(0, 20))).digest('base64');
	return hash === buf.toString('ascii').substring(20);
}

let messages = {};
db.getRooms().then(arr => {
	arr.forEach(room => {messages[room._id] = []});
});

let messageBlockSize = 10;

let broker = new ws.WebSocketServer({port: 4000});
broker.on('connection', (ws, req) => {
	// cookie string parse out username
	let user;
	if (!req.headers.cookie || req.headers.cookie.length < 512) {
		ws.close();
	} else {
		let arr = req.headers.cookie.split("; ");
		let token;
		let name = "session=";
		arr.forEach(cookie => {
			if (cookie.indexOf("session=") == 0) {
				token = cookie.substring(req.headers.cookie.indexOf("session=") + name.length);
			}
		})
		user = sessionManager.getUsername(token);
	}

	ws.on('message', (data, isBinary) => {
		let JSONdata = JSON.parse(data);
		JSONdata.text = JSONdata.text.replace(/</g, escape("<")).replace(/>/g, escape(">"));
		JSONdata.username = user;
		broker.clients.forEach((client) => {
			if (client !== ws) {
				// client.send(data, {binary: isBinary});
				client.send(JSON.stringify(JSONdata));
			}
		});
		if (messages[JSONdata.roomId]) {
			messages[JSONdata.roomId].push({"username": user, "text": JSONdata.text});
		} else {
			messages[JSONdata.roomId] = [{"username": user, "text": JSONdata.text}];
		}

		if (messages[JSONdata.roomId].length == messageBlockSize) {
			db.addConversation({
				"room_id": JSONdata.roomId,
				"timestamp": Date.now(),
				"messages": messages[JSONdata.roomId]
			}).then(convo => messages[JSONdata.roomId] = []);
		}
	})
})
