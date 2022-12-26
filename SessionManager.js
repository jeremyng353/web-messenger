const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager() {
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        let sessionToken = crypto.randomBytes(256).toString('hex');

        let session = {
            "username": username,
        }
        sessions[sessionToken] = session;

        response.cookie("session", sessionToken, {maxAge: maxAge});

        setTimeout(() => {
            delete sessions[sessionToken];
        }, maxAge)
	};

	this.deleteSession = (request) => {
        delete sessions[request.session];
		delete request.username;
        delete request.session;
	};

	this.middleware = (request, response, next) => {
		if (!request.headers.cookie) {
            next(new SessionError());
        } else {
            let arr = request.headers.cookie.split("; ");
            let token;
            let name = "session=";
            arr.forEach(cookie => {
                if (cookie.indexOf("session=") == 0) {
                    token = cookie.substring(request.headers.cookie.indexOf("session=") + name.length);
                }
            })

            if (!sessions[token]) {
                next(new SessionError());
            } else {
                request["username"] = sessions[token].username;
                request["session"] = token;
                next();
            }
        }
	};

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;