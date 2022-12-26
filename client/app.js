// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

let profile = {
    "username": "Alice"
};

let index_html = `<div class="content">
<ul class="room-list">
<li>
              <a href="#/chat/0">A</a>
            </li>
</ul>
<div class="page-control">
  <input type="text">
  <button>Create Room</button>
</div>
</div>`;

let chat_html = `<div class="content">
<h4 class="room-name">RoomA</h4>
<div class="message-list">
  <div class="message">
    <span class="message-user">Joe</span>
    <span class="message-text">bruh</span>
  </div>
  <div class="message my-message">
    <span class="message-user">John</span>
    <span class="message-text">guh</span>
  </div>
</div>
<div class="page-control">
  <textarea class="text-send"></textarea>
  <button>Send</button>
</div>
</div>`;

let profile_html = `<div class="content">
<div class="profile-form">
  <div class="form-field">
    <label>Username</label>
    <input type="text">
  </div>
  <div class="form-field">
    <label>Password</label>
    <input type="password">
  </div>
  <div class="form-field">
    <label>Avatar Image</label>
    <input type="file">
  </div>
</div>
<div class="page-control">
  <button>Save</button>
</div>
</div>`;

class Room {
    constructor (id, name, image="assets/everyone-icon.png", messages=[]) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;

        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
        this.timestamp = Date.now();
    }

    addMessage(username, text) {
        let cleanText = text.replace(/</g, escape("<")).replace(/>/g, escape(">"));
        if (!cleanText || cleanText.trim() == "") {
            return;
        } else {
            let newMessage = {
                "username": username,
                "text": cleanText,
            };

            this.messages.push(newMessage);

            if (this.onNewMessage) {
                this.onNewMessage(newMessage);
            }
        }
        
    }

    addConversation(conversation) {
        this.messages = conversation.messages.concat(this.messages);
        this.onFetchConversation(conversation);
    }
}

let makeConversationLoader = function*(room) {
    let lastTimestamp = room.timestamp;
    while(room.canLoadConversation) {
        room.canLoadConversation = false;
        yield new Promise((resolve, reject) => {
            Service.getLastConversation(room.id, lastTimestamp).then(convo => {
                if (convo) {
                    lastTimestamp = convo.timestamp;
                    room.canLoadConversation = true;
                    room.addConversation(convo);
                    resolve(convo);
                }
                resolve(null);
            })
        });
    }
}

class Lobby {
    constructor () {
        this.rooms = {};
    }

    getRoom(roomId) {
        return this.rooms[roomId.toString()];
    }

    addRoom(id, name, image, messages) {
        let newRoom = new Room(id, name, image, messages);
        this.rooms[id.toString()] = newRoom;
        if (typeof this.onNewRoom !== "undefined") {
            this.onNewRoom(newRoom);
        }
    }
}

class LobbyView {
    constructor(lobby) {
        this.elem = createDOM(index_html);
        this.listElem = this.elem.querySelector("ul.room-list");
        this.inputElem = this.elem.querySelector("input[type=text]");
        this.buttonElem = this.elem.querySelector("button");
        this.lobby = lobby;

        this.redrawList();

        this.buttonElem.addEventListener("click", () => {
            Service.addRoom({
                "name": this.inputElem.value,
				"image": undefined
            }).then(response => {
                this.lobby.addRoom(response._id, response.name, response.image, response.message);
            });
        });

        let _self = this;
        this.lobby.onNewRoom = function(room) {
            _self.listElem.appendChild(createDOM(`<li>
                    <a href="#/chat/${room.id}">${room.name}</a>
                </li>`));
        }
    }

    redrawList() {
        emptyDOM(this.listElem);
        for (let roomId in this.lobby.rooms) {
            this.listElem.appendChild(createDOM(`<li>
            <a href="#/chat/${roomId}">${this.lobby.rooms[roomId].name}</a>
        </li>`));
        }
    }
}

class ChatView {
    constructor(socket) {
        this.elem = createDOM(chat_html);
        this.titleElem = this.elem.querySelector("h4");
        this.chatElem = this.elem.querySelector("div.message-list");
        this.inputElem = this.elem.querySelector("textarea");
        this.buttonElem = this.elem.querySelector("button");
        this.socket = socket;
        
        this.room = null;

        this.buttonElem.addEventListener("click", () => this.sendMessage());
        this.inputElem.addEventListener("keyup", (event) => {
            if (event.key == "Enter" && !event.shiftKey) {
                this.sendMessage();
            }
        });
        
        let _this = this;
        this.chatElem.addEventListener("wheel", (event) => {
            if (_this.chatElem.scrollTop == 0 && event.deltaY < 0 && _this.room.canLoadConversation) {
                _this.room.getLastConversation.next();
            }
        })
    }

    sendMessage() {
        if (this.room) {
            this.room.addMessage(profile.username, this.inputElem.value);
        }

        this.socket.send(JSON.stringify({
            "roomId": this.room.id,
            "text": this.inputElem.value
        }));
        
        this.inputElem.value = null;
    }

    setRoom(room) {
        this.room = room;
        this.titleElem.innerHTML = this.room.name;
        emptyDOM(this.chatElem);
        let _self = this;
        this.room.messages.forEach(message => {
            if (message.username == profile.username) {
                _self.chatElem.appendChild(createDOM(`<div class="message my-message">
                        <span class="message-user">${profile.username}</span>
                        <span class="message-text">${message.text}</span>
                    </div>`));
            } else {
                _self.chatElem.appendChild(createDOM(`<div class="message">
                        <span class="message-user">${message.username}</span>
                        <span class="message-text">${message.text}</span>
                    </div>`));
            }
        });

        this.room.onNewMessage = function(message) {
            message.text = message.text.replace(/</g, escape("<")).replace(/>/g, escape(">"));
            if (message.username == profile.username) {
                _self.chatElem.appendChild(createDOM(`<div class="message my-message">
                        <span class="message-user">${profile.username}</span>
                        <span class="message-text">${message.text}</span>
                    </div>`));
            } else {
                _self.chatElem.appendChild(createDOM(`<div class="message">
                        <span class="message-user">${message.username}</span>
                        <span class="message-text">${message.text}</span>
                    </div>`));
            }
        }

        this.room.onFetchConversation = function(conversation) {
            let curScrollHeight = _self.chatElem.scrollTop;
            let messageHeights = 0;
            conversation.messages.forEach(message => _self.chatElem.prepend(createDOM(`<div class="message">
                <span class="message-user">${message.username}</span>
                <span class="message-text">${message.text}</span>
            </div>`)));
            _self.chatElem.scrollTop = messageHeights - curScrollHeight;
        }
    }
}

class ProfileView {
    constructor() {
        this.elem = createDOM(profile_html);
    }
}

let main = function() {
    let lobby = new Lobby();

    let socket = new WebSocket("ws://localhost:4000");
    socket.addEventListener("message", (event) => {
        let data = JSON.parse(event.data);
        lobby.getRoom(data.roomId).addMessage(data.username, data.text);
    })

    Service.getProfile().then(obj => profile = obj);

    let lobbyView = new LobbyView(lobby);
    let chatView = new ChatView(socket);
    let profileView = new ProfileView();

    let renderRoute = function() {
        let page_elem = document.getElementById("page-view");
        let hash = window.location.hash;
        if (hash == "" || hash == "#/") {
            emptyDOM(page_elem);
            page_elem.appendChild(lobbyView.elem);
        } else if (hash.match(/(#\/chat)/)) {
            emptyDOM(page_elem);
            page_elem.appendChild(chatView.elem);
            if (lobby.getRoom(hash.substr(7))) {  
                chatView.setRoom(lobby.getRoom(hash.substr(7)));          
            }
        } else if (hash.match(/(#\/profile)/)) {
            emptyDOM(page_elem);
            page_elem.appendChild(profileView.elem);
        }
    };

    let refreshLobby = function () {
        Service.getAllRooms().then(data => {
            for (let i = 0; i < data.length; i++) {
                if (lobby.getRoom(data[i]._id)) {
                    lobby.getRoom(data[i]._id).name = data[i].name;
                    lobby.getRoom(data[i]._id).image = data[i].image;
                } else {
                    lobby.addRoom(data[i]._id, data[i].name, data[i].image, data[i].messages);
                }
            }
        });
        
    };

    renderRoute();
    refreshLobby();

    setInterval(refreshLobby, 5000);

    window.addEventListener("popstate", renderRoute);
}

window.addEventListener("load", main);

let Service = {
    "origin": window.location.origin,
    "getAllRooms": function() {
        return fetch(this.origin + "/chat").then(response => {
            if (response.ok) {
                return response.json();           
            } else {
                return response.text();
            }
        }).then(data => {
            if (typeof data === 'string') {
                throw new Error(data);
            } else {
                return data;
            }
        }).catch(err => Promise.reject(err));
    },

    "addRoom": function(data) {
        return fetch(this.origin + "/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }).then((response) => {
            if (response.ok) {
                return response.json();
            } else {
                return response.text();
            }
        }).then(data => {
            if (typeof data === 'string') {
                throw new Error(data);
            } else {
                return data;
            }
        }).catch(err => Promise.reject(err));
    },

    /* Assignment 4 */
    "getLastConversation": function(roomId, before) {
        return fetch(this.origin + `/chat/${roomId}/messages?before=${before}`).then(response => response.json());
    },

    "getProfile": function() {
        return fetch(this.origin + "/profile").then(response => response.json(response));
    } 
}